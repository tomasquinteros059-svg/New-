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

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.tasks (id, title, priority, requires_evidence, created_by) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'Con evidencia', 'high',   true,  :'SUP'),
  ('bbbb0000-0000-0000-0000-00000000000b', 'Para soltar',   'medium', false, :'SUP'),
  ('cccc0000-0000-0000-0000-00000000000c', 'Para envejecer','low',    false, :'SUP'),
  ('dddd0000-0000-0000-0000-00000000000d', 'Otra',          'low',    false, :'SUP');
reset role;

-- =============================================================================
-- SOLTAR
-- =============================================================================
\echo '--- soltar: el motivo es obligatorio ---'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.claim_task('bbbb0000-0000-0000-0000-00000000000b');
  if (r ->> 'ok')::boolean is not true then raise exception 'setup: no pudo tomar'; end if;

  r := public.release_task('bbbb0000-0000-0000-0000-00000000000b', '  ');
  if r ->> 'code' <> 'reason_required' then
    raise exception 'FALLO 1: se soltó sin motivo (%)', r ->> 'code';
  end if;

  r := public.release_task('bbbb0000-0000-0000-0000-00000000000b', repeat('x', 1001));
  if r ->> 'code' <> 'reason_too_long' then
    raise exception 'FALLO 2: se aceptó un motivo de más de 1000 caracteres';
  end if;
end $$;
\echo 'OK 1-2: sin motivo no se suelta, y el motivo está acotado'

\echo '--- soltar lo ajeno ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r jsonb;
begin
  r := public.release_task('bbbb0000-0000-0000-0000-00000000000b', 'La suelto yo');
  if r ->> 'code' <> 'not_yours' then
    raise exception 'FALLO 3: Carla soltó una tarea de Beto (%)', r ->> 'code';
  end if;
end $$;
\echo 'OK 3: un trabajador no suelta la tarea de otro'

\echo '--- soltar de verdad ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb; t public.tasks%rowtype; v_before timestamptz;
begin
  select available_since into v_before from public.tasks
  where id = 'bbbb0000-0000-0000-0000-00000000000b';

  r := public.release_task('bbbb0000-0000-0000-0000-00000000000b',
                           'Me falta la llave de 32, no la tengo hoy.');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 4: no pudo soltar su propia tarea (%)', r;
  end if;

  select * into t from public.tasks where id = 'bbbb0000-0000-0000-0000-00000000000b';
  if t.status <> 'available' then raise exception 'FALLO 5: no volvió a la cola'; end if;
  if t.assignee_id is not null then raise exception 'FALLO 6: quedó con dueño'; end if;
  if t.assignment_kind is not null then raise exception 'FALLO 7: quedó con tipo de asignación'; end if;
  if t.assigned_at is not null then raise exception 'FALLO 8: quedó con fecha de toma'; end if;
  -- El reloj de la cola se reinicia: para quien mira, acaba de llegar.
  if t.available_since <= v_before then
    raise exception 'FALLO 9: no se reinició el reloj de antigüedad en cola';
  end if;

  if not exists (
    select 1 from public.task_events e
    where e.task_id = 'bbbb0000-0000-0000-0000-00000000000b'
      and e.type = 'released'
      and e.actor_id = '22222222-2222-2222-2222-222222222222'
      and e.subject_id = '22222222-2222-2222-2222-222222222222'
      and e.note = 'Me falta la llave de 32, no la tengo hoy.'
  ) then
    raise exception 'FALLO 10: el historial no guardó la soltada con su motivo';
  end if;
end $$;
\echo 'OK 4-10: vuelve a la cola limpia, con el reloj reiniciado y el motivo en el historial'

\echo '--- soltar algo que no está activo ---'
do $$
declare r jsonb;
begin
  r := public.release_task('bbbb0000-0000-0000-0000-00000000000b', 'De nuevo');
  if r ->> 'code' <> 'not_active' then
    raise exception 'FALLO 11: se soltó una tarea que ya estaba en la cola (%)', r ->> 'code';
  end if;
end $$;
\echo 'OK 11: no se suelta lo que no se tiene'

\echo '--- el supervisor sí puede soltar lo ajeno ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r jsonb;
begin
  r := public.claim_task('dddd0000-0000-0000-0000-00000000000d');
  if (r ->> 'ok')::boolean is not true then raise exception 'setup: Carla no pudo tomar'; end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb;
