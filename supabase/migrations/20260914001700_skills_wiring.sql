-- =============================================================================
-- Las habilidades entran en las reglas, y la cola aprende a paginar
-- =============================================================================

-- -----------------------------------------------------------------------------
-- claim_task: la etiqueta es un freno DURO, igual que el tope
--
-- Tomar es una decisión de la persona, y el sistema puede frenarla. Asignar es
-- una orden del supervisor y sigue siendo blando: entra, pero avisa qué le
-- falta. Misma asimetría que con el tope de tareas activas.
-- -----------------------------------------------------------------------------

create or replace function public.claim_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_limit smallint;
  v_active integer;
  v_status public.task_status;
  v_missing text[];
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'no_session');
  end if;

  select p.active_task_limit into v_limit
  from public.profiles p
  where p.id = v_user
  for update;

  if v_limit is null then
    return jsonb_build_object('ok', false, 'code', 'no_profile');
  end if;

  -- Antes que el tope: si no puede hacerla, el tope no es el problema.
  v_missing := public.missing_skill_names(v_user, p_task_id);
  if array_length(v_missing, 1) is not null then
    return jsonb_build_object(
      'ok', false, 'code', 'missing_skills', 'missing', to_jsonb(v_missing)
    );
  end if;

  select count(*) into v_active
  from public.tasks t
  where t.assignee_id = v_user
    and t.status = 'active';

  if v_active >= v_limit then
    return jsonb_build_object(
      'ok', false, 'code', 'at_limit', 'active', v_active, 'limit', v_limit
    );
  end if;

  update public.tasks t
     set status = 'active',
         assignee_id = v_user,
         assignment_kind = 'claimed',
         assigned_at = now()
   where t.id = p_task_id
     and t.status = 'available';

  if not found then
    select t.status into v_status from public.tasks t where t.id = p_task_id;

    if v_status is null then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;

    return jsonb_build_object('ok', false, 'code', 'already_taken', 'status', v_status);
  end if;

  insert into public.task_events (task_id, actor_id, subject_id, type)
  values (p_task_id, v_user, v_user, 'claimed');

  return jsonb_build_object('ok', true, 'code', 'claimed', 'task_id', p_task_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- assign_task y reassign_task: blandos, pero lo dicen
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
  v_missing text[];
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

  v_missing := public.missing_skill_names(p_assignee_id, p_task_id);

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

    return jsonb_build_object('ok', false, 'code', 'not_available', 'status', v_status);
  end if;

  insert into public.task_events (task_id, actor_id, subject_id, type)
  values (p_task_id, v_user, p_assignee_id, 'assigned');

  return jsonb_build_object(
    'ok', true,
    'code', 'assigned',
    'over_limit', (v_active + 1) > v_assignee.active_task_limit,
    'not_present', not v_assignee.is_present,
    'missing_skills', to_jsonb(v_missing),
    'active', v_active + 1,
    'limit', v_assignee.active_task_limit,
    'assignee_name', v_assignee.full_name
  );
end;
$$;

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
  v_missing text[];
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

  v_missing := public.missing_skill_names(p_assignee_id, p_task_id);
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
    'missing_skills', to_jsonb(v_missing),
    'active', v_active + 1,
    'limit', v_new.active_task_limit,
    'assignee_name', v_new.full_name,
    'previous_name', coalesce(v_previous.full_name, 'alguien')
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- available_queue: habilidades a la vista y paginación de verdad
--
-- Las tareas que no podés tomar NO se esconden: se muestran marcadas. Si se
-- escondieran, nadie sabría que existe trabajo esperando a alguien con esa
-- habilidad, que es justamente lo que el supervisor necesita ver.
-- -----------------------------------------------------------------------------

drop function if exists public.available_queue(text, integer);

create or replace function public.available_queue(
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
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
  total_count integer,
  required_skills text[],
  meets_skills boolean
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
    (select count(*)::integer from matched),
    coalesce((
      select array_agg(sk.name order by sk.name)
      from public.task_skills ts join public.skills sk on sk.id = ts.skill_id
      where ts.task_id = m.id
    ), '{}'),
    public.has_required_skills((select auth.uid()), m.id)
  from matched m
  order by
    (m.available_since < now() - make_interval(hours => (select s.h from s))) desc,
    m.priority desc,
    m.due_at asc nulls last,
    m.available_since asc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- -----------------------------------------------------------------------------
-- team_load suma las habilidades de cada uno
-- -----------------------------------------------------------------------------

-- Cambia el tipo de retorno (suma `skills`), así que hay que reemplazarla
-- entera: Postgres no deja cambiarle las columnas a una función existente.
drop function if exists public.team_load();

create or replace function public.team_load()
returns table (
  id uuid,
  full_name text,
  role public.app_role,
  is_present boolean,
  active_task_limit smallint,
  active_count integer,
  oldest_active_at timestamptz,
  skills text[]
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
    a.oldest,
    coalesce((
      select array_agg(sk.name order by sk.name)
      from public.profile_skills ps join public.skills sk on sk.id = ps.skill_id
      where ps.profile_id = p.id
    ), '{}')
  from public.profiles p
  left join (
    select t.assignee_id, count(*) as cnt, min(t.assigned_at) as oldest
    from public.tasks t
    where t.status = 'active'
    group by t.assignee_id
  ) a on a.assignee_id = p.id
  where (select public.is_supervisor())
  order by
    p.is_present desc,
    coalesce(a.cnt, 0)::numeric / nullif(p.active_task_limit, 0) desc nulls last,
    p.full_name asc;
$$;

revoke execute on function public.available_queue(text, integer, integer) from public, anon;
revoke execute on function public.team_load() from public, anon;

grant execute on function public.available_queue(text, integer, integer) to authenticated;
grant execute on function public.team_load() to authenticated;
