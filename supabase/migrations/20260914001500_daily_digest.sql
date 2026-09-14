-- =============================================================================
-- Resumen diario
--
-- El aviso de rescate existe aunque nadie mire, pero vive dentro de la
-- aplicación: si el supervisor no la abre, no se entera. Esto arma el contenido
-- de un correo diario.
--
-- La función solo ARMA el resumen. Enviarlo es problema de la aplicación, y así
-- cambiar de proveedor de correo no toca la base de datos.
--
-- Sin sesión (el trabajo programado) pasa; con sesión, solo un supervisor.
-- =============================================================================

create or replace function public.daily_digest()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x integer;
  v_y integer;
  v_result jsonb;
begin
  if (select auth.uid()) is not null and not public.is_supervisor() then
    return jsonb_build_object('ok', false, 'code', 'not_supervisor');
  end if;

  select s.stale_available_hours, s.stale_active_hours into v_x, v_y
  from public.app_settings s where s.id;

  select jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'thresholds', jsonb_build_object('stale_available_hours', v_x, 'stale_active_hours', v_y),

    'totals', jsonb_build_object(
      'available', (select count(*) from public.tasks where status = 'available'),
      'active',    (select count(*) from public.tasks where status = 'active'),
      'closed_last_24h', (
        select count(*) from public.tasks
        where status = 'closed' and closed_at >= now() - interval '24 hours'
      ),
      'released_last_24h', (
        select count(*) from public.task_events
        where type = 'released' and created_at >= now() - interval '24 hours'
      )
    ),

    -- Lo que nadie toma.
    'stale_available', coalesce((
      select jsonb_agg(x order by x ->> 'waiting_hours' desc)
      from (
        select jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'priority', t.priority,
          'waiting_hours', floor(extract(epoch from (now() - t.available_since)) / 3600)::integer
        ) as x
        from public.tasks t
        where t.status = 'available'
          and t.available_since < now() - make_interval(hours => v_x)
      ) q
    ), '[]'::jsonb),

    -- Lo que alguien tiene y no cierra.
    'stale_active', coalesce((
      select jsonb_agg(x order by x ->> 'open_hours' desc)
      from (
        select jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'priority', t.priority,
          'assignee', p.full_name,
          'open_hours', floor(extract(epoch from (now() - t.assigned_at)) / 3600)::integer
        ) as x
        from public.tasks t
        left join public.profiles p on p.id = t.assignee_id
        where t.status = 'active'
          and t.assigned_at < now() - make_interval(hours => v_y)
      ) q
    ), '[]'::jsonb),

    -- Y quién está pasado de su tope, que es la otra cara del mismo problema.
    'over_limit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.full_name,
        'active', c.cnt,
        'limit', p.active_task_limit
      ))
      from public.profiles p
      join (
        select t.assignee_id, count(*) as cnt
        from public.tasks t
        where t.status = 'active'
        group by t.assignee_id
      ) c on c.assignee_id = p.id
      where c.cnt > p.active_task_limit
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.daily_digest() from public, anon;
grant execute on function public.daily_digest() to authenticated, service_role;
