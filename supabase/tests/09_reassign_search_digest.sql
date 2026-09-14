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
update public.profiles set active_task_limit = 2 where id = :'W2';

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.tasks (id, title, description, priority, created_by) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'Revisar bomba 3',  'Ruido en el RODAMIENTO', 'high',   :'SUP'),
  ('bbbb0000-0000-0000-0000-00000000000b', 'Cambiar filtros',  'Los de 10 pulgadas',     'medium', :'SUP'),
  ('cccc0000-0000-0000-0000-00000000000c', 'Pintar la reja',   null,                     'low',    :'SUP');

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.claim_task('aaaa0000-0000-0000-0000-00000000000a');
  if (r ->> 'ok')::boolean is not true then raise exception 'setup: Beto no pudo tomar'; end if;
end $$;

-- =============================================================================
\echo '--- reasignar: quién puede y qué se rechaza ---'
do $$
declare r jsonb;
begin
  r := public.reassign_task('aaaa0000-0000-0000-0000-00000000000a',
                            '33333333-3333-3333-3333-333333333333', 'Porque quiero');
  if r ->> 'code' <> 'not_supervisor' then
    raise exception 'FALLO 1: un trabajador reasignó una tarea (%)', r ->> 'code';
  end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb;
begin
  r := public.reassign_task('aaaa0000-0000-0000-0000-00000000000a',
                            '33333333-3333-3333-3333-333333333333', '  ');
  if r ->> 'code' <> 'reason_required' then
    raise exception 'FALLO 2: reasignó sin motivo (%)', r ->> 'code';
  end if;

  -- Una tarea que está en la cola se asigna, no se reasigna.
  r := public.reassign_task('bbbb0000-0000-0000-0000-00000000000b',
                            '33333333-3333-3333-3333-333333333333', 'Un motivo');
  if r ->> 'code' <> 'not_active' then
    raise exception 'FALLO 3: reasignó una tarea de la cola (%)', r ->> 'code';
  end if;

  r := public.reassign_task('aaaa0000-0000-0000-0000-00000000000a',
                            '22222222-2222-2222-2222-222222222222', 'Un motivo');
  if r ->> 'code' <> 'same_person' then
    raise exception 'FALLO 4: reasignó a quien ya la tenía (%)', r ->> 'code';
  end if;

  r := public.reassign_task('aaaa0000-0000-0000-0000-00000000000a',
                            '00000000-0000-0000-0000-000000000000', 'Un motivo');
  if r ->> 'code' <> 'no_assignee' then
    raise exception 'FALLO 5: reasignó a alguien que no existe (%)', r ->> 'code';
  end if;
end $$;
\echo 'OK 1-5: solo el supervisor, con motivo, sobre una activa y a otra persona'

\echo '--- reasignar de verdad ---'
do $$
declare r jsonb; t public.tasks%rowtype; v_soltadas_antes int;
begin
  select count(*) into v_soltadas_antes from public.release_history();

  r := public.reassign_task('aaaa0000-0000-0000-0000-00000000000a',
                            '33333333-3333-3333-3333-333333333333',
                            'Beto quedó con licencia.');
  if (r ->> 'ok')::boolean is not true then raise exception 'FALLO 6: no pudo reasignar (%)', r; end if;
  if r ->> 'previous_name' <> 'Beto Trabajador' then
    raise exception 'FALLO 7: no dice de quién venía (%)', r;
  end if;
  if r ->> 'assignee_name' <> 'Carla Trabajadora' then
    raise exception 'FALLO 8: no dice a quién va';
  end if;

  select * into t from public.tasks where id = 'aaaa0000-0000-0000-0000-00000000000a';
  if t.assignee_id <> '33333333-3333-3333-3333-333333333333' then
    raise exception 'FALLO 9: la tarea no cambió de dueño';
  end if;
  if t.status <> 'active' then
    raise exception 'FALLO 10: la tarea pasó por la cola en el medio (quedó %)', t.status;
  end if;
  if t.assignment_kind <> 'assigned' then
    raise exception 'FALLO 11: no quedó marcada como asignada';
  end if;

  -- Y NO aparece como una soltada: nunca volvió a la cola.
  if (select count(*) from public.release_history()) <> v_soltadas_antes then
    raise exception 'FALLO 12: una reasignación se registró como soltada';
  end if;

  if not exists (
    select 1 from public.task_events e
    where e.task_id = 'aaaa0000-0000-0000-0000-00000000000a'
      and e.type = 'assigned'
      and e.subject_id = '33333333-3333-3333-3333-333333333333'
      and e.note like '%Beto Trabajador%'
      and e.note like '%licencia%'
  ) then
    raise exception 'FALLO 13: el historial no guarda de quién venía ni por qué';
  end if;
