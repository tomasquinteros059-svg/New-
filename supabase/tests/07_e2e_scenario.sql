\set ON_ERROR_STOP on
-- =============================================================================
-- Un día de operación, de punta a punta.
--
-- No prueba funciones sueltas: recorre el recorrido completo y verifica el
-- estado después de cada paso. Es donde aparecen los errores de integración,
-- los que ninguna prueba unitaria ve.
-- =============================================================================

\set ANA   '11111111-1111-1111-1111-111111111111'
\set BETO  '22222222-2222-2222-2222-222222222222'
\set CARLA '33333333-3333-3333-3333-333333333333'
\set T_ALTA  'aaaa0000-0000-0000-0000-00000000000a'
\set T_MEDIA 'bbbb0000-0000-0000-0000-00000000000b'
\set T_BAJA  'cccc0000-0000-0000-0000-00000000000c'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'ANA',   'ana@test.local',   '{"full_name":"Ana Rojas"}'),
  (:'BETO',  'beto@test.local',  '{"full_name":"Beto Pérez"}'),
  (:'CARLA', 'carla@test.local', '{"full_name":"Carla Núñez"}');
update public.profiles set role = 'supervisor' where id = :'ANA';
update public.profiles set active_task_limit = 2 where id = :'BETO';

set role authenticated;

-- =============================================================================
\echo ''
\echo '08:00  Ana carga el trabajo del día'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.tasks (id, title, priority, requires_evidence, due_at, created_by) values
  (:'T_ALTA',  'Revisar bomba 3',      'high',   true,  now() + interval '9 hours',  :'ANA'),
  (:'T_MEDIA', 'Cambiar filtros',      'medium', false, now() + interval '2 days',   :'ANA'),
  (:'T_BAJA',  'Inventario del galpón','low',    false, null,                        :'ANA');

do $$
begin
  if (select count(*) from public.tasks where status = 'available') <> 3 then
    raise exception 'E2E 1: las 3 tareas no quedaron disponibles';
  end if;
  if (select count(*) from public.task_events where type = 'created') <> 3 then
    raise exception 'E2E 2: no se auditó la creación';
  end if;
end $$;
\echo '       3 tareas en la cola, las 3 auditadas'

-- =============================================================================
\echo ''
\echo '08:10  Beto abre la app y mira la cola'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r record; i integer := 0; orden text := '';
begin
  for r in select * from public.available_queue() loop
    i := i + 1;
    orden := orden || r.priority || ' ';
    if r.is_stale then raise exception 'E2E 3: marcó estancada una tarea recién creada'; end if;
  end loop;
  if i <> 3 then raise exception 'E2E 4: Beto ve % tareas y hay 3', i; end if;
  if btrim(orden) <> 'high medium low' then
    raise exception 'E2E 5: la cola vino ordenada "%" y esperaba alta, media, baja', btrim(orden);
  end if;
end $$;
\echo '       ve las 3, ordenadas alta → media → baja'

\echo '08:11  Beto toma la de arriba'
do $$
declare r jsonb;
begin
  r := public.claim_task('aaaa0000-0000-0000-0000-00000000000a');
  if (r ->> 'ok')::boolean is not true then raise exception 'E2E 6: no pudo tomar (%)', r; end if;
  if (select count(*) from public.tasks
      where assignee_id = '22222222-2222-2222-2222-222222222222'
        and status = 'active') <> 1 then
    raise exception 'E2E 7: la capacidad de Beto no refleja la tarea tomada';
  end if;
end $$;
\echo '       capacidad de Beto: 1 de 2'

\echo '08:11  Carla toca "Tomar" en la misma tarea, con la lista vieja en pantalla'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r jsonb;
begin
  r := public.claim_task('aaaa0000-0000-0000-0000-00000000000a');
  if r ->> 'code' <> 'already_taken' then
    raise exception 'E2E 8: el segundo no recibió already_taken sino "%"', r ->> 'code';
  end if;
  -- Y para Carla esa tarea ya ni siquiera existe.
  if exists (select 1 from public.tasks where id = 'aaaa0000-0000-0000-0000-00000000000a') then
    raise exception 'E2E 9: Carla sigue viendo la tarea que se llevó Beto';
  end if;
end $$;
\echo '       rebota con already_taken, y la tarea le desaparece de la cola'

-- =============================================================================
\echo ''
\echo '09:30  Beto toma la segunda y queda al tope'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.claim_task('bbbb0000-0000-0000-0000-00000000000b');
  if (r ->> 'ok')::boolean is not true then raise exception 'E2E 10: no pudo tomar la segunda'; end if;

  r := public.claim_task('cccc0000-0000-0000-0000-00000000000c');
  if r ->> 'code' <> 'at_limit' then
    raise exception 'E2E 11: pudo tomar una tercera con tope 2 (%)', r ->> 'code';
  end if;
  if (select status from public.tasks where id = 'cccc0000-0000-0000-0000-00000000000c')
     <> 'available' then
    raise exception 'E2E 12: la tarea rechazada por el tope salió de la cola';
  end if;