begin
  r := public.release_task('dddd0000-0000-0000-0000-00000000000d',
                           'Carla está con licencia, la devuelvo a la cola.');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 12: el supervisor no pudo soltar lo ajeno (%)', r;
  end if;
  if not exists (
    select 1 from public.task_events e
    where e.type = 'released'
      and e.actor_id = '11111111-1111-1111-1111-111111111111'
      and e.subject_id = '33333333-3333-3333-3333-333333333333'
  ) then
    raise exception 'FALLO 13: el historial no distingue quién soltó de quién la tenía';
  end if;
end $$;
\echo 'OK 12-13: el supervisor rescata trabajo, y queda claro a quién se lo sacó'

-- =============================================================================
-- EVIDENCIA
-- =============================================================================
\echo '--- cerrar una tarea que pide evidencia, sin evidencia ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.claim_task('aaaa0000-0000-0000-0000-00000000000a');
  if (r ->> 'ok')::boolean is not true then raise exception 'setup: no pudo tomar la de evidencia'; end if;

  r := public.close_task('aaaa0000-0000-0000-0000-00000000000a', 'Ya está, listo.');
  if r ->> 'code' <> 'evidence_required' then
    raise exception 'FALLO 14: cerró sin la evidencia que la tarea exige (%)', r ->> 'code';
  end if;
end $$;
\echo 'OK 14: sin evidencia no se cierra lo que pide evidencia'

\echo '--- registrar evidencia ---'
do $$
declare r jsonb;
begin
  -- Una ruta que no es de esta tarea no se puede registrar como suya.
  r := public.attach_evidence('aaaa0000-0000-0000-0000-00000000000a',
                              'bbbb0000-0000-0000-0000-00000000000b/foto.jpg');
  if r ->> 'code' <> 'bad_path' then
    raise exception 'FALLO 15: registró como propia la evidencia de otra tarea (%)', r ->> 'code';
  end if;

  r := public.attach_evidence('aaaa0000-0000-0000-0000-00000000000a',
                              'aaaa0000-0000-0000-0000-00000000000a/bomba.jpg',
                              'image/jpeg', 184000);
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 16: no pudo registrar su propia evidencia (%)', r;
  end if;
  if (r ->> 'count')::int <> 1 then
    raise exception 'FALLO 17: no devolvió cuántas evidencias tiene la tarea';
  end if;

  -- Registrar dos veces el mismo archivo no duplica.
  r := public.attach_evidence('aaaa0000-0000-0000-0000-00000000000a',
                              'aaaa0000-0000-0000-0000-00000000000a/bomba.jpg');
  if (r ->> 'count')::int <> 1 then
    raise exception 'FALLO 18: el mismo archivo quedó registrado dos veces';
  end if;
end $$;
\echo 'OK 15-18: la ruta tiene que ser de la tarea, y registrar dos veces no duplica'

\echo '--- evidencia ajena ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r jsonb;
begin
  r := public.attach_evidence('aaaa0000-0000-0000-0000-00000000000a',
                              'aaaa0000-0000-0000-0000-00000000000a/trucho.jpg');
  if r ->> 'code' <> 'not_yours' then
    raise exception 'FALLO 19: Carla subió evidencia a una tarea de Beto (%)', r ->> 'code';
  end if;
  if (select count(*) from public.task_evidence) <> 0 then
    raise exception 'FALLO 20: Carla ve la evidencia de una tarea que no es suya';
  end if;
end $$;
\echo 'OK 19-20: no sube ni ve evidencia de tareas ajenas'

\echo '--- ahora sí se puede cerrar ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.close_task('aaaa0000-0000-0000-0000-00000000000a',
                         'Rodamiento cambiado. Foto del antes y el después.');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 21: con evidencia cargada sigue sin cerrar (%)', r;
  end if;
  -- La evidencia sobrevive al cierre: para eso se pidió.
  if (select count(*) from public.task_evidence
      where task_id = 'aaaa0000-0000-0000-0000-00000000000a') <> 1 then
    raise exception 'FALLO 22: se perdió la evidencia al cerrar';
  end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if (select count(*) from public.task_evidence) <> 1 then
    raise exception 'FALLO 23: el supervisor no ve la evidencia';
  end if;
