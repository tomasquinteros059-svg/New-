\set ON_ERROR_STOP on
\set SUP '11111111-1111-1111-1111-111111111111'
\set W1  '22222222-2222-2222-2222-222222222222'
\set W2  '33333333-3333-3333-3333-333333333333'

\echo '--- setup ---'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'SUP', 'sup@test.local', '{"full_name":"Ana Supervisora"}'),
  (:'W1',  'w1@test.local',  '{"full_name":"Beto Trabajador"}'),
  (:'W2',  'w2@test.local',  '{"full_name":"Carla Trabajadora"}');

update public.profiles set role = 'supervisor' where id = :'SUP';
update public.profiles set active_task_limit = 2 where id = :'W1';
update public.profiles set active_task_limit = 3, is_present = false where id = :'W2';

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.tasks (id, title, priority, created_by) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'Tarea A', 'high',   :'SUP'),
  ('bbbb0000-0000-0000-0000-00000000000b', 'Tarea B', 'medium', :'SUP'),
  ('cccc0000-0000-0000-0000-00000000000c', 'Tarea C', 'low',    :'SUP'),
  ('dddd0000-0000-0000-0000-00000000000d', 'Tarea D', 'low',    :'SUP');
reset role;

-- =============================================================================
\echo '--- asignar es solo del supervisor ---'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.assign_task('aaaa0000-0000-0000-0000-00000000000a',
                          '33333333-3333-3333-3333-333333333333');
  if r ->> 'code' <> 'not_supervisor' then
    raise exception 'FALLO 1: un trabajador pudo asignar (%)', r;
  end if;
  if (select status from public.tasks where id = 'aaaa0000-0000-0000-0000-00000000000a')
     <> 'available' then
    raise exception 'FALLO 2: la tarea cambió pese a que la asignación fue rechazada';
  end if;
end $$;
\echo 'OK 1-2: un trabajador no asigna, y nada se movió'

-- =============================================================================
\echo '--- asignación normal ---'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb; t public.tasks%rowtype;
begin
  r := public.assign_task('aaaa0000-0000-0000-0000-00000000000a',
                          '22222222-2222-2222-2222-222222222222');

  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 3: el supervisor no pudo asignar (%)', r;
  end if;
  if (r ->> 'over_limit')::boolean is not false then
    raise exception 'FALLO 4: dijo que se pasaba del límite con 1 de 2';
  end if;
  if r ->> 'assignee_name' <> 'Beto Trabajador' then
    raise exception 'FALLO 5: no devolvió a quién se le asignó';
  end if;

  select * into t from public.tasks where id = 'aaaa0000-0000-0000-0000-00000000000a';
  if t.status <> 'active' then raise exception 'FALLO 6: no quedó activa'; end if;
  if t.assignee_id <> '22222222-2222-2222-2222-222222222222' then
    raise exception 'FALLO 7: quedó a nombre de otro';
  end if;
  -- La distinción que pide la especificación: asignada se ve distinto de tomada.
  if t.assignment_kind <> 'assigned' then
    raise exception 'FALLO 8: se registró como tomada y fue asignada';
  end if;

  if not exists (
    select 1 from public.task_events e
    where e.task_id = 'aaaa0000-0000-0000-0000-00000000000a'
      and e.type = 'assigned'
      and e.actor_id = '11111111-1111-1111-1111-111111111111'
      and e.subject_id = '22222222-2222-2222-2222-222222222222'
  ) then
    raise exception 'FALLO 9: el historial no guarda quién asignó y a quién';
  end if;
end $$;
\echo 'OK 3-9: asignada, marcada como asignada, y el historial distingue quién y a quién'

-- =============================================================================
\echo '--- lo que no se puede asignar ---'
do $$
declare r jsonb;
begin
  r := public.assign_task('aaaa0000-0000-0000-0000-00000000000a',
                          '33333333-3333-3333-3333-333333333333');
  if r ->> 'code' <> 'not_available' then
    raise exception 'FALLO 10: se reasignó una tarea que alguien está haciendo (%)', r ->> 'code';
  end if;

  r := public.assign_task('00000000-0000-0000-0000-000000000000',
                          '22222222-2222-2222-2222-222222222222');
  if r ->> 'code' <> 'not_found' then
    raise exception 'FALLO 11: una tarea inexistente devolvió "%"', r ->> 'code';
  end if;

  r := public.assign_task('bbbb0000-0000-0000-0000-00000000000b',
                          '00000000-0000-0000-0000-000000000000');
  if r ->> 'code' <> 'no_assignee' then
    raise exception 'FALLO 12: se asignó a alguien que no existe (%)', r ->> 'code';
  end if;
  if (select status from public.tasks where id = 'bbbb0000-0000-0000-0000-00000000000b')
     <> 'available' then
    raise exception 'FALLO 13: la tarea se movió pese a que el destinatario no existe';
  end if;
end $$;
\echo 'OK 10-13: no se interrumpe lo que alguien hace, y los destinos inválidos no mueven nada'