end $$;
\echo 'OK 6-13: cambia de manos sin pasar por la cola, y el historial lo explica'

\echo '--- la carga se mueve con la tarea ---'
do $$
declare beto record; carla record;
begin
  select * into beto  from public.team_load() where id = '22222222-2222-2222-2222-222222222222';
  select * into carla from public.team_load() where id = '33333333-3333-3333-3333-333333333333';
  if beto.active_count <> 0 then raise exception 'FALLO 14: a Beto le sigue contando (%)', beto.active_count; end if;
  if carla.active_count <> 1 then raise exception 'FALLO 15: a Carla no le contó (%)', carla.active_count; end if;
end $$;
\echo 'OK 14-15: descuenta de uno y suma al otro'

\echo '--- reasignar pasando el tope avisa, pero entra ---'
do $$
declare r jsonb;
begin
  -- Carla tiene 1 de 2. Le damos otra por asignación directa y queda al tope.
  r := public.assign_task('bbbb0000-0000-0000-0000-00000000000b',
                          '33333333-3333-3333-3333-333333333333');
  -- Y una tercera por reasignación: se pasa.
  r := public.assign_task('cccc0000-0000-0000-0000-00000000000c',
                          '22222222-2222-2222-2222-222222222222');
  r := public.reassign_task('cccc0000-0000-0000-0000-00000000000c',
                            '33333333-3333-3333-3333-333333333333', 'Beto sigue de licencia.');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 16: el tope frenó una reasignación, y debe ser blando (%)', r;
  end if;
  if (r ->> 'over_limit')::boolean is not true then
    raise exception 'FALLO 17: se pasó del tope y no avisó (%)', r;
  end if;
end $$;
\echo 'OK 16-17: misma regla que asignar — entra, pero lo dice'

-- =============================================================================
\echo '--- buscar en la cola ---'
reset role;
reset request.jwt.claim.sub;
update public.tasks set status = 'available', assignee_id = null,
       assignment_kind = null, assigned_at = null, available_since = now();

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare n int;
begin
  if (select count(*) from public.available_queue()) <> 3 then
    raise exception 'FALLO 18: sin búsqueda no trae las 3';
  end if;

  if (select count(*) from public.available_queue('bomba')) <> 1 then
    raise exception 'FALLO 19: no encuentra por título';
  end if;

  -- Por descripción, y sin importar mayúsculas.
  if (select count(*) from public.available_queue('rodamiento')) <> 1 then
    raise exception 'FALLO 20: no encuentra por descripción en minúsculas';
  end if;
  if (select count(*) from public.available_queue('PULGADAS')) <> 1 then
    raise exception 'FALLO 21: la búsqueda distingue mayúsculas';
  end if;

  if (select count(*) from public.available_queue('no existe nada así')) <> 0 then
    raise exception 'FALLO 22: inventa resultados';
  end if;

  -- Un comodín tipeado por alguien NO debe comportarse como comodín.
  if (select count(*) from public.available_queue('%')) <> 0 then
    raise exception 'FALLO 23: un "%%" en el buscador actúa como comodín y trae todo';
  end if;
  if (select count(*) from public.available_queue('_')) <> 0 then
    raise exception 'FALLO 24: un "_" en el buscador actúa como comodín';
  end if;

  -- Espacios en blanco es lo mismo que no buscar.
  if (select count(*) from public.available_queue('   ')) <> 3 then
    raise exception 'FALLO 25: buscar espacios no equivale a no buscar';
  end if;
end $$;
\echo 'OK 18-25: busca en título y descripción, sin comodines y sin importar mayúsculas'

\echo '--- el tope de filas no esconde el total ---'
do $$
declare r record;
begin
  select * into r from public.available_queue(null, 1);
  if (select count(*) from public.available_queue(null, 1)) <> 1 then
    raise exception 'FALLO 26: el límite no recorta';
  end if;
  if r.total_count <> 3 then
    raise exception 'FALLO 27: recortó a 1 y dice que el total es % ', r.total_count;
  end if;
