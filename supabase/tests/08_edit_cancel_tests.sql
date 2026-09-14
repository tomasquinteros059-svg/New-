\set ON_ERROR_STOP on
\set SUP '11111111-1111-1111-1111-111111111111'
\set W1  '22222222-2222-2222-2222-222222222222'

\echo '--- setup ---'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'SUP', 'sup@test.local', '{"full_name":"Ana Supervisora"}'),
  (:'W1',  'w1@test.local',  '{"full_name":"Beto Trabajador"}');
update public.profiles set role = 'supervisor' where id = :'SUP';

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.tasks (id, title, description, priority, created_by) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'Titulo original', 'Detalle original', 'low', :'SUP'),
  ('bbbb0000-0000-0000-0000-00000000000b', 'Para cancelar',   null,               'medium', :'SUP'),
  ('cccc0000-0000-0000-0000-00000000000c', 'Para trabajar',   null,               'medium', :'SUP');
reset role;

-- =============================================================================
\echo '--- editar es solo del supervisor ---'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.edit_task('aaaa0000-0000-0000-0000-00000000000a', 'Secuestrada', null, 'high', null, false);
  if r ->> 'code' <> 'not_supervisor' then
    raise exception 'FALLO 1: un trabajador editó una tarea (%)', r ->> 'code';
  end if;
  if (select title from public.tasks where id = 'aaaa0000-0000-0000-0000-00000000000a')
     <> 'Titulo original' then
    raise exception 'FALLO 2: la tarea cambió pese al rechazo';
  end if;

  r := public.cancel_task('aaaa0000-0000-0000-0000-00000000000a', 'Porque sí');
  if r ->> 'code' <> 'not_supervisor' then
    raise exception 'FALLO 3: un trabajador canceló una tarea (%)', r ->> 'code';
  end if;
end $$;
\echo 'OK 1-3: editar y cancelar son del supervisor, y el rechazo no mueve nada'

-- =============================================================================
\echo '--- editar de verdad ---'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb; t public.tasks%rowtype;
begin
  r := public.edit_task('aaaa0000-0000-0000-0000-00000000000a',
                        'Titulo corregido', 'Detalle nuevo', 'high',
                        now() + interval '2 days', true);
  if (r ->> 'ok')::boolean is not true then raise exception 'FALLO 4: no pudo editar (%)', r; end if;

  select * into t from public.tasks where id = 'aaaa0000-0000-0000-0000-00000000000a';
  if t.title <> 'Titulo corregido' then raise exception 'FALLO 5: no cambió el título'; end if;
  if t.priority <> 'high' then raise exception 'FALLO 6: no cambió la prioridad'; end if;
  if t.requires_evidence is not true then raise exception 'FALLO 7: no cambió la evidencia'; end if;

  -- El evento que existía en el modelo desde la Fase 1 y nadie escribía.
  if not exists (
    select 1 from public.task_events e
    where e.task_id = 'aaaa0000-0000-0000-0000-00000000000a' and e.type = 'edited'
  ) then
    raise exception 'FALLO 8: no se registró el evento de edición';
  end if;

  -- Y el detalle de qué cambió, no un "editada" pelado.
  if (select note from public.task_events
      where task_id = 'aaaa0000-0000-0000-0000-00000000000a' and type = 'edited')
     not like '%prioridad: low → high%' then
    raise exception 'FALLO 9: el evento no dice qué cambió (%)',
      (select note from public.task_events
       where task_id = 'aaaa0000-0000-0000-0000-00000000000a' and type = 'edited');
  end if;
end $$;
\echo 'OK 4-9: edita y deja en el historial qué cambió, con el antes y el después'

\echo '--- editar sin cambiar nada no ensucia el historial ---'
do $$
declare r jsonb; v_antes int;
begin
  select count(*) into v_antes from public.task_events
  where task_id = 'aaaa0000-0000-0000-0000-00000000000a' and type = 'edited';

  r := public.edit_task('aaaa0000-0000-0000-0000-00000000000a',
                        'Titulo corregido', 'Detalle nuevo', 'high',
                        (select due_at from public.tasks
                         where id = 'aaaa0000-0000-0000-0000-00000000000a'), true);
  if r ->> 'code' <> 'unchanged' then
    raise exception 'FALLO 10: guardar sin cambios devolvió "%"', r ->> 'code';
  end if;

  if (select count(*) from public.task_events
      where task_id = 'aaaa0000-0000-0000-0000-00000000000a' and type = 'edited') <> v_antes then
    raise exception 'FALLO 11: guardar sin cambios escribió un evento igual';
  end if;
