\set ON_ERROR_STOP on
\set SUP '11111111-1111-1111-1111-111111111111'
\set W1  '22222222-2222-2222-2222-222222222222'
\set W2  '33333333-3333-3333-3333-333333333333'
\set S_SOLD 'aaaa1111-0000-0000-0000-000000000001'
\set S_ELEC 'aaaa1111-0000-0000-0000-000000000002'
\set S_ALTU 'aaaa1111-0000-0000-0000-000000000003'
\set T_LIBRE 'bbbb0000-0000-0000-0000-00000000000b'
\set T_UNA   'cccc0000-0000-0000-0000-00000000000c'
\set T_DOS   'dddd0000-0000-0000-0000-00000000000d'

\echo '--- setup ---'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'SUP', 'sup@test.local', '{"full_name":"Ana Supervisora"}'),
  (:'W1',  'w1@test.local',  '{"full_name":"Beto Trabajador"}'),
  (:'W2',  'w2@test.local',  '{"full_name":"Carla Trabajadora"}');
update public.profiles set role = 'supervisor' where id = :'SUP';

-- =============================================================================
\echo '--- el catálogo es del supervisor ---'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  begin
    insert into public.skills (name) values ('pirata');
    raise exception 'FALLO 1: un trabajador creó una habilidad';
  exception when insufficient_privilege then null;
  end;
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.skills (id, name) values
  (:'S_SOLD', 'Soldadura'),
  (:'S_ELEC', 'Eléctrica'),
  (:'S_ALTU', 'Trabajo en altura');

do $$
begin
  -- El índice único ignora mayúsculas: "soldadura" es la misma que "Soldadura".
  begin
    insert into public.skills (name) values ('  soldadura  ');
    raise exception 'FALLO 2: se creó una habilidad duplicada con otra caja';
  exception when unique_violation then null;
  end;
end $$;
\echo 'OK 1-2: solo el supervisor crea, y no se duplican por mayúsculas o espacios'

\echo '--- todos ven el catálogo ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  if (select count(*) from public.skills) <> 3 then
    raise exception 'FALLO 3: un trabajador no ve el catálogo';
  end if;
end $$;
\echo 'OK 3: sin ver el catálogo nadie entiende por qué no puede tomar algo'

-- =============================================================================
\echo '--- repartir habilidades ---'
do $$
declare r jsonb;
begin
  r := public.set_profile_skills('22222222-2222-2222-2222-222222222222',
                                 array['aaaa1111-0000-0000-0000-000000000001']::uuid[]);
  if r ->> 'code' <> 'not_supervisor' then
    raise exception 'FALLO 4: un trabajador se dio habilidades a sí mismo (%)', r ->> 'code';
  end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb;
begin
  -- Beto suelda. Carla suelda y hace eléctrica.
  r := public.set_profile_skills('22222222-2222-2222-2222-222222222222',
                                 array['aaaa1111-0000-0000-0000-000000000001']::uuid[]);
  if (r ->> 'count')::int <> 1 then raise exception 'FALLO 5: no guardó la de Beto'; end if;

  r := public.set_profile_skills('33333333-3333-3333-3333-333333333333',
         array['aaaa1111-0000-0000-0000-000000000001',
               'aaaa1111-0000-0000-0000-000000000002']::uuid[]);
  if (r ->> 'count')::int <> 2 then raise exception 'FALLO 6: no guardó las de Carla'; end if;

  -- Volver a guardar reemplaza, no acumula.
  r := public.set_profile_skills('33333333-3333-3333-3333-333333333333',
         array['aaaa1111-0000-0000-0000-000000000002']::uuid[]);
  if (r ->> 'count')::int <> 1 then
    raise exception 'FALLO 7: guardar de nuevo acumuló en vez de reemplazar';
  end if;

  r := public.set_profile_skills('33333333-3333-3333-3333-333333333333',
         array['aaaa1111-0000-0000-0000-000000000001',
               'aaaa1111-0000-0000-0000-000000000002']::uuid[]);