end $$;
\echo 'OK 21-23: con evidencia cierra, la evidencia queda, y el supervisor la ve'

-- =============================================================================
-- POLÍTICAS DE STORAGE
-- =============================================================================
\echo '--- quién puede escribir en el bucket ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r jsonb;
begin
  r := public.claim_task('cccc0000-0000-0000-0000-00000000000c');
  if (r ->> 'ok')::boolean is not true then raise exception 'setup: Carla no pudo tomar'; end if;
end $$;

do $$
begin
  -- Carla tiene la tarea C activa: puede escribir en su carpeta.
  insert into storage.objects (bucket_id, name, owner)
  values ('evidence', 'cccc0000-0000-0000-0000-00000000000c/foto.jpg',
          '33333333-3333-3333-3333-333333333333');
end $$;
\echo 'OK 24: quien tiene la tarea activa escribe en la carpeta de esa tarea'

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('evidence', 'cccc0000-0000-0000-0000-00000000000c/intruso.jpg',
            '22222222-2222-2222-2222-222222222222');
    raise exception 'FALLO 25: Beto escribió en la carpeta de una tarea de Carla';
  exception when insufficient_privilege then null;
  end;

  -- Una carpeta que no es un uuid no debe reventar la política: debe rechazar.
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('evidence', 'no-es-un-uuid/foto.jpg', '22222222-2222-2222-2222-222222222222');
    raise exception 'FALLO 26: se pudo escribir en una carpeta que no es una tarea';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'OK 25-26: carpeta ajena no, y una ruta basura se rechaza sin romper la política'

\echo '--- quién puede leer del bucket ---'
do $$
begin
  if (select count(*) from storage.objects) <> 0 then
    raise exception 'FALLO 27: Beto ve el archivo de una tarea de Carla';
  end if;
end $$;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  if (select count(*) from storage.objects) <> 1 then
    raise exception 'FALLO 28: Carla no ve su propio archivo';
  end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if (select count(*) from storage.objects) <> 1 then
    raise exception 'FALLO 29: el supervisor no ve la evidencia del equipo';
  end if;
end $$;
reset role;
\echo 'OK 27-29: cada uno ve lo suyo, el supervisor ve todo'

-- =============================================================================
-- RESCATE
--
-- De acá en adelante el barrido corre SIN sesión: es el caso de pg_cron, que
-- ejecuta dentro de la base y no tiene JWT. Si se quedara un jwt puesto, la
-- función devolvería not_supervisor y las pruebas pasarían en falso.
-- =============================================================================
reset request.jwt.claim.sub;

\echo '--- barrido sin nada estancado ---'
do $$
declare r jsonb;
begin
  r := public.sweep_stale_tasks();
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 30a: pg_cron no pudo correr el barrido (%)', r;
  end if;
  if (r ->> 'created')::int <> 0 then
    raise exception 'FALLO 30: inventó avisos sin tareas viejas (%)', r;
  end if;
  if (r ->> 'stale_available_hours')::int <> 12 then
    raise exception 'FALLO 31: no leyó el umbral de app_settings (%)', r;
  end if;
end $$;
\echo 'OK 30-31: sin tareas viejas no hay avisos, y los umbrales salen de la tabla'

\echo '--- una tarea abandonada en la cola ---'
-- Envejecemos la tarea sin tocar nada más: nadie interactúa con el sistema.
update public.tasks set available_since = now() - interval '20 hours'
where id = 'bbbb0000-0000-0000-0000-00000000000b';

do $$
declare r jsonb;
begin
  r := public.sweep_stale_tasks();
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 32a: el barrido no corrió (%)', r;
  end if;
  if (r ->> 'created')::int <> 1 then
    raise exception 'FALLO 32: no generó el aviso de la tarea abandonada (%)', r;
  end if;

  if not exists (
    select 1 from public.alerts a
    where a.task_id = 'bbbb0000-0000-0000-0000-00000000000b'
      and a.type = 'stale_available'
      and a.threshold_hours = 12
  ) then
    raise exception 'FALLO 33: el aviso no guarda con qué umbral se disparó';
  end if;

  -- Idempotencia: correrlo de nuevo no duplica.
  r := public.sweep_stale_tasks();
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 34a: el segundo barrido no corrió (%)', r;
  end if;
  if (r ->> 'created')::int <> 0 then
    raise exception 'FALLO 34: el barrido duplicó el aviso al correr dos veces';
  end if;
