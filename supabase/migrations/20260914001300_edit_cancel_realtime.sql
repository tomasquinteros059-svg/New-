-- =============================================================================
-- Huecos que dejó el QA: editar, cancelar y tiempo real
--
-- Hasta acá el supervisor tenía una política de UPDATE amplia sobre `tasks`,
-- que la aplicación no usaba nunca. Eso dejaba abierta la puerta a cambiar una
-- tarea por la API sin que quedara nada en el historial. Se cierra: TODO cambio
-- pasa por una función, y toda función escribe su evento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- edit_task — corregir una tarea ya creada
--
-- El tipo de evento 'edited' existía en el modelo desde la Fase 1 y nadie lo
-- escribía. Ahora se escribe, y con el detalle de qué cambió: "prioridad: media
-- → alta" explica mucho más que "editada".
-- -----------------------------------------------------------------------------

create or replace function public.edit_task(
  p_task_id uuid,
  p_title text,
  p_description text,
  p_priority public.task_priority,
  p_due_at timestamptz,
  p_requires_evidence boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_task public.tasks%rowtype;
  v_changes text[] := '{}';
  v_note text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'no_session');
  end if;

  if not public.is_supervisor() then
    return jsonb_build_object('ok', false, 'code', 'not_supervisor');
  end if;

  if length(v_title) < 3 or length(v_title) > 140 then
    return jsonb_build_object('ok', false, 'code', 'bad_title');
  end if;

  if v_desc is not null and length(v_desc) > 4000 then
    return jsonb_build_object('ok', false, 'code', 'bad_description');
  end if;

  select * into v_task from public.tasks t where t.id = p_task_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Lo cerrado y lo cancelado es registro, no borrador.
  if v_task.status in ('closed', 'cancelled') then
    return jsonb_build_object('ok', false, 'code', 'not_editable', 'status', v_task.status);
  end if;

  -- Pedir evidencia sobre la marcha a alguien que ya está trabajando le cambia
  -- las reglas a mitad de camino. Se permite, pero queda anotado.
  -- array_append y no `||`: en Postgres, `text[] || text` intenta interpretar
  -- la cadena como un literal de arreglo y revienta con la primera tilde.
  if v_task.title is distinct from v_title then
    v_changes := array_append(v_changes, 'título');
  end if;
  if v_task.description is distinct from v_desc then
    v_changes := array_append(v_changes, 'descripción');
  end if;
  if v_task.priority is distinct from p_priority then
    v_changes := array_append(
      v_changes,
      'prioridad: ' || v_task.priority::text || ' → ' || p_priority::text
    );
  end if;
  if v_task.due_at is distinct from p_due_at then
    v_changes := array_append(v_changes, 'fecha límite');
  end if;
  if v_task.requires_evidence is distinct from p_requires_evidence then
    v_changes := array_append(
      v_changes,
      case when p_requires_evidence then 'ahora pide evidencia' else 'ya no pide evidencia' end
    );
  end if;

  if array_length(v_changes, 1) is null then
    return jsonb_build_object('ok', true, 'code', 'unchanged');
  end if;

  update public.tasks t
     set title = v_title,
         description = v_desc,
         priority = p_priority,
         due_at = p_due_at,
         requires_evidence = p_requires_evidence
   where t.id = p_task_id;

  v_note := left(array_to_string(v_changes, ', '), 1000);

  insert into public.task_events (task_id, actor_id, subject_id, type, note)
  values (p_task_id, v_user, v_task.assignee_id, 'edited', v_note);

  return jsonb_build_object('ok', true, 'code', 'edited', 'changes', v_note);
end;
$$;

-- -----------------------------------------------------------------------------
-- cancel_task — sacar una tarea de circulación
--
-- El estado 'cancelled' existía desde la Fase 1 y no había forma de llegar a
-- él. Se conserva el asignado: quién la tenía cuando se canceló es parte del
-- registro, y como `mis-tareas` y `team_load()` filtran por 'active', no le
-- queda contando en la carga de nadie.
-- -----------------------------------------------------------------------------

create or replace function public.cancel_task(p_task_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_task public.tasks%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'no_session');
  end if;

  if not public.is_supervisor() then
    return jsonb_build_object('ok', false, 'code', 'not_supervisor');
  end if;

  if length(v_reason) < 3 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;

  if length(v_reason) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'reason_too_long');
  end if;

  select * into v_task from public.tasks t where t.id = p_task_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_task.status in ('closed', 'cancelled') then
    return jsonb_build_object('ok', false, 'code', 'not_cancellable', 'status', v_task.status);
  end if;

  update public.tasks t
     set status = 'cancelled',
         cancelled_at = now()
   where t.id = p_task_id;

  insert into public.task_events (task_id, actor_id, subject_id, type, note)
  values (p_task_id, v_user, v_task.assignee_id, 'cancelled', v_reason);

  return jsonb_build_object(
    'ok', true,
    'code', 'cancelled',
    -- Si se la sacó a alguien que estaba trabajando, la interfaz lo dice.
    'was_active', v_task.status = 'active'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Se cierra el UPDATE directo sobre tasks
--
-- La política amplia de supervisor no la usaba nadie y permitía cambiar una
-- tarea por la API sin dejar rastro en el historial. Ahora todo cambio de
-- estado y todo cambio de contenido pasa por una función que escribe su evento.
-- -----------------------------------------------------------------------------

drop policy if exists "tasks_update_supervisor" on public.tasks;
revoke update on public.tasks from authenticated;

-- -----------------------------------------------------------------------------
-- Tiempo real
--
-- Era parte de la razón por la que se eligió Supabase y había quedado sin
-- hacer: la cola no se actualizaba sola y la lista mentía entre recargas.
--
-- Se publica `tasks` para que el cliente reciba los cambios. RLS se sigue
-- aplicando por suscriptor: cada uno recibe solo lo que ya podía ver.
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    execute 'alter publication supabase_realtime add table public.tasks';
  end if;
end;
$$;

revoke execute on function public.edit_task(uuid, text, text, public.task_priority, timestamptz, boolean) from public, anon;
revoke execute on function public.cancel_task(uuid, text) from public, anon;

grant execute on function public.edit_task(uuid, text, text, public.task_priority, timestamptz, boolean) to authenticated;
grant execute on function public.cancel_task(uuid, text) to authenticated;
