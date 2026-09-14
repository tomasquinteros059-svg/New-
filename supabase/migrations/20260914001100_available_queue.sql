-- =============================================================================
-- Fase 4 — La cola, con la marca de estancada
--
-- El "sube automáticamente de prioridad" de la especificación, en su versión no
-- destructiva: la tarea vieja salta al principio de la lista y se marca, pero
-- la prioridad que puso el supervisor NO se pisa. Un UPDATE que sube la
-- prioridad perdería el dato original para siempre, y una tarea que se toma y
-- se suelta en círculo escalaría hasta 'alta' y se quedaría ahí.
--
-- El corte de antigüedad se calcula en Postgres y no en el servidor web: es
-- donde viven todas las demás marcas de tiempo, y así no hay desfase de reloj
-- entre la aplicación y la base.
--
-- SECURITY INVOKER (el default): RLS sigue gobernando. No hace falta saltearla
-- porque las tareas disponibles ya son visibles para todos.
-- =============================================================================

create or replace function public.available_queue()
returns table (
  id uuid,
  title text,
  description text,
  priority public.task_priority,
  due_at timestamptz,
  available_since timestamptz,
  requires_evidence boolean,
  is_stale boolean,
  stale_after_hours integer
)
language sql
stable
set search_path = ''
as $$
  with s as (
    select a.stale_available_hours as h from public.app_settings a where a.id
  )
  select
    t.id,
    t.title,
    t.description,
    t.priority,
    t.due_at,
    t.available_since,
    t.requires_evidence,
    t.available_since < now() - make_interval(hours => (select s.h from s)),
    (select s.h from s)
  from public.tasks t
  where t.status = 'available'
  order by
    -- Estancadas primero; dentro de cada grupo, el orden de la especificación.
    (t.available_since < now() - make_interval(hours => (select s.h from s))) desc,
    t.priority desc,
    t.due_at asc nulls last,
    t.available_since asc;
$$;

revoke execute on function public.available_queue() from public, anon;
grant execute on function public.available_queue() to authenticated;