end $$;
\echo 'OK 32-34: el aviso se genera solo, con su umbral, y el barrido es idempotente'

\echo '--- rescatar la tarea borra el aviso ---'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.claim_task('bbbb0000-0000-0000-0000-00000000000b');
  if (r ->> 'ok')::boolean is not true then raise exception 'setup: no pudo tomar'; end if;
end $$;
reset role;
reset request.jwt.claim.sub;
do $$
declare r jsonb;
begin
  r := public.sweep_stale_tasks();
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 35a: el barrido no corrió (%)', r;
  end if;
  if (r ->> 'cleared')::int <> 1 then
    raise exception 'FALLO 35: el aviso sobrevivió a que alguien tomara la tarea (%)', r;
  end if;
  if (select count(*) from public.alerts) <> 0 then
    raise exception 'FALLO 36: quedaron avisos de una situación resuelta';
  end if;
end $$;
\echo 'OK 35-36: la tabla de avisos es la foto de AHORA, no un registro histórico'

\echo '--- una tarea activa que nadie cierra ---'
update public.tasks set assigned_at = now() - interval '60 hours'
where id = 'bbbb0000-0000-0000-0000-00000000000b';
do $$
declare r jsonb;
begin
  r := public.sweep_stale_tasks();
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 37a: el barrido no corrió (%)', r;
  end if;
  if not exists (
    select 1 from public.alerts a
    where a.task_id = 'bbbb0000-0000-0000-0000-00000000000b'
      and a.type = 'stale_active'
  ) then
    raise exception 'FALLO 37: no avisó de una tarea activa sin cerrar (%)', r;
  end if;
end $$;
\echo 'OK 37: también avisa de lo que se toma y no se cierra'

\echo '--- los umbrales no están a fuego ---'
update public.app_settings set stale_active_hours = 100 where id;
do $$
declare r jsonb;
begin
  r := public.sweep_stale_tasks();
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 38a: el barrido no corrió (%)', r;
  end if;
  if (select count(*) from public.alerts where type = 'stale_active') <> 0 then
    raise exception 'FALLO 38: subir Y a 100 h no apagó el aviso de 60 h';
  end if;
end $$;
update public.app_settings set stale_active_hours = 48 where id;
do $$ declare r jsonb; begin r := public.sweep_stale_tasks(); end $$;
\echo 'OK 38: cambiar X o Y cambia el comportamiento, sin tocar código'

\echo '--- quién ve y quién dispara los avisos ---'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  if (select count(*) from public.alerts) <> 0 then
    raise exception 'FALLO 39: un trabajador ve los avisos del supervisor';
  end if;
  if (select count(*) from public.open_alerts()) <> 0 then
    raise exception 'FALLO 40: open_alerts le responde a un trabajador';
  end if;
  r := public.sweep_stale_tasks();
  if r ->> 'code' <> 'not_supervisor' then
    raise exception 'FALLO 41: un trabajador pudo forzar el barrido (%)', r ->> 'code';
  end if;
end $$;
\echo 'OK 39-41: los avisos son del supervisor, y el barrido también'

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r record; v_id bigint; j jsonb;
begin
  if (select count(*) from public.open_alerts()) <> 1 then
    raise exception 'FALLO 42: el supervisor no ve el aviso';
  end if;

  select * into r from public.open_alerts() limit 1;
  if r.title is null then raise exception 'FALLO 43: el aviso no trae el título de la tarea'; end if;
  if r.assignee_name is null then
    raise exception 'FALLO 44: el aviso de una activa no dice quién la tiene';
  end if;
  if r.stale_since is null then
    raise exception 'FALLO 45: el aviso no dice desde cuándo';
  end if;

  select id into v_id from public.alerts limit 1;
  j := public.acknowledge_alert(v_id);
  if (j ->> 'ok')::boolean is not true then
    raise exception 'FALLO 46: el supervisor no pudo dar por visto el aviso (%)', j;
  end if;

  j := public.acknowledge_alert(v_id);
  if (j ->> 'ok')::boolean is not false then
    raise exception 'FALLO 47: se dio por visto dos veces';
  end if;

  -- Dar por visto NO borra: la tarea sigue estancada.
  if (select count(*) from public.alerts) <> 1 then
    raise exception 'FALLO 48: dar por visto borró el aviso';
  end if;
