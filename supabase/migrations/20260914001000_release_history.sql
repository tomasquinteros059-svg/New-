-- =============================================================================
-- Fase 4 — Historial de soltadas
--
-- "Cada soltada queda registrada con quién, cuándo y por qué. El supervisor
-- puede ver este historial."
--
-- Los datos ya están en task_events desde la Fase 1; esto es solo la consulta
-- con el contexto pegado. Se hace como función y no con embeddings de PostgREST
-- para que el permiso viva en un solo lugar y se pueda probar.
-- =============================================================================

create or replace function public.release_history(p_limit integer default 50)
returns table (
  id bigint,
  task_id uuid,
  title text,
  status public.task_status,
  reason text,
  released_at timestamptz,
  actor_name text,
  subject_name text,
  -- Falso cuando el supervisor le sacó la tarea a alguien, en vez de que la
  -- persona la soltara sola. Son dos hechos distintos y se leen distinto.
  self_released boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    e.task_id,
    t.title,
    t.status,
    e.note,
    e.created_at,
    actor.full_name,
    subject.full_name,
    (e.actor_id is not distinct from e.subject_id)
  from public.task_events e
  join public.tasks t on t.id = e.task_id
  left join public.profiles actor on actor.id = e.actor_id
  left join public.profiles subject on subject.id = e.subject_id
  where e.type = 'released'
    and (select public.is_supervisor())
  order by e.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke execute on function public.release_history(integer) from public, anon;
grant execute on function public.release_history(integer) to authenticated;