-- =============================================================================
\echo '--- el límite es BLANDO para asignar ---'
do $$
declare r jsonb;
begin
  -- Beto tiene 1 de 2. La segunda lo deja al tope, sin pasarse.
  r := public.assign_task('bbbb0000-0000-0000-0000-00000000000b',
                          '22222222-2222-2222-2222-222222222222');
  if (r ->> 'over_limit')::boolean is not false then
    raise exception 'FALLO 14: dijo que se pasaba estando justo en el tope (%)', r;
  end if;

  -- La tercera sí se pasa: entra igual, pero avisa y con los números.
  r := public.assign_task('cccc0000-0000-0000-0000-00000000000c',
                          '22222222-2222-2222-2222-222222222222');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 15: el límite frenó una ASIGNACIÓN, y debe ser blando (%)', r;
  end if;
  if (r ->> 'over_limit')::boolean is not true then
    raise exception 'FALLO 16: se pasó del tope y no avisó';
  end if;
  if (r ->> 'active')::int <> 3 or (r ->> 'limit')::int <> 2 then
    raise exception 'FALLO 17: el aviso no trae los números reales (%)', r;
  end if;
end $$;
\echo 'OK 14-17: asignar se pasa del tope si hace falta, pero lo dice con números'

\echo '--- pero sigue siendo DURO para tomar ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.claim_task('dddd0000-0000-0000-0000-00000000000d');
  if r ->> 'code' <> 'at_limit' then
    raise exception 'FALLO 18: estando pasado de tope pudo TOMAR otra (%)', r ->> 'code';
  end if;
end $$;
\echo 'OK 18: la asimetría se sostiene — orden entra, decisión propia no'

\echo '--- asignar a alguien fuera de turno ---'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb;
begin
  r := public.assign_task('dddd0000-0000-0000-0000-00000000000d',
                          '33333333-3333-3333-3333-333333333333');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 19: no dejó asignar a alguien fuera de turno (%)', r;
  end if;
  if (r ->> 'not_present')::boolean is not true then
    raise exception 'FALLO 20: no avisó que la persona está fuera de turno';
  end if;
end $$;
\echo 'OK 19-20: se puede, pero el supervisor se entera'

-- =============================================================================
\echo '--- team_load: quién ve la foto del equipo ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  if (select count(*) from public.team_load()) <> 0 then
    raise exception 'FALLO 21: un trabajador ve la carga de todo el equipo';
  end if;
end $$;
\echo 'OK 21: para el trabajador, team_load devuelve cero filas'

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r record;
begin
  if (select count(*) from public.team_load()) <> 3 then
    raise exception 'FALLO 22: el supervisor no ve a las 3 personas';
  end if;

  select * into r from public.team_load() where id = '22222222-2222-2222-2222-222222222222';
  if r.active_count <> 3 then
    raise exception 'FALLO 23: Beto tiene 3 activas y la foto dice %', r.active_count;
  end if;
  if r.active_task_limit <> 2 then
    raise exception 'FALLO 24: no trae el tope de cada uno';
  end if;
  if r.oldest_active_at is null then
    raise exception 'FALLO 25: no dice desde cuándo tiene la más vieja abierta';
  end if;

  select * into r from public.team_load() where id = '11111111-1111-1111-1111-111111111111';
  if r.active_count <> 0 then
    raise exception 'FALLO 26: la supervisora no tiene tareas y la foto dice %', r.active_count;
  end if;

  select * into r from public.team_load() where id = '33333333-3333-3333-3333-333333333333';
  if r.is_present <> false then
    raise exception 'FALLO 27: no refleja que Carla está fuera de turno';
  end if;
end $$;
\echo 'OK 22-27: cuenta bien, trae el tope, la antigüedad y la presencia'

\echo '--- cerrar descuenta de la foto ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.close_task('aaaa0000-0000-0000-0000-00000000000a', 'Listo, quedó andando.');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 28: no pudo cerrar (%)', r;
  end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare n integer;
begin
  select active_count into n from public.team_load()
  where id = '22222222-2222-2222-2222-222222222222';
  if n <> 2 then
    raise exception 'FALLO 29: cerró una y la foto sigue diciendo %', n;
  end if;
end $$;
\echo 'OK 28-29: la carga baja sola al cerrar, sin contador que mantener'

-- =============================================================================
\echo '--- la tarea asignada llega a quien le toca, y a nadie más ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  if not exists (
    select 1 from public.tasks t
    where t.id = 'dddd0000-0000-0000-0000-00000000000d'
      and t.assignment_kind = 'assigned'
  ) then
    raise exception 'FALLO 30: a Carla no le llegó la tarea que le asignaron';
  end if;
  if exists (
    select 1 from public.tasks t
    where t.id = 'cccc0000-0000-0000-0000-00000000000c'
  ) then
    raise exception 'FALLO 31: Carla ve una tarea activa de Beto';
  end if;
end $$;
reset role;
\echo 'OK 30-31: le llega al destinatario y sigue oculta para el resto'

\echo ''
\echo '========================================'
\echo '  31 pruebas de asignación y carga: PASARON'
\echo '========================================'
