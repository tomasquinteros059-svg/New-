\set ON_ERROR_STOP on
\set SUP '11111111-1111-1111-1111-111111111111'
\set W1  '22222222-2222-2222-2222-222222222222'
\set W2  '33333333-3333-3333-3333-333333333333'

\echo '--- setup: tres usuarios ---'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'SUP', 'sup@test.local',  '{"full_name":"Ana Supervisora","role":"supervisor"}'),
  (:'W1',  'w1@test.local',   '{"full_name":"Beto Trabajador"}'),
  (:'W2',  'w2@test.local',   '{}');

do $$
begin
  if (select count(*) from public.profiles) <> 3 then
    raise exception 'FALLO 1: el trigger no creó los 3 perfiles';
  end if;
  -- El rol de raw_user_meta_data NO debe respetarse: sería autoascenso.
  if (select role from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 'worker' then
    raise exception 'FALLO 2: se respetó el rol que venía en la metadata del signup';
  end if;
  if (select full_name from public.profiles where id = '33333333-3333-3333-3333-333333333333') <> 'w2' then
    raise exception 'FALLO 3: el fallback de nombre desde el email no funcionó';
  end if;
end $$;
\echo 'OK 1-3: perfiles creados, rol forzado a worker, fallback de nombre'

-- Promoción manual del primer supervisor (lo que hará Tomás una sola vez).
update public.profiles set role = 'supervisor' where id = :'SUP';

-- =============================================================================
\echo '--- anon no ve nada ---'
set role anon;
do $$
begin
  begin
    perform 1 from public.profiles;
    raise exception 'FALLO 4: anon pudo leer profiles';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.tasks;
    raise exception 'FALLO 5: anon pudo leer tasks';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo 'OK 4-5: anon bloqueado en profiles y tasks'

-- =============================================================================
\echo '--- supervisor crea tareas ---'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.tasks (title, description, priority, created_by)
values ('Revisar bomba 3', 'Ruido anormal', 'high', '11111111-1111-1111-1111-111111111111');
insert into public.tasks (title, priority, created_by)
values ('Inventario galpón', 'low', '11111111-1111-1111-1111-111111111111');
insert into public.tasks (title, priority, due_at, created_by)
values ('Cambiar filtros', 'medium', now() + interval '2 days', '11111111-1111-1111-1111-111111111111');

do $$
begin
  if (select count(*) from public.tasks) <> 3 then
    raise exception 'FALLO 6: el supervisor no pudo crear las 3 tareas';
  end if;
  if (select count(*) from public.task_events where type = 'created') <> 3 then
    raise exception 'FALLO 7: el trigger de auditoría no registró las creaciones';
  end if;
end $$;
\echo 'OK 6-7: tareas creadas con su evento de auditoría'

-- El supervisor no puede crear una tarea ya asignada ni en otro estado.
do $$
begin
  begin
    insert into public.tasks (title, created_by, status, assignee_id, assignment_kind, assigned_at)
    values ('Trucha', '11111111-1111-1111-1111-111111111111', 'active',
            '22222222-2222-2222-2222-222222222222', 'assigned', now());
    raise exception 'FALLO 8: se pudo crear una tarea ya activa saltándose el flujo';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'OK 8: una tarea nace disponible y sin dueño, siempre'

-- =============================================================================
\echo '--- el trabajador NO puede crear tareas ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  begin
    insert into public.tasks (title, created_by)
    values ('Tarea pirata', '22222222-2222-2222-2222-222222222222');
    raise exception 'FALLO 9: un trabajador pudo crear una tarea';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'OK 9: crear tareas es solo del supervisor'

\echo '--- el trabajador NO puede editar tareas directamente ---'
do $$
declare n int;
begin
  update public.tasks set priority = 'high' where title = 'Inventario galpón';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLO 10: un trabajador pudo editar una tarea (% filas)', n;
  end if;
end $$;
\echo 'OK 10: sin política de UPDATE para el trabajador (las transiciones van por RPC en Fase 2)'

-- =============================================================================
\echo '--- escalada de privilegios ---'
do $$
begin
  begin
    update public.profiles set role = 'supervisor'
    where id = '22222222-2222-2222-2222-222222222222';
    raise exception 'FALLO 11: un trabajador se autoascendió a supervisor';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.profiles set active_task_limit = 99
    where id = '22222222-2222-2222-2222-222222222222';
    raise exception 'FALLO 12: un trabajador se subió su propio límite de tareas';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'OK 11-12: rol y límite blindados contra el propio usuario'

\echo '--- lo que el trabajador SÍ puede sobre su perfil ---'
update public.profiles set full_name = 'Beto Pérez', is_present = false
where id = '22222222-2222-2222-2222-222222222222';
do $$
declare n int;
begin
  if (select is_present from public.profiles
      where id = '22222222-2222-2222-2222-222222222222') <> false then
    raise exception 'FALLO 13: el trabajador no pudo declarar su presencia';
  end if;
  update public.profiles set full_name = 'Hackeado'
  where id = '33333333-3333-3333-3333-333333333333';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLO 14: un trabajador editó el perfil de otro (% filas)', n;
  end if;
end $$;
\echo 'OK 13-14: edita su nombre y presencia, no los de otros'

-- =============================================================================
\echo '--- LA carrera: dos personas toman la misma tarea ---'
-- Este es el patrón exacto que usará el RPC de Fase 2. Un solo UPDATE
-- condicionado por el estado; Postgres serializa, el segundo ve 0 filas.
reset role;
do $$
declare
  v_task uuid;
  n1 int; n2 int;
begin
  select id into v_task from public.tasks where title = 'Revisar bomba 3';

  update public.tasks
     set status = 'active', assignee_id = '22222222-2222-2222-2222-222222222222',
         assignment_kind = 'claimed', assigned_at = now()
   where id = v_task and status = 'available';
  get diagnostics n1 = row_count;

  update public.tasks
     set status = 'active', assignee_id = '33333333-3333-3333-3333-333333333333',
         assignment_kind = 'claimed', assigned_at = now()
   where id = v_task and status = 'available';
  get diagnostics n2 = row_count;

  if n1 <> 1 then raise exception 'FALLO 15: el primero no pudo tomar la tarea'; end if;
  if n2 <> 0 then raise exception 'FALLO 16: el segundo también la tomó (doble asignación)'; end if;
end $$;
\echo 'OK 15-16: gana el primero, el segundo recibe 0 filas (no un error genérico)'

\echo '--- el estado no puede quedar incoherente ---'
do $$
begin
  begin
    update public.tasks set status = 'active'
    where title = 'Inventario galpón';
    raise exception 'FALLO 17: una tarea quedó activa sin dueño';
  exception when check_violation then null;
  end;

  begin
    update public.tasks set status = 'closed', closed_at = now(), closing_note = 'ok'
    where title = 'Cambiar filtros';
    raise exception 'FALLO 18: se cerró una tarea que nadie tenía';
  exception when check_violation then null;
  end;

  begin
    update public.tasks set status = 'closed', closed_at = now(), closing_note = '  '
    where title = 'Revisar bomba 3';
    raise exception 'FALLO 19: se cerró una tarea sin nota real';
  exception when check_violation then null;
  end;
end $$;
\echo 'OK 17-19: los CHECK impiden estados imposibles y cierres sin nota'

-- =============================================================================
\echo '--- visibilidad cruzada: cada uno ve lo suyo ---'
set role authenticated;

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  -- Beto tiene 1 activa + 2 disponibles = 3
  if (select count(*) from public.tasks) <> 3 then
    raise exception 'FALLO 20: Beto ve % tareas, esperaba 3', (select count(*) from public.tasks);
  end if;
  if not exists (select 1 from public.tasks
                 where status = 'active'
                   and assignee_id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'FALLO 21: Beto no ve su propia tarea activa';
  end if;
end $$;

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  -- Carla solo ve las 2 disponibles: la activa de Beto no le corresponde.
  if (select count(*) from public.tasks) <> 2 then
    raise exception 'FALLO 22: Carla ve % tareas, esperaba 2', (select count(*) from public.tasks);
  end if;
  if exists (select 1 from public.tasks where status = 'active') then
    raise exception 'FALLO 23: Carla ve la tarea activa de otro';
  end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if (select count(*) from public.tasks) <> 3 then
    raise exception 'FALLO 24: el supervisor no ve las 3 tareas';
  end if;
end $$;
\echo 'OK 20-24: criterio de Fase 1 — cada uno ve solo lo suyo, el supervisor ve todo'

\echo '--- historial ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  if (select count(*) from public.task_events) <> 0 then
    raise exception 'FALLO 25: Carla ve eventos que no son suyos';
  end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if (select count(*) from public.task_events) <> 3 then
    raise exception 'FALLO 26: el supervisor no ve el historial completo';
  end if;
end $$;
\echo 'OK 25-26: historial completo solo para el supervisor'

-- =============================================================================
\echo '--- append-only, incluso para service_role ---'
reset role;
set role service_role;
do $$
begin
  begin
    update public.task_events set note = 'reescrito';
    raise exception 'FALLO 27: service_role reescribió el historial';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.task_events;
    raise exception 'FALLO 28: service_role borró el historial';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo 'OK 27-28: ni la llave maestra puede tocar el historial'

-- =============================================================================
\echo '--- no quedarse sin supervisores ---'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  begin
    update public.profiles set role = 'worker'
    where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FALLO 29: el único supervisor pudo degradarse a sí mismo';
  exception when insufficient_privilege then null;
  end;
end $$;
\echo 'OK 29: no se puede quitar al último supervisor'

\echo '--- configuración de X e Y ---'
do $$
begin
  update public.app_settings set stale_available_hours = 8, stale_active_hours = 24 where id;
  if (select stale_available_hours from public.app_settings) <> 8 then
    raise exception 'FALLO 30: el supervisor no pudo cambiar los umbrales';
  end if;
end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare n int;
begin
  update public.app_settings set stale_available_hours = 1 where id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO 31: un trabajador cambió la configuración'; end if;
end $$;
reset role;
\echo 'OK 30-31: umbrales configurables, y solo por el supervisor'

\echo ''
\echo '========================================'
\echo '  31 pruebas de RLS: TODAS PASARON'
\echo '========================================'
