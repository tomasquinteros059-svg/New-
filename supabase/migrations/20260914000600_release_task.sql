-- =============================================================================
-- Fase 4 — Soltar con motivo
--
-- La tarea vuelve a la cola y el reloj de antigüedad se REINICIA: para quien
-- mira la cola, esta tarea acaba de llegar. El costo de esa decisión es que una
-- tarea que se toma y se suelta en círculo nunca envejece, así que el churn
-- queda en `task_events` y el supervisor lo ve en el historial de soltadas.
-- =============================================================================

create or replace function public.release_task(p_task_id uuid, p_reason text)
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

  -- El motivo es obligatorio por la misma razón que la nota de cierre: sin él,
  -- el historial de soltadas es una lista de nombres que no explica nada.
  if length(v_reason) < 3 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;

  if length(v_reason) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'reason_too_long');
  end if;

  select * into v_task
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_task.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'not_active', 'status', v_task.status);
  end if;

  if v_task.assignee_id <> v_user and not public.is_supervisor() then
    return jsonb_build_object('ok', false, 'code', 'not_yours');
  end if;

  update public.tasks t
     set status = 'available',
         assignee_id = null,
         assignment_kind = null,
         assigned_at = null,
         available_since = now()
   where t.id = p_task_id;

  -- actor = quien la soltó; subject = quien la tenía. Son distintos cuando el
  -- supervisor le saca una tarea a alguien.
  insert into public.task_events (task_id, actor_id, subject_id, type, note)
  values (p_task_id, v_user, v_task.assignee_id, 'released', v_reason);

  return jsonb_build_object('ok', true, 'code', 'released', 'task_id', p_task_id);
end;
$$;

revoke execute on function public.release_task(uuid, text) from public, anon;
grant execute on function public.release_task(uuid, text) to authenticated;
