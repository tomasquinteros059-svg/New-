#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Pruebas de concurrencia REAL: procesos separados, conexiones separadas,
# transacciones simultáneas de verdad. Lo que un test secuencial no puede probar.
#
# Se apoya en que run.sh ya dejó la base `cola` creada y migrada.
# -----------------------------------------------------------------------------
set -uo pipefail

PORT="${PGPORT_TEST:-5433}"
SOCK="${PGSOCK_TEST:-/tmp}"
Q() { psql -h "$SOCK" -p "$PORT" -U postgres -d cola -v ON_ERROR_STOP=1 -At "$@"; }

SUP='11111111-1111-1111-1111-111111111111'
W1='22222222-2222-2222-2222-222222222222'
W2='33333333-3333-3333-3333-333333333333'

fail() { echo "FALLO: $*" >&2; exit 1; }

echo '--- setup ---'
Q -q <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
  ('$SUP', 'sup@test.local', '{"full_name":"Ana"}'),
  ('$W1',  'w1@test.local',  '{"full_name":"Beto"}'),
  ('$W2',  'w2@test.local',  '{"full_name":"Carla"}');
update public.profiles set role = 'supervisor' where id = '$SUP';
update public.profiles set active_task_limit = 3 where id = '$W1';

insert into public.tasks (title, created_by)
select 'Tarea ' || lpad(g::text, 2, '0'), '$SUP' from generate_series(1, 20) g;
SQL

claim_as() { # $1 = uuid del usuario, $2 = uuid de la tarea
  Q -c "set role authenticated; set request.jwt.claim.sub = '$1'; select public.claim_task('$2');"
}


assign_as() { # $1 = supervisor, $2 = tarea, $3 = destinatario
  Q -c "set role authenticated; set request.jwt.claim.sub = '$1'; select public.assign_task('$2', '$3');"
}

# =============================================================================
echo
echo '--- A: dos personas, la misma tarea, al mismo tiempo ---'
TASK_A=$(Q -c "select id from public.tasks where title = 'Tarea 01';")

# El primero toma y se queda con la transacción abierta un segundo y medio.
(
  psql -h "$SOCK" -p "$PORT" -U postgres -d cola -At <<SQL > /tmp/conc_a1.out 2>&1
set role authenticated;
set request.jwt.claim.sub = '$W1';
begin;
select public.claim_task('$TASK_A');
select pg_sleep(1.5);
commit;
SQL
) &
PID1=$!

sleep 0.4   # el segundo llega con la tarea ya tomada pero sin confirmar
START=$(date +%s%N)
claim_as "$W2" "$TASK_A" > /tmp/conc_a2.out 2>&1
ELAPSED=$(( ($(date +%s%N) - START) / 1000000 ))
wait $PID1

R1=$(grep -o '"ok" *: *[a-z]*' /tmp/conc_a1.out | head -1)
R2=$(cat /tmp/conc_a2.out)

echo "    primero:  $R1"
echo "    segundo:  $R2"
echo "    el segundo esperó ${ELAPSED} ms al bloqueo del primero"

grep -q '"ok": true' /tmp/conc_a1.out || fail "el primero no pudo tomar la tarea"
echo "$R2" | grep -q '"code": "already_taken"' \
  || fail "el segundo no recibió already_taken, recibió: $R2"
[ "$ELAPSED" -gt 500 ] \
  || fail "el segundo no esperó al bloqueo (${ELAPSED} ms): la carrera no se está serializando"

FINAL=$(Q -c "select assignee_id from public.tasks where id = '$TASK_A';")
[ "$FINAL" = "$W1" ] || fail "la tarea quedó a nombre de quien llegó segundo"
echo 'OK A: gana el primero, el segundo espera al bloqueo y recibe already_taken'

# =============================================================================
echo
echo '--- B: la misma persona pide 6 tareas a la vez, con tope 3 ---'
# Si el conteo del límite no estuviera protegido por el bloqueo del perfil,
# las 6 contarían "0 activas" a la vez y entrarían las 6.
mapfile -t TASKS < <(Q -c "select id from public.tasks where title in ('Tarea 02','Tarea 03','Tarea 04','Tarea 05','Tarea 06','Tarea 07') order by title;")

rm -f /tmp/conc_b.*
i=0
for t in "${TASKS[@]}"; do
  i=$((i+1))
  claim_as "$W2" "$t" > "/tmp/conc_b.$i" 2>&1 &
done
wait

OKS=$(cat /tmp/conc_b.* | grep -c '"ok": true')
LIMITS=$(cat /tmp/conc_b.* | grep -c '"code": "at_limit"')
ACTIVE=$(Q -c "select count(*) from public.tasks where assignee_id = '$W2' and status = 'active';")

echo "    entraron: $OKS · rechazadas por límite: $LIMITS · activas en la base: $ACTIVE"

[ "$OKS" -eq 3 ]    || fail "entraron $OKS de 6 en vez de 3: el límite no aguanta concurrencia"
[ "$ACTIVE" -eq 3 ] || fail "la persona quedó con $ACTIVE tareas activas y su tope es 3"
[ "$LIMITS" -eq 3 ] || fail "se rechazaron $LIMITS por límite, esperaba 3"
echo 'OK B: exactamente 3 entran, 3 rebotan, nadie pasa su tope'

# =============================================================================
echo
echo '--- C: seis personas distintas por una sola tarea ---'
TASK_C=$(Q -c "select id from public.tasks where title = 'Tarea 08';")

