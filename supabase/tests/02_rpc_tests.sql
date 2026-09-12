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
-- Tope bajo para que el límite se alcance rápido en las pruebas.
update public.profiles set active_task_limit = 2 where id = :'W1';

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- Ids fijos a propósito: los bloques de prueba los usan literales, igual que
-- un navegador que tiene la lista vieja en pantalla y manda un id que ya
-- dejó de ser visible para quien lo manda.
insert into public.tasks (id, title, priority, created_by) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'Tarea A', 'high',   :'SUP'),
  ('bbbb0000-0000-0000-0000-00000000000b', 'Tarea B', 'medium', :'SUP'),
  ('cccc0000-0000-0000-0000-00000000000c', 'Tarea C', 'low',    :'SUP');
reset role;

-- =============================================================================
\echo '--- tomar sin sesión ---'
set role authenticated;
reset request.jwt.claim.sub;   -- el setup dejó una sesión abierta; la limpiamos
do $$
declare r jsonb;
begin
  r := public.claim_task('aaaa0000-0000-0000-0000-00000000000a');
  if r ->> 'code' <> 'no_session' then
    raise exception 'FALLO 1: sin JWT se pudo tomar una tarea (%)', r;
  end if;
end $$;
\echo 'OK 1: sin sesión no se toma nada'

-- =============================================================================
\echo '--- tomar una tarea disponible ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare
  r jsonb;
  v_task uuid;
  t public.tasks%rowtype;
begin
  v_task := 'aaaa0000-0000-0000-0000-00000000000a';
  r := public.claim_task(v_task);

  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 2: Beto no pudo tomar la Tarea A (%)', r;
  end if;

  select * into t from public.tasks where id = v_task;
  if t.status <> 'active' then raise exception 'FALLO 3: la tarea no quedó activa'; end if;
  if t.assignee_id <> '22222222-2222-2222-2222-222222222222' then
    raise exception 'FALLO 4: la tarea no quedó a nombre de quien la tomó';
  end if;
  if t.assignment_kind <> 'claimed' then
    raise exception 'FALLO 5: se registró como asignada y fue tomada';
  end if;
  if t.assigned_at is null then raise exception 'FALLO 6: falta assigned_at'; end if;

  if not exists (
    select 1 from public.task_events e
    where e.task_id = v_task and e.type = 'claimed'
      and e.actor_id = '22222222-2222-2222-2222-222222222222'
  ) then
    raise exception 'FALLO 7: no se registró el evento de toma';
  end if;
end $$;
\echo 'OK 2-7: tomada, con dueño, marcada como tomada (no asignada) y con evento'

-- =============================================================================
\echo '--- el segundo llega tarde ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r jsonb;
begin
  r := public.claim_task('aaaa0000-0000-0000-0000-00000000000a');

  if (r ->> 'ok')::boolean is not false then
    raise exception 'FALLO 8: Carla también tomó la tarea de Beto';
  end if;
  if r ->> 'code' <> 'already_taken' then
    raise exception 'FALLO 9: el código devuelto fue "%" y no "already_taken"', r ->> 'code';
  end if;
end $$;
\echo 'OK 8-9: el segundo recibe already_taken, no un error genérico'

\echo '--- tarea inexistente ---'
do $$
declare r jsonb;
begin
  r := public.claim_task('00000000-0000-0000-0000-000000000000');
  if r ->> 'code' <> 'not_found' then
    raise exception 'FALLO 10: una tarea inexistente devolvió "%"', r ->> 'code';
  end if;
end $$;
\echo 'OK 10: tarea inexistente se distingue de tarea ya tomada'

-- =============================================================================
\echo '--- el límite de tareas activas ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  -- Beto ya tiene 1 de 2. La segunda entra.
  r := public.claim_task('bbbb0000-0000-0000-0000-00000000000b');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 11: no pudo tomar la segunda estando bajo el límite (%)', r;
  end if;

  -- La tercera no.
  r := public.claim_task('cccc0000-0000-0000-0000-00000000000c');
  if r ->> 'code' <> 'at_limit' then
    raise exception 'FALLO 12: pasó del límite, devolvió "%"', r ->> 'code';
  end if;
  if (r ->> 'limit')::int <> 2 or (r ->> 'active')::int <> 2 then
    raise exception 'FALLO 13: el mensaje de límite no trae los números (%)', r;
  end if;

  -- Y la tarea que rebotó sigue disponible para otro.
  if (select status from public.tasks where title = 'Tarea C') <> 'available' then
    raise exception 'FALLO 14: la tarea rechazada por el límite no quedó disponible';
  end if;