end $$;
\echo '       capacidad 2 de 2; la tercera rebota y queda en la cola para otro'

-- =============================================================================
\echo ''
\echo '09:35  Ana mira el panel del equipo'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare beto record; carla record;
begin
  select * into beto  from public.team_load() where id = '22222222-2222-2222-2222-222222222222';
  select * into carla from public.team_load() where id = '33333333-3333-3333-3333-333333333333';

  if beto.active_count <> 2 or beto.active_task_limit <> 2 then
    raise exception 'E2E 13: el panel dice % de % para Beto', beto.active_count, beto.active_task_limit;
  end if;
  if carla.active_count <> 0 then
    raise exception 'E2E 14: el panel le inventa carga a Carla';
  end if;
end $$;
\echo '       Beto al tope (2 de 2), Carla libre (0 de 3)'

\echo '09:36  Ana le asigna la que quedó a Carla'
do $$
declare r jsonb;
begin
  r := public.assign_task('cccc0000-0000-0000-0000-00000000000c',
                          '33333333-3333-3333-3333-333333333333');
  if (r ->> 'ok')::boolean is not true then raise exception 'E2E 15: no pudo asignar (%)', r; end if;
  if (r ->> 'over_limit')::boolean is not false then
    raise exception 'E2E 16: avisó sobrecupo con 1 de 3';
  end if;
  if (select assignment_kind from public.tasks where id = 'cccc0000-0000-0000-0000-00000000000c')
     <> 'assigned' then
    raise exception 'E2E 17: quedó como tomada y fue asignada';
  end if;
end $$;
\echo '       entra a la lista de Carla, marcada como asignada'

-- =============================================================================
\echo ''
\echo '11:00  Carla la termina'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r jsonb;
begin
  r := public.close_task('cccc0000-0000-0000-0000-00000000000c', '');
  if r ->> 'code' <> 'note_required' then
    raise exception 'E2E 18: cerró sin nota';
  end if;

  r := public.close_task('cccc0000-0000-0000-0000-00000000000c',
                         'Contado todo. Faltan 3 cajas de filtros.');
  if (r ->> 'ok')::boolean is not true then raise exception 'E2E 19: no cerró (%)', r; end if;
end $$;
\echo '       sin nota no cierra; con nota sí, y la nota queda en el historial'

-- =============================================================================
\echo ''
\echo '14:00  A Beto le falta una herramienta y suelta una'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.release_task('bbbb0000-0000-0000-0000-00000000000b',
                           'Me falta la llave de 32, no la tengo hoy.');
  if (r ->> 'ok')::boolean is not true then raise exception 'E2E 20: no pudo soltar (%)', r; end if;

  if (select count(*) from public.tasks
      where assignee_id = '22222222-2222-2222-2222-222222222222' and status = 'active') <> 1 then
    raise exception 'E2E 21: soltar no le liberó el cupo';
  end if;
  if (select status from public.tasks where id = 'bbbb0000-0000-0000-0000-00000000000b')
     <> 'available' then
    raise exception 'E2E 22: la tarea soltada no volvió a la cola';
  end if;
end $$;
\echo '       vuelve a la cola, y Beto recupera un cupo (1 de 2)'

\echo '14:05  Ana ve la soltada en Control'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r record;
begin
  select * into r from public.release_history() limit 1;
  if r.reason <> 'Me falta la llave de 32, no la tengo hoy.' then
    raise exception 'E2E 23: el historial no trae el motivo';
  end if;
  if r.self_released is not true then
    raise exception 'E2E 24: no marca que la soltó él mismo';
  end if;
end $$;
\echo '       con nombre, hora y motivo'

-- =============================================================================
\echo ''
\echo '(pasan 20 horas y nadie toca nada)'
reset role;
reset request.jwt.claim.sub;
update public.tasks set available_since = now() - interval '20 hours'
where id = 'bbbb0000-0000-0000-0000-00000000000b';

\echo '10:00  pg_cron corre el barrido, sin que nadie abra la aplicación'
do $$
declare r jsonb;
begin
  r := public.sweep_stale_tasks();
  if (r ->> 'ok')::boolean is not true then raise exception 'E2E 25: el barrido no corrió (%)', r; end if;
  if (r ->> 'created')::int <> 1 then
    raise exception 'E2E 26: no generó el aviso de la tarea abandonada (%)', r;
  end if;
end $$;
\echo '       genera 1 aviso: "nadie la toma"'