end $$;
\echo 'OK 10-11: apretar guardar sin tocar nada no deja rastro'

\echo '--- títulos inválidos ---'
do $$
declare r jsonb;
begin
  r := public.edit_task('aaaa0000-0000-0000-0000-00000000000a', 'ab', null, 'low', null, false);
  if r ->> 'code' <> 'bad_title' then raise exception 'FALLO 12: aceptó un título de 2 letras'; end if;

  r := public.edit_task('aaaa0000-0000-0000-0000-00000000000a', repeat('x', 141), null, 'low', null, false);
  if r ->> 'code' <> 'bad_title' then raise exception 'FALLO 13: aceptó un título de 141 caracteres'; end if;
end $$;
\echo 'OK 12-13: el título se valida antes de tocar la tabla'

-- =============================================================================
\echo '--- cancelar ---'
do $$
declare r jsonb; t public.tasks%rowtype;
begin
  r := public.cancel_task('bbbb0000-0000-0000-0000-00000000000b', '  ');
  if r ->> 'code' <> 'reason_required' then
    raise exception 'FALLO 14: canceló sin motivo (%)', r ->> 'code';
  end if;

  r := public.cancel_task('bbbb0000-0000-0000-0000-00000000000b', 'El cliente dio de baja el pedido.');
  if (r ->> 'ok')::boolean is not true then raise exception 'FALLO 15: no pudo cancelar (%)', r; end if;
  if (r ->> 'was_active')::boolean is not false then
    raise exception 'FALLO 16: dijo que le sacó la tarea a alguien y estaba en la cola';
  end if;

  select * into t from public.tasks where id = 'bbbb0000-0000-0000-0000-00000000000b';
  if t.status <> 'cancelled' then raise exception 'FALLO 17: no quedó cancelada'; end if;
  if t.cancelled_at is null then raise exception 'FALLO 18: falta cancelled_at'; end if;

  if not exists (
    select 1 from public.task_events e
    where e.task_id = 'bbbb0000-0000-0000-0000-00000000000b'
      and e.type = 'cancelled'
      and e.note = 'El cliente dio de baja el pedido.'
  ) then
    raise exception 'FALLO 19: el historial no guardó la cancelación con su motivo';
  end if;

  -- Y sale de la cola.
  if exists (select 1 from public.available_queue()
             where id = 'bbbb0000-0000-0000-0000-00000000000b') then
    raise exception 'FALLO 20: la tarea cancelada sigue en la cola';
  end if;

  r := public.cancel_task('bbbb0000-0000-0000-0000-00000000000b', 'De nuevo');
  if r ->> 'code' <> 'not_cancellable' then
    raise exception 'FALLO 21: se canceló dos veces (%)', r ->> 'code';
  end if;
end $$;
\echo 'OK 14-21: cancela con motivo, sale de la cola, y no se cancela dos veces'

\echo '--- cancelar algo que alguien está haciendo ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.claim_task('cccc0000-0000-0000-0000-00000000000c');
  if (r ->> 'ok')::boolean is not true then raise exception 'setup: no pudo tomar'; end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb; t public.tasks%rowtype; v_carga int;