Q -q <<SQL
insert into auth.users (id, email, raw_user_meta_data)
select ('aaaaaaaa-0000-0000-0000-00000000000' || g)::uuid,
       'r' || g || '@test.local',
       jsonb_build_object('full_name', 'Corredor ' || g)
from generate_series(1, 6) g;
SQL

rm -f /tmp/conc_c.*
for g in 1 2 3 4 5 6; do
  claim_as "aaaaaaaa-0000-0000-0000-00000000000$g" "$TASK_C" > "/tmp/conc_c.$g" 2>&1 &
done
wait

WINNERS=$(cat /tmp/conc_c.* | grep -c '"ok": true')
LOSERS=$(cat /tmp/conc_c.* | grep -c '"code": "already_taken"')
echo "    ganaron: $WINNERS · perdieron con already_taken: $LOSERS"

[ "$WINNERS" -eq 1 ] || fail "ganaron $WINNERS de 6: hay doble asignación"
[ "$LOSERS" -eq 5 ]  || fail "solo $LOSERS de 5 perdedores recibieron already_taken"
echo 'OK C: una sola persona se queda con la tarea, las otras cinco se enteran'

# =============================================================================
echo
echo '--- D: tomar contra asignar, la misma tarea ---'
# La carrera que aparece recién en la Fase 3: el trabajador toca "Tomar" en el
# mismo momento en que el supervisor se la está asignando a otro.
TASK_D=$(Q -c "select id from public.tasks where title = 'Tarea 09';")

Q -q <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-00000000000d', 'd1@test.local', '{"full_name":"Destinatario"}'),
  ('cccccccc-0000-0000-0000-00000000000c', 'c1@test.local', '{"full_name":"Apurado"}');
SQL

# El supervisor asigna y se queda con la transacción abierta un segundo y medio.
(
  psql -h "$SOCK" -p "$PORT" -U postgres -d cola -At <<SQL > /tmp/conc_d1.out 2>&1
set role authenticated;
set request.jwt.claim.sub = '$SUP';
begin;
select public.assign_task('$TASK_D', 'dddddddd-0000-0000-0000-00000000000d');
select pg_sleep(1.5);
commit;
SQL
) &
PIDD=$!

sleep 0.4
claim_as 'cccccccc-0000-0000-0000-00000000000c' "$TASK_D" > /tmp/conc_d2.out 2>&1
wait $PIDD

echo "    supervisor: $(grep -o '"ok": [a-z]*' /tmp/conc_d1.out | head -1)"
echo "    trabajador: $(cat /tmp/conc_d2.out)"

grep -q '"ok": true' /tmp/conc_d1.out || fail "la asignación no entró"
grep -q '"code": "already_taken"' /tmp/conc_d2.out \
  || fail "el trabajador no recibió already_taken: $(cat /tmp/conc_d2.out)"

OWNER=$(Q -c "select assignee_id from public.tasks where id = '$TASK_D';")
KIND=$(Q -c "select assignment_kind from public.tasks where id = '$TASK_D';")
[ "$OWNER" = 'dddddddd-0000-0000-0000-00000000000d' ] || fail "la tarea quedó a nombre de quien perdió"
[ "$KIND" = 'assigned' ] || fail "quedó marcada como '$KIND' y fue asignada"
echo 'OK D: la asignación gana, el que tocó "Tomar" se entera, y queda marcada como asignada'

# =============================================================================
echo
echo '--- E: cinco tareas, cinco carreras simultáneas de tomar contra asignar ---'
Q -q <<SQL
insert into auth.users (id, email, raw_user_meta_data)
select ('eeee0000-0000-0000-0000-00000000000' || g)::uuid,
       'e' || g || '@test.local', jsonb_build_object('full_name', 'Toma ' || g)
from generate_series(1, 5) g;
insert into auth.users (id, email, raw_user_meta_data)
select ('ffff0000-0000-0000-0000-00000000000' || g)::uuid,
       'f' || g || '@test.local', jsonb_build_object('full_name', 'Recibe ' || g)
from generate_series(1, 5) g;
SQL

rm -f /tmp/conc_e.*
for g in 1 2 3 4 5; do
  T=$(Q -c "select id from public.tasks where title = 'Tarea $((g + 9))';")
  claim_as  "eeee0000-0000-0000-0000-00000000000$g" "$T" > "/tmp/conc_e.claim.$g" 2>&1 &
  assign_as "$SUP" "$T" "ffff0000-0000-0000-0000-00000000000$g" > "/tmp/conc_e.assign.$g" 2>&1 &
done
wait

WINS=$(cat /tmp/conc_e.* | grep -c '"ok": true')
ACTIVE=$(Q -c "select count(*) from public.tasks where title in ('Tarea 10','Tarea 11','Tarea 12','Tarea 13','Tarea 14') and status = 'active';")
DOUBLE=$(Q -c "select count(*) from public.tasks where title in ('Tarea 10','Tarea 11','Tarea 12','Tarea 13','Tarea 14') and status = 'active' and assignee_id is null;")

echo "    diez intentos sobre cinco tareas · ganaron: $WINS · activas: $ACTIVE"
[ "$WINS" -eq 5 ]   || fail "ganaron $WINS de 10 intentos sobre 5 tareas"
[ "$ACTIVE" -eq 5 ] || fail "quedaron $ACTIVE tareas activas de 5"
[ "$DOUBLE" -eq 0 ] || fail "hay tareas activas sin dueño"
echo 'OK E: una sola operación gana por tarea, sin importar de qué lado venga'

echo
echo '========================================'
echo '  Concurrencia real: A, B, C, D y E PASARON'
echo '========================================'
