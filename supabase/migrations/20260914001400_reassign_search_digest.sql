-- =============================================================================
-- Lo que faltaba: reasignar, buscar y el resumen diario
-- =============================================================================

-- -----------------------------------------------------------------------------
-- reassign_task — pasarle una tarea activa a otra persona, en un paso
--
-- Antes había que soltarla y volver a asignarla: dos acciones por tarea, y la
-- tarea pasaba por la cola en el medio, donde cualquiera podía tomarla. Con
-- tres tareas de alguien que se fue con licencia, eran seis pasos y tres
-- ventanas de carrera.
--
-- NO se registra como 'released': la tarea nunca volvió a la cola, y ponerla en
-- el historial de soltadas sería decir algo que no pasó. Queda un solo evento
-- 'assigned' que dice de quién venía.
-- -----------------------------------------------------------------------------

create or replace function public.reassign_task(
  p_task_id uuid,
  p_assignee_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_new public.profiles%rowtype;
  v_previous public.profiles%rowtype;
  v_task public.tasks%rowtype;
  v_active integer;
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

  -- Mismo orden de bloqueo que en todo el resto: perfil y después tarea.
  select * into v_new from public.profiles p where p.id = p_assignee_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_assignee');
  end if;

  select count(*) into v_active
  from public.tasks t
  where t.assignee_id = p_assignee_id and t.status = 'active';

  select * into v_task from public.tasks t where t.id = p_task_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_task.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'not_active', 'status', v_task.status);
  end if;

  if v_task.assignee_id = p_assignee_id then
    return jsonb_build_object('ok', false, 'code', 'same_person');
  end if;

  select * into v_previous from public.profiles p where p.id = v_task.assignee_id;

  update public.tasks t
     set assignee_id = p_assignee_id,
         assignment_kind = 'assigned',
         assigned_at = now()
   where t.id = p_task_id;

  insert into public.task_events (task_id, actor_id, subject_id, type, note)
  values (
    p_task_id, v_user, p_assignee_id, 'assigned',
    left('reasignada desde ' || coalesce(v_previous.full_name, 'alguien') || ': ' || v_reason, 1000)
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'reassigned',
    'over_limit', (v_active + 1) > v_new.active_task_limit,
    'not_present', not v_new.is_present,
    'active', v_active + 1,
    'limit', v_new.active_task_limit,
    'assignee_name', v_new.full_name,
    'previous_name', coalesce(v_previous.full_name, 'alguien')
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- available_queue ahora acepta una búsqueda
--
-- Se reemplaza la versión sin parámetros para no dejar dos funciones con el
-- mismo nombre: PostgREST no sabría a cuál llamar.
--
-- La coincidencia es por posición de texto y no con ILIKE '%...%': un '%' o un
-- '_' tipeado por alguien en el buscador actuaría como comodín y devolvería
-- resultados que no pidió.
-- -----------------------------------------------------------------------------

drop function if exists public.available_queue();

create or replace function public.available_queue(
  p_search text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  title text,
  description text,
  priority public.task_priority,
  due_at timestamptz,
  available_since timestamptz,
  requires_evidence boolean,
  is_stale boolean,
  stale_after_hours integer,
  total_count integer
)
language sql
stable
set search_path = ''
as $$
  with s as (
    select a.stale_available_hours as h from public.app_settings a where a.id
  ),
  needle as (
    select nullif(btrim(coalesce(p_search, '')), '') as q
  ),
  matched as (
    select t.*
    from public.tasks t, needle n
    where t.status = 'available'
      and (
        n.q is null
        or position(lower(n.q) in lower(t.title)) > 0
        or position(lower(n.q) in lower(coalesce(t.description, ''))) > 0
      )
  )
  select
    m.id,
    m.title,
    m.description,
    m.priority,
    m.due_at,
    m.available_since,
    m.requires_evidence,
    m.available_since < now() - make_interval(hours => (select s.h from s)),
    (select s.h from s),
    -- Cuántas coinciden en total, para poder decir "mostrando 100 de 340" en
    -- vez de recortar en silencio.
    (select count(*)::integer from matched)
  from matched m
  order by
    (m.available_since < now() - make_interval(hours => (select s.h from s))) desc,
    m.priority desc,
    m.due_at asc nulls last,
    m.available_since asc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

-- -----------------------------------------------------------------------------
-- person_tasks — qué tiene una persona ahora mismo
--
-- El panel de equipo decía cuántas, no cuáles. Para saber qué estaba haciendo
-- alguien había que ir tarea por tarea.
-- -----------------------------------------------------------------------------

create or replace function public.person_tasks(p_person_id uuid)
returns table (
  id uuid,
  title text,
  priority public.task_priority,
  due_at timestamptz,
  assigned_at timestamptz,
  assignment_kind public.assignment_kind,
  requires_evidence boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.title, t.priority, t.due_at, t.assigned_at,
         t.assignment_kind, t.requires_evidence
  from public.tasks t
  where t.assignee_id = p_person_id
    and t.status = 'active'
    -- El supervisor ve la de cualquiera; cada uno ve la suya.
    and ((select public.is_supervisor()) or p_person_id = (select auth.uid()))
  order by t.priority desc, t.due_at asc nulls last, t.assigned_at asc;
$$;

revoke execute on function public.reassign_task(uuid, uuid, text) from public, anon;
revoke execute on function public.available_queue(text, integer) from public, anon;
revoke execute on function public.person_tasks(uuid) from public, anon;

grant execute on function public.reassign_task(uuid, uuid, text) to authenticated;
grant execute on function public.available_queue(text, integer) to authenticated;
grant execute on function public.person_tasks(uuid) to authenticated;