end $$;
\echo 'OK 11-14: el límite frena, informa los números y no consume la tarea'

-- =============================================================================
\echo '--- cerrar ---'
do $$
declare r jsonb; v_task uuid;
begin
  v_task := 'aaaa0000-0000-0000-0000-00000000000a';

  r := public.close_task(v_task, '  ');
  if r ->> 'code' <> 'note_required' then
    raise exception 'FALLO 15: se aceptó un cierre sin nota (%)', r ->> 'code';
  end if;

  r := public.close_task(v_task, repeat('x', 1001));
  if r ->> 'code' <> 'note_too_long' then
    raise exception 'FALLO 16: se aceptó una nota de más de 1000 caracteres';
  end if;
end $$;
\echo 'OK 15-16: la nota de cierre es obligatoria y acotada'

\echo '--- cerrar lo ajeno ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r jsonb;
begin
  r := public.close_task('aaaa0000-0000-0000-0000-00000000000a', 'Cierro yo');
  if r ->> 'code' <> 'not_yours' then
    raise exception 'FALLO 17: Carla cerró una tarea de Beto (%)', r ->> 'code';
  end if;
end $$;
\echo 'OK 17: un trabajador no cierra la tarea de otro'

\echo '--- cierre válido ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb; v_task uuid; t public.tasks%rowtype;
begin
  v_task := 'aaaa0000-0000-0000-0000-00000000000a';
  r := public.close_task(v_task, 'Rodamiento cambiado, quedó sin ruido.');

  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 18: no pudo cerrar su propia tarea (%)', r;
  end if;

  select * into t from public.tasks where id = v_task;
  if t.status <> 'closed' then raise exception 'FALLO 19: no quedó cerrada'; end if;
  if t.closed_at is null then raise exception 'FALLO 20: falta closed_at'; end if;
  if t.closing_note is null then raise exception 'FALLO 21: no se guardó la nota'; end if;
  -- El dueño se conserva: quién la hizo es parte del registro.
  if t.assignee_id is null then raise exception 'FALLO 22: se perdió quién la cerró'; end if;

  if not exists (
    select 1 from public.task_events e
    where e.task_id = v_task and e.type = 'closed'
      and e.note = 'Rodamiento cambiado, quedó sin ruido.'
  ) then
    raise exception 'FALLO 23: el evento de cierre no guardó la nota';
  end if;

  -- Cerrar dos veces no es idempotente en silencio: avisa.
  r := public.close_task(v_task, 'Otra vez');
  if r ->> 'code' <> 'not_active' then
    raise exception 'FALLO 24: se cerró una tarea ya cerrada (%)', r ->> 'code';
  end if;
end $$;
\echo 'OK 18-24: cierre con nota, evento, dueño conservado y sin doble cierre'

\echo '--- el supervisor sí puede cerrar lo ajeno ---'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb;
begin
  r := public.close_task('bbbb0000-0000-0000-0000-00000000000b',
                         'Cerrada por el supervisor: ya estaba hecha.');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 25: el supervisor no pudo cerrar la tarea de otro (%)', r;
  end if;
  -- El evento guarda a los dos: quién cerró y de quién era.
  if not exists (
    select 1 from public.task_events e
    where e.type = 'closed'
      and e.actor_id = '11111111-1111-1111-1111-111111111111'
      and e.subject_id = '22222222-2222-2222-2222-222222222222'
  ) then
    raise exception 'FALLO 26: el historial no distingue quién cerró de quién la tenía';
  end if;
end $$;
\echo 'OK 25-26: el supervisor cierra lo ajeno y el historial lo distingue'

-- =============================================================================
\echo '--- liberar el cupo ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  -- Beto cerró A y el supervisor cerró B: vuelve a tener cupo.
  r := public.claim_task('cccc0000-0000-0000-0000-00000000000c');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 27: cerrar no devolvió el cupo (%)', r;
  end if;
end $$;
reset role;
\echo 'OK 27: cerrar libera cupo para tomar otra'

\echo ''
\echo '========================================'
\echo '  27 pruebas de tomar/cerrar: PASARON'
\echo '========================================'