end $$;
\echo 'OK 4-7: reparte el supervisor, y guardar reemplaza la lista entera'

-- =============================================================================
\echo '--- qué exige cada tarea ---'
insert into public.tasks (id, title, created_by) values
  (:'T_LIBRE', 'Cualquiera puede', :'SUP'),
  (:'T_UNA',   'Pide soldadura',   :'SUP'),
  (:'T_DOS',   'Pide dos cosas',   :'SUP');

do $$
declare r jsonb;
begin
  r := public.set_task_skills('cccc0000-0000-0000-0000-00000000000c',
         array['aaaa1111-0000-0000-0000-000000000001']::uuid[]);
  if (r ->> 'ok')::boolean is not true then raise exception 'FALLO 8: no pudo exigir habilidades'; end if;

  r := public.set_task_skills('dddd0000-0000-0000-0000-00000000000d',
         array['aaaa1111-0000-0000-0000-000000000001',
               'aaaa1111-0000-0000-0000-000000000003']::uuid[]);

  -- El cambio queda en el historial, con el antes y el después.
  if not exists (
    select 1 from public.task_events e
    where e.task_id = 'cccc0000-0000-0000-0000-00000000000c'
      and e.type = 'edited'
      and e.note like '%ninguna → Soldadura%'
  ) then
    raise exception 'FALLO 9: el historial no registra el cambio de habilidades (%)',
      (select note from public.task_events
       where task_id = 'cccc0000-0000-0000-0000-00000000000c' and type = 'edited');
  end if;
end $$;
\echo 'OK 8-9: se exigen habilidades y queda el antes y el después en el historial'

-- =============================================================================
\echo '--- LA REGLA: hay que tenerlas TODAS ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  -- Sin exigencias, cualquiera.
  r := public.claim_task('bbbb0000-0000-0000-0000-00000000000b');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 10: una tarea sin habilidades frenó a alguien (%)', r;
  end if;

  -- Beto suelda, así que la de soldadura entra.
  r := public.claim_task('cccc0000-0000-0000-0000-00000000000c');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 11: quien tiene la habilidad no pudo tomarla (%)', r;
  end if;

  -- La que pide soldadura Y altura no: le falta altura.
  r := public.claim_task('dddd0000-0000-0000-0000-00000000000d');
  if r ->> 'code' <> 'missing_skills' then
    raise exception 'FALLO 12: tomó una tarea sin tener todas las habilidades (%)', r ->> 'code';
  end if;
  if (r -> 'missing') ->> 0 <> 'Trabajo en altura' then
    raise exception 'FALLO 13: no dice exactamente qué le falta (%)', r -> 'missing';
  end if;
  if jsonb_array_length(r -> 'missing') <> 1 then
    raise exception 'FALLO 14: lista habilidades que sí tiene como faltantes';
  end if;
end $$;
\echo 'OK 10-14: sin exigencias cualquiera; con exigencias, todas o ninguna'

\echo '--- la habilidad frena ANTES que el tope ---'
-- `reset role` NO limpia request.jwt.claim.sub: sin esto, el trigger que
-- protege el rol y el tope ve la sesión de Beto y rechaza el cambio.
reset role;
reset request.jwt.claim.sub;
update public.profiles set active_task_limit = 1 where id = :'W2';
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare r jsonb;
begin
  -- Carla está en su tope de 1... pero primero le falta la habilidad.
  r := public.claim_task('dddd0000-0000-0000-0000-00000000000d');
  if r ->> 'code' <> 'missing_skills' then
    raise exception 'FALLO 15: le dijo "estás al tope" cuando el problema es otro (%)', r ->> 'code';
  end if;
end $$;
\echo 'OK 15: el mensaje apunta al problema real, no al primero que aparece'