end $$;
reset role;
\echo 'OK 42-48: el aviso trae contexto, se da por visto una vez, y no se borra por eso'

-- =============================================================================
-- HISTORIAL DE SOLTADAS
-- =============================================================================
\echo '--- historial de soltadas ---'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  if (select count(*) from public.release_history()) <> 0 then
    raise exception 'FALLO 49: un trabajador ve el historial de soltadas del equipo';
  end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r record;
begin
  -- Dos soltadas en esta corrida: la de Beto y la que hizo el supervisor.
  if (select count(*) from public.release_history()) <> 2 then
    raise exception 'FALLO 50: el supervisor ve % soltadas y esperaba 2',
      (select count(*) from public.release_history());
  end if;

  select * into r from public.release_history()
  where subject_name = 'Beto Trabajador' limit 1;
  if r.reason is null or r.reason = '' then
    raise exception 'FALLO 51: el historial no trae el motivo';
  end if;
  if r.self_released is not true then
    raise exception 'FALLO 52: no marca que Beto la soltó solo';
  end if;

  select * into r from public.release_history()
  where subject_name = 'Carla Trabajadora' limit 1;
  if r.self_released is not false then
    raise exception 'FALLO 53: no distingue que se la sacó el supervisor';
  end if;
  if r.actor_name <> 'Ana Supervisora' then
    raise exception 'FALLO 54: no dice quién se la sacó';
  end if;
  if r.title is null then
    raise exception 'FALLO 55: no trae el título de la tarea';
  end if;
end $$;
reset role;
\echo 'OK 49-55: el historial es del supervisor, con motivo, y distingue soltar de que te la saquen'

-- =============================================================================
-- LA COLA CON MARCA DE ESTANCADA
-- =============================================================================
\echo '--- estancadas primero, sin pisar la prioridad ---'
reset role;
reset request.jwt.claim.sub;

-- Dejamos una sola tarea en la cola, vieja y de prioridad baja, y otra nueva de
-- prioridad alta. La vieja tiene que ir PRIMERO aunque su prioridad sea menor.
update public.tasks set status = 'cancelled', cancelled_at = now(),
       assignee_id = null, assignment_kind = null, assigned_at = null
where status in ('available', 'active');

insert into public.tasks (id, title, priority, status, available_since, created_by) values
  ('eeee0000-0000-0000-0000-00000000000e', 'Vieja y baja', 'low', 'available',
   now() - interval '30 hours', '11111111-1111-1111-1111-111111111111'),
  ('ffff0000-0000-0000-0000-00000000000f', 'Nueva y alta', 'high', 'available',
   now(), '11111111-1111-1111-1111-111111111111');

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r record; i integer := 0;
begin
  if (select count(*) from public.available_queue()) <> 2 then
    raise exception 'FALLO 56: la cola no trae las 2 disponibles';
  end if;

  for r in select * from public.available_queue() loop
    i := i + 1;
    if i = 1 then
      if r.title <> 'Vieja y baja' then
        raise exception 'FALLO 57: la estancada no quedó primera, quedó "%"', r.title;
      end if;
      if r.is_stale is not true then
        raise exception 'FALLO 58: no la marcó como estancada';
      end if;
      if r.stale_after_hours <> 12 then
        raise exception 'FALLO 59: no informa el umbral vigente';
      end if;
      -- Y lo importante: la prioridad original sigue intacta.
      if r.priority <> 'low' then
        raise exception 'FALLO 60: le pisaron la prioridad al escalarla';
      end if;
    else
      if r.is_stale is not false then
        raise exception 'FALLO 61: marcó como estancada una recién llegada';
      end if;
    end if;
  end loop;
end $$;
reset role;
\echo 'OK 56-61: la vieja sube sin que nadie le toque la prioridad'

\echo ''
\echo '========================================'
\echo '  66 pruebas de soltar, evidencia y rescate: PASARON'
\echo '========================================'
