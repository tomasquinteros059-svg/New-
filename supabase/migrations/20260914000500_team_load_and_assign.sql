-- =============================================================================
-- Fase 3 — Capacidad del equipo y asignación directa
--
-- Dos piezas:
--   * team_load(): la foto del equipo. Cuántas activas lleva cada uno contra su
--     tope, y desde cuándo. Es una función y no una vista porque tiene que
--     saltearse RLS para contar las tareas de todos, y al mismo tiempo negarse
--     a responderle a quien no es supervisor.
--   * assign_task(): el supervisor le pasa una tarea a alguien.
--
-- La asimetría del límite es deliberada y está en la especificación: el tope es
-- DURO para tomar (claim_task rebota con at_limit) y BLANDO para asignar (esto
-- entra igual, pero avisa). Tomar es una decisión de la persona; asignar es una
-- orden, y el sistema no le discute una orden al supervisor: le muestra el
-- costo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- team_load — la carga de cada persona
--
-- La capacidad se DERIVA contando. No hay contador guardado en profiles, que
-- sería una segunda fuente de verdad y se desincronizaría al primer error.
-- Con un equipo de decenas de personas, el índice parcial
-- tasks_active_by_assignee_idx hace que contar sea gratis.
-- -----------------------------------------------------------------------------

create or replace function public.team_load()
returns table (
  id uuid,
  full_name text,
  role public.app_role,
  is_present boolean,
  active_task_limit smallint,
  active_count integer,
  oldest_active_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.role,
    p.is_present,
    p.active_task_limit,
    coalesce(a.cnt, 0)::integer,
    a.oldest
  from public.profiles p
  left join (
    select t.assignee_id, count(*) as cnt, min(t.assigned_at) as oldest
    from public.tasks t
    where t.status = 'active'
    group by t.assignee_id
  ) a on a.assignee_id = p.id
  -- La puerta: para quien no es supervisor, esto devuelve cero filas.
  where (select public.is_supervisor())
  order by
    p.is_present desc,
    coalesce(a.cnt, 0)::numeric / nullif(p.active_task_limit, 0) desc nulls last,
    p.full_name asc;
$$;

-- -----------------------------------------------------------------------------
-- assign_task — el supervisor le entrega una tarea a alguien
--
-- Mismo orden de bloqueo que claim_task: perfil y después tarea. Si dos
-- funciones tomaran los bloqueos en orden distinto, dos transacciones
-- simultáneas se traban en espejo.
--
-- Solo se asignan tareas DISPONIBLES. Reasignar lo que alguien ya está
-- haciendo sería interrumpirlo, y la especificación pide lo contrario:
-- "asignar no interrumpe, entra a su lista".
-- -----------------------------------------------------------------------------

create or replace function public.assign_task(p_task_id uuid, p_assignee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_assignee public.profiles%rowtype;
  v_active integer;
  v_status public.task_status;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'no_session');
  end if;

  if not public.is_supervisor() then
    return jsonb_build_object('ok', false, 'code', 'not_supervisor');
  end if;

  select * into v_assignee
  from public.profiles p
  where p.id = p_assignee_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_assignee');
  end if;

  select count(*) into v_active
  from public.tasks t
  where t.assignee_id = p_assignee_id
    and t.status = 'active';

  update public.tasks t
     set status = 'active',
         assignee_id = p_assignee_id,
         assignment_kind = 'assigned',
         assigned_at = now()
   where t.id = p_task_id
     and t.status = 'available';

  if not found then
    select t.status into v_status from public.tasks t where t.id = p_task_id;

    if v_status is null then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;

    -- Alguien la tomó mientras el supervisor elegía a quién dársela.
    return jsonb_build_object('ok', false, 'code', 'not_available', 'status', v_status);
  end if;

  insert into public.task_events (task_id, actor_id, subject_id, type)
  values (p_task_id, v_user, p_assignee_id, 'assigned');

  -- Entró igual, pero el supervisor se entera de lo que acaba de hacer.
  return jsonb_build_object(
    'ok', true,
    'code', 'assigned',
    'over_limit', (v_active + 1) > v_assignee.active_task_limit,
    'not_present', not v_assignee.is_present,
    'active', v_active + 1,
    'limit', v_assignee.active_task_limit,
    'assignee_name', v_assignee.full_name
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------

revoke execute on function public.team_load() from public, anon;
revoke execute on function public.assign_task(uuid, uuid) from public, anon;

grant execute on function public.team_load() to authenticated;
grant execute on function public.assign_task(uuid, uuid) to authenticated;
