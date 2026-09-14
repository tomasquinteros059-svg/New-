\set ON_ERROR_STOP on
-- Pruebas de regresión de los defectos encontrados en el QA de las cuatro
-- fases. Si alguna vuelve a fallar, volvió el bug.

\echo '--- REGRESIÓN 1: correos con parte local muy corta ---'
do $$
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'a@empresa.cl');
exception when others then
  raise exception 'FALLO R1: un correo de una letra sigue rompiendo el alta de usuario: %', sqlerrm;
end $$;

do $$
declare v_name text;
begin
  select full_name into v_name from public.profiles p
  join auth.users u on u.id = p.id where u.email = 'a@empresa.cl';
  if length(v_name) < 2 then
    raise exception 'FALLO R2: el nombre derivado quedó con % caracteres', length(v_name);
  end if;
end $$;

-- Sin correo y sin metadata: tampoco debe romper.
do $$
begin
  insert into auth.users (id, email) values (gen_random_uuid(), null);
exception when others then
  raise exception 'FALLO R3: un usuario sin correo rompe el alta: %', sqlerrm;
end $$;

-- Un nombre larguísimo en la metadata tampoco puede violar el CHECK de 80.
do $$
declare v_name text;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), 'largo@empresa.cl',
          jsonb_build_object('full_name', repeat('N', 300)));
  select full_name into v_name from public.profiles p
  join auth.users u on u.id = p.id where u.email = 'largo@empresa.cl';
  if length(v_name) <> 80 then
    raise exception 'FALLO R4: el nombre largo quedó en % caracteres', length(v_name);
  end if;
exception when check_violation then
  raise exception 'FALLO R4: un nombre de 300 caracteres rompe el alta';
end $$;
\echo 'OK R1-R4: el nombre derivado siempre cumple el CHECK, venga de donde venga'

-- =============================================================================
\echo '--- REGRESIÓN 2: la evidencia no se hereda entre asignaciones ---'
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'sup@test.local', '{"full_name":"Ana Supervisora"}'),
  ('22222222-2222-2222-2222-222222222222', 'w1@test.local',  '{"full_name":"Beto Trabajador"}'),
  ('33333333-3333-3333-3333-333333333333', 'w2@test.local',  '{"full_name":"Carla Trabajadora"}');
update public.profiles set role = 'supervisor' where id = '11111111-1111-1111-1111-111111111111';

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.tasks (id, title, requires_evidence, created_by)
values ('aaaa0000-0000-0000-0000-00000000000a', 'Pide evidencia', true,
        '11111111-1111-1111-1111-111111111111');

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.claim_task('aaaa0000-0000-0000-0000-00000000000a');
  r := public.attach_evidence('aaaa0000-0000-0000-0000-00000000000a',
                              'aaaa0000-0000-0000-0000-00000000000a/foto-de-beto.jpg',
                              'image/jpeg', 1000);
  if (r ->> 'ok')::boolean is not true then raise exception 'setup: no pudo adjuntar'; end if;
  r := public.release_task('aaaa0000-0000-0000-0000-00000000000a', 'No puedo seguir hoy.');
  if (r ->> 'ok')::boolean is not true then raise exception 'setup: no pudo soltar'; end if;
end $$;

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r jsonb;
begin
  r := public.claim_task('aaaa0000-0000-0000-0000-00000000000a');
  if (r ->> 'ok')::boolean is not true then raise exception 'setup: Carla no pudo tomar'; end if;

  r := public.close_task('aaaa0000-0000-0000-0000-00000000000a', 'Listo, cerrada por Carla.');
  if (r ->> 'ok')::boolean is true then
    raise exception 'FALLO R5: Carla cerró usando la evidencia que subió Beto';
  end if;
  if r ->> 'code' <> 'evidence_required' then
    raise exception 'FALLO R6: rechazó por "%" y esperaba evidence_required', r ->> 'code';
  end if;

  -- Con su propia evidencia, sí.
  r := public.attach_evidence('aaaa0000-0000-0000-0000-00000000000a',
                              'aaaa0000-0000-0000-0000-00000000000a/foto-de-carla.jpg',
                              'image/jpeg', 1000);
  r := public.close_task('aaaa0000-0000-0000-0000-00000000000a', 'Ahora sí, con mi foto.');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO R7: con evidencia propia sigue sin cerrar (%)', r;
  end if;
end $$;
\echo 'OK R5-R7: cada asignación necesita su propia evidencia, y la anterior no se borra'

\echo '--- REGRESIÓN 3: quien subió la evidencia la sigue viendo ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  -- Beto ya no tiene la tarea, pero la foto que sacó él sigue siendo suya.
  if (select count(*) from public.task_evidence) <> 1 then
    raise exception 'FALLO R8: Beto ve % evidencias propias y debería ver 1',
      (select count(*) from public.task_evidence);
  end if;
  if (select count(*) from public.task_evidence
      where storage_path like '%foto-de-carla%') <> 0 then
    raise exception 'FALLO R9: Beto ve la evidencia que subió Carla';
  end if;
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if (select count(*) from public.task_evidence) <> 2 then
    raise exception 'FALLO R10: el supervisor no ve las dos evidencias';
  end if;
end $$;
\echo 'OK R8-R10: ve lo propio, no lo ajeno, y el supervisor ve todo'

-- =============================================================================
\echo '--- REGRESIÓN 4: sesión válida sin perfil ---'
-- Simula lo que pasa si alguien crea su usuario ANTES de aplicar las
-- migraciones: existe en auth.users y no tiene fila en profiles.
reset role;
alter table auth.users disable trigger on_auth_user_created;
insert into auth.users (id, email, raw_user_meta_data)
values ('99999999-9999-9999-9999-999999999999', 'huerfano@test.local', '{}');
alter table auth.users enable trigger on_auth_user_created;

do $$
begin
  if exists (select 1 from public.profiles where id = '99999999-9999-9999-9999-999999999999') then
    raise exception 'setup R4: el usuario huérfano no quedó sin perfil';
  end if;
end $$;

set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$
begin
  if public.ensure_profile() is not true then
    raise exception 'FALLO R11: ensure_profile no pudo crear el perfil faltante';
  end if;
  if not exists (select 1 from public.profiles
                 where id = '99999999-9999-9999-9999-999999999999'
                   and role = 'worker') then
    raise exception 'FALLO R12: el perfil autocurado no quedó bien';
  end if;
  -- Idempotente: llamarla de nuevo no rompe ni duplica.
  if public.ensure_profile() is not true then
    raise exception 'FALLO R13: ensure_profile falla la segunda vez';
  end if;
end $$;

reset request.jwt.claim.sub;
do $$
begin
  if public.ensure_profile() is not false then
    raise exception 'FALLO R14: ensure_profile hace algo sin sesión';
  end if;
end $$;
reset role;
\echo 'OK R11-R14: el perfil faltante se autocura, es idempotente y sin sesión no hace nada'

\echo ''
\echo '========================================'
\echo '  14 pruebas de regresión del QA: PASARON'
\echo '========================================'