-- =============================================================================
\echo '--- asignar sigue siendo blando ---'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb;
begin
  r := public.assign_task('dddd0000-0000-0000-0000-00000000000d',
                          '33333333-3333-3333-3333-333333333333');
  if (r ->> 'ok')::boolean is not true then
    raise exception 'FALLO 16: la habilidad frenó una ASIGNACIÓN, y debe ser blanda (%)', r;
  end if;
  -- Carla sabe soldar y hace eléctrica; la tarea pide soldadura y altura.
  -- Le falta una sola, y el aviso tiene que nombrar exactamente esa.
  if jsonb_array_length(r -> 'missing_skills') <> 1
     or (r -> 'missing_skills') ->> 0 <> 'Trabajo en altura' then
    raise exception 'FALLO 17: no avisa qué habilidades le faltan a quien se la asignó (%)',
      r -> 'missing_skills';
  end if;
end $$;
\echo 'OK 16-17: el supervisor puede asignarla igual, pero se entera de qué le falta'

-- =============================================================================
\echo '--- la cola muestra lo que no podés tomar, no lo esconde ---'
reset role;
reset request.jwt.claim.sub;
update public.tasks set status = 'available', assignee_id = null,
       assignment_kind = null, assigned_at = null;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r record;
begin
  if (select count(*) from public.available_queue()) <> 3 then
    raise exception 'FALLO 18: esconde tareas que Beto no puede tomar';
  end if;

  select * into r from public.available_queue() where title = 'Pide dos cosas';
  if r.meets_skills is not false then
    raise exception 'FALLO 19: dice que Beto cumple y no cumple';
  end if;
  if array_length(r.required_skills, 1) <> 2 then
    raise exception 'FALLO 20: no trae las habilidades exigidas';
  end if;

  select * into r from public.available_queue() where title = 'Pide soldadura';
  if r.meets_skills is not true then
    raise exception 'FALLO 21: dice que Beto no cumple y sí cumple';
  end if;

  select * into r from public.available_queue() where title = 'Cualquiera puede';
  if array_length(r.required_skills, 1) is not null then
    raise exception 'FALLO 22: inventa habilidades en una tarea que no exige ninguna';
  end if;
end $$;
\echo 'OK 18-22: las ve todas, marcadas según si las puede tomar'

\echo '--- paginación ---'
do $$
declare n int; total int;
begin
  select count(*) into n from public.available_queue(null, 2, 0);
  if n <> 2 then raise exception 'FALLO 23: la primera página trae % y esperaba 2', n; end if;

  select count(*) into n from public.available_queue(null, 2, 2);
  if n <> 1 then raise exception 'FALLO 24: la segunda página trae % y esperaba 1', n; end if;

  select count(*) into n from public.available_queue(null, 2, 99);
  if n <> 0 then raise exception 'FALLO 25: una página más allá del final trae filas'; end if;

  select q.total_count into total from public.available_queue(null, 2, 2) q limit 1;
  if total <> 3 then raise exception 'FALLO 26: el total cambia según la página (%)', total; end if;
end $$;
\echo 'OK 23-26: páginas de verdad, y el total no depende de la página'

-- =============================================================================
\echo '--- borrar una habilidad en uso ---'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  begin
    delete from public.skills where id = 'aaaa1111-0000-0000-0000-000000000001';
    raise exception 'FALLO 27: se borró una habilidad que alguna tarea exige';
  exception when foreign_key_violation then null;
  end;

  -- Una que nadie exige sí se puede.
  insert into public.skills (id, name) values
    ('aaaa1111-0000-0000-0000-000000000009', 'Sin usar');
  delete from public.skills where id = 'aaaa1111-0000-0000-0000-000000000009';
end $$;
\echo 'OK 27: borrar en cascada cambiaría en silencio quién puede tomar qué'

\echo '--- el panel de equipo trae las habilidades ---'
do $$
declare r record;
begin
  select * into r from public.team_load() where id = '33333333-3333-3333-3333-333333333333';
  if array_length(r.skills, 1) <> 2 then
    raise exception 'FALLO 28: el panel no trae las habilidades de cada uno (%)', r.skills;
  end if;
end $$;
reset role;
\echo 'OK 28: el supervisor ve quién sabe qué sin salir del panel'

\echo ''
\echo '========================================'
\echo '  28 pruebas de habilidades y paginación: PASARON'
\echo '========================================'