end $$;
\echo 'OK 26-27: recorta las filas pero informa cuántas hay'

-- =============================================================================
\echo '--- qué tiene cada persona ---'
reset role;
reset request.jwt.claim.sub;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.claim_task('aaaa0000-0000-0000-0000-00000000000a');
  if (r ->> 'ok')::boolean is not true then raise exception 'setup: no pudo tomar'; end if;
end $$;

do $$
begin
  if (select count(*) from public.person_tasks('22222222-2222-2222-2222-222222222222')) <> 1 then
    raise exception 'FALLO 28: no ve sus propias tareas';
  end if;
  if (select count(*) from public.person_tasks('33333333-3333-3333-3333-333333333333')) <> 0 then
    raise exception 'FALLO 29: un trabajador ve lo que tiene otro';
  end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r record;
begin
  if (select count(*) from public.person_tasks('22222222-2222-2222-2222-222222222222')) <> 1 then
    raise exception 'FALLO 30: el supervisor no ve lo que tiene alguien';
  end if;
  select * into r from public.person_tasks('22222222-2222-2222-2222-222222222222') limit 1;
  if r.title is null or r.assigned_at is null then
    raise exception 'FALLO 31: no trae el contexto de la tarea';
  end if;
end $$;
\echo 'OK 28-31: cada uno ve lo suyo, el supervisor ve lo de todos'

-- =============================================================================
\echo '--- resumen diario ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.daily_digest();
  if r ->> 'code' <> 'not_supervisor' then
    raise exception 'FALLO 32: un trabajador pudo pedir el resumen (%)', r ->> 'code';
  end if;
end $$;

reset role;
reset request.jwt.claim.sub;
-- Envejecemos una de la cola y otra activa para que haya algo que reportar.
update public.tasks set available_since = now() - interval '30 hours'
where id = 'bbbb0000-0000-0000-0000-00000000000b';
update public.tasks set assigned_at = now() - interval '70 hours'
where id = 'aaaa0000-0000-0000-0000-00000000000a';

do $$
declare r jsonb;
begin
  -- Sin sesión: es el caso del trabajo programado.
  r := public.daily_digest();
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 33: el trabajo programado no pudo armar el resumen (%)', r;
  end if;

  if jsonb_array_length(r -> 'stale_available') <> 1 then
    raise exception 'FALLO 34: no listó la que nadie toma (%)', r -> 'stale_available';
  end if;
  if ((r -> 'stale_available' -> 0 ->> 'waiting_hours')::int) < 29 then
    raise exception 'FALLO 35: mal contadas las horas de espera (%)', r -> 'stale_available';
  end if;

  if jsonb_array_length(r -> 'stale_active') <> 1 then
    raise exception 'FALLO 36: no listó la que nadie cierra';
  end if;
  if (r -> 'stale_active' -> 0 ->> 'assignee') <> 'Beto Trabajador' then
    raise exception 'FALLO 37: no dice quién la tiene (%)', r -> 'stale_active';
  end if;

  if (r -> 'thresholds' ->> 'stale_available_hours')::int <> 12 then
    raise exception 'FALLO 38: no informa con qué umbrales se armó';
  end if;
  if (r -> 'totals' ->> 'active')::int < 1 then
    raise exception 'FALLO 39: los totales no cuadran (%)', r -> 'totals';
  end if;
end $$;
\echo 'OK 32-39: lo arma el trabajo programado, con horas, nombres y umbrales'

\echo '--- un resumen sin novedades no inventa listas ---'
reset role;
-- Por separado: poner assigned_at en una tarea disponible viola el CHECK de
-- coherencia de estado, y con razón.
update public.tasks set available_since = now() where status = 'available';
update public.tasks set assigned_at = now() where status = 'active';
do $$
declare r jsonb;
begin
  r := public.daily_digest();
  if jsonb_array_length(r -> 'stale_available') <> 0
     or jsonb_array_length(r -> 'stale_active') <> 0 then
    raise exception 'FALLO 40: reporta atrasos que no existen';
  end if;
  if (r -> 'over_limit') is null then
    raise exception 'FALLO 41: over_limit tiene que ser una lista vacía, no null';
  end if;
end $$;
\echo 'OK 40-41: sin atrasos, listas vacías y no null'

\echo ''
\echo '========================================'
\echo '  41 pruebas de reasignar, buscar y resumen: PASARON'
\echo '========================================'