begin
  r := public.cancel_task('cccc0000-0000-0000-0000-00000000000c',
                          'Se resolvió por otro lado, no la hagas.');
  if (r ->> 'ok')::boolean is not true then raise exception 'FALLO 22: no pudo cancelar la activa'; end if;
  if (r ->> 'was_active')::boolean is not true then
    raise exception 'FALLO 23: no avisó que se la sacó a alguien que estaba trabajando';
  end if;

  select * into t from public.tasks where id = 'cccc0000-0000-0000-0000-00000000000c';
  -- El asignado se conserva: quién la tenía al cancelarse es parte del registro.
  if t.assignee_id is null then
    raise exception 'FALLO 24: se perdió quién la tenía al cancelarla';
  end if;

  -- Pero deja de contar en su carga.
  select active_count into v_carga from public.team_load()
  where id = '22222222-2222-2222-2222-222222222222';
  if v_carga <> 0 then
    raise exception 'FALLO 25: la cancelada le sigue contando (%) en la carga', v_carga;
  end if;

  if not exists (
    select 1 from public.task_events e
    where e.task_id = 'cccc0000-0000-0000-0000-00000000000c'
      and e.type = 'cancelled'
      and e.subject_id = '22222222-2222-2222-2222-222222222222'
  ) then
    raise exception 'FALLO 26: el historial no dice a quién se la sacaron';
  end if;
end $$;
\echo 'OK 22-26: se conserva quién la tenía, deja de contarle, y queda en el historial'

\echo '--- lo cerrado y lo cancelado no se edita ---'
do $$
declare r jsonb;
begin
  r := public.edit_task('bbbb0000-0000-0000-0000-00000000000b', 'Reescrita', null, 'high', null, false);
  if r ->> 'code' <> 'not_editable' then
    raise exception 'FALLO 27: se editó una tarea cancelada (%)', r ->> 'code';
  end if;
end $$;
reset role;
\echo 'OK 27: el registro no es un borrador'

-- =============================================================================
\echo '--- los avisos de una tarea cancelada se limpian solos ---'
reset request.jwt.claim.sub;
insert into public.tasks (id, title, priority, status, available_since, created_by)
values ('dddd0000-0000-0000-0000-00000000000d', 'Vieja', 'low', 'available',
        now() - interval '30 hours', '11111111-1111-1111-1111-111111111111');
do $$
declare r jsonb;
begin
  r := public.sweep_stale_tasks();
  if (r ->> 'created')::int <> 1 then raise exception 'setup: no generó el aviso'; end if;
end $$;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb;
begin
  r := public.cancel_task('dddd0000-0000-0000-0000-00000000000d', 'Ya no hace falta.');
end $$;
reset role;
reset request.jwt.claim.sub;
do $$
declare r jsonb;
begin
  r := public.sweep_stale_tasks();
  if (select count(*) from public.alerts) <> 0 then
    raise exception 'FALLO 28: quedó un aviso de una tarea cancelada';
  end if;
end $$;
\echo 'OK 28: cancelar resuelve el aviso, como tomarla o cerrarla'

-- =============================================================================
\echo '--- tiempo real: la tabla está publicada ---'
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    raise exception 'FALLO 29: `tasks` no está en la publicación supabase_realtime, el cliente no va a recibir nada';
  end if;
end $$;
\echo 'OK 29: `tasks` publicada para tiempo real'

-- =============================================================================
\echo '--- la razón por la que una tarea dejó de estar viaja en la respuesta ---'
-- Si no viniera el estado, la interfaz le diría "la tomó otra persona" a quien
-- toca Tomar en una tarea que el supervisor canceló. Sería mentirle.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare r jsonb;
begin
  r := public.claim_task('bbbb0000-0000-0000-0000-00000000000b');
  if r ->> 'code' <> 'already_taken' then
    raise exception 'FALLO 30: código inesperado (%)', r ->> 'code';
  end if;
  if r ->> 'status' <> 'cancelled' then
    raise exception 'FALLO 31: no dice que el motivo fue una cancelación (%)', r;
  end if;
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare r jsonb;
begin
  r := public.assign_task('bbbb0000-0000-0000-0000-00000000000b',
                          '22222222-2222-2222-2222-222222222222');
  if r ->> 'status' <> 'cancelled' then
    raise exception 'FALLO 32: asignar tampoco distingue cancelada de tomada (%)', r;
  end if;
end $$;
reset role;
\echo 'OK 30-32: tomar y asignar dicen si fue cancelación o si llegaron tarde'

\echo ''
\echo '========================================'
\echo '  32 pruebas de editar, cancelar y publicación: PASARON'
\echo '========================================'