\echo '10:02  Ana abre la app y le aparece el contador'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare a record;
begin
  if (select count(*) from public.alerts where acknowledged_at is null) <> 1 then
    raise exception 'E2E 27: el contador de avisos sin ver no da 1';
  end if;

  select * into a from public.open_alerts() limit 1;
  if a.type <> 'stale_available' then raise exception 'E2E 28: tipo de aviso equivocado'; end if;
  if a.title <> 'Cambiar filtros' then raise exception 'E2E 29: el aviso no dice qué tarea es'; end if;
  if a.threshold_hours <> 12 then raise exception 'E2E 30: no trae el umbral aplicado'; end if;
end $$;
\echo '       el aviso dice qué tarea, desde cuándo y con qué umbral'

\echo '10:03  la tarea estancada aparece primera en la cola, sin perder su prioridad'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r record;
begin
  select * into r from public.available_queue() limit 1;
  if r.title <> 'Cambiar filtros' then
    raise exception 'E2E 31: la estancada no quedó primera, quedó "%"', r.title;
  end if;
  if r.is_stale is not true then raise exception 'E2E 32: no viene marcada'; end if;
  if r.priority <> 'medium' then
    raise exception 'E2E 33: le pisaron la prioridad (quedó %)', r.priority;
  end if;
end $$;
\echo '       primera y marcada "Estancada", y sigue siendo prioridad media'

\echo '10:05  Carla la rescata'
do $$
declare r jsonb;
begin
  r := public.claim_task('bbbb0000-0000-0000-0000-00000000000b');
  if (r ->> 'ok')::boolean is not true then raise exception 'E2E 34: no pudo rescatarla'; end if;
end $$;
reset role;
reset request.jwt.claim.sub;
do $$
declare r jsonb;
begin
  r := public.sweep_stale_tasks();
  if (r ->> 'cleared')::int <> 1 then
    raise exception 'E2E 35: el aviso no se limpió al resolverse (%)', r;
  end if;
end $$;
\echo '       el siguiente barrido borra el aviso solo'

-- =============================================================================
\echo ''
\echo '16:00  Beto termina la que pedía evidencia'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.close_task('aaaa0000-0000-0000-0000-00000000000a', 'Rodamiento cambiado.');
  if r ->> 'code' <> 'evidence_required' then
    raise exception 'E2E 36: cerró sin la evidencia que la tarea exige';
  end if;

  r := public.attach_evidence('aaaa0000-0000-0000-0000-00000000000a',
                              'aaaa0000-0000-0000-0000-00000000000a/bomba-3.jpg',
                              'image/jpeg', 210000);
  if (r ->> 'ok')::boolean is not true then raise exception 'E2E 37: no pudo adjuntar (%)', r; end if;

  r := public.close_task('aaaa0000-0000-0000-0000-00000000000a',
                         'Rodamiento cambiado, quedó sin ruido.');
  if (r ->> 'ok')::boolean is not true then raise exception 'E2E 38: con evidencia sigue sin cerrar'; end if;
end $$;
\echo '       sin foto no cierra; con foto sí, y la foto queda asociada'

-- =============================================================================
\echo ''
\echo 'CIERRE DEL DÍA'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare v_cerradas int; v_activas int; v_cola int; v_eventos int; v_avisos int;
begin
  select count(*) into v_cerradas from public.tasks where status = 'closed';
  select count(*) into v_activas  from public.tasks where status = 'active';
  select count(*) into v_cola     from public.tasks where status = 'available';
  select count(*) into v_eventos  from public.task_events;
  select count(*) into v_avisos   from public.alerts;

  if v_cerradas <> 2 then raise exception 'E2E 39: cerradas = %, esperaba 2', v_cerradas; end if;
  if v_activas  <> 1 then raise exception 'E2E 40: activas = %, esperaba 1', v_activas; end if;
  if v_cola     <> 0 then raise exception 'E2E 41: en cola = %, esperaba 0', v_cola; end if;
  if v_avisos   <> 0 then raise exception 'E2E 42: avisos abiertos = %, esperaba 0', v_avisos; end if;

  -- 3 creadas + 3 tomadas + 1 asignada + 2 cerradas + 1 soltada = 10
  if v_eventos <> 10 then
    raise exception 'E2E 43: el historial tiene % eventos y esperaba 10', v_eventos;
  end if;

  raise notice 'cerradas: %  ·  activas: %  ·  en cola: %  ·  eventos: %  ·  avisos: %',
    v_cerradas, v_activas, v_cola, v_eventos, v_avisos;
end $$;
reset role;

\echo ''
\echo '========================================'
\echo '  Escenario de punta a punta: 43 pasos verificados'
\echo '========================================'
