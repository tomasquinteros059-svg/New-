-- =============================================================================
-- Fase 4 — Rescate de tareas olvidadas
--
-- El criterio de la fase dice "una tarea abandonada genera aviso sola, sin que
-- nadie la toque". Eso descarta calcular los avisos cuando alguien abre la
-- pantalla: el aviso tiene que EXISTIR aunque nadie mire.
--
-- Por eso hay una tabla, y un barrido que la llena. El barrido lo dispara
-- pg_cron dentro de la propia base de datos (ver README): sin HTTP, sin llaves
-- y sin depender del cron de Vercel, que en el plan gratis corre una sola vez
-- por día y no sirve para umbrales medidos en horas.
--
-- X e Y salen de app_settings. No hay números escritos a fuego acá.
-- =============================================================================

create type public.alert_type as enum ('stale_available', 'stale_active');

create table public.alerts (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  type public.alert_type not null,

  -- El umbral vigente cuando se generó. Si mañana lo cambian, el aviso viejo
  -- sigue explicando con qué regla se disparó.
  threshold_hours integer not null,

  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles (id) on delete set null,

  -- Un aviso por tarea y tipo. El barrido borra los que dejan de aplicar, así
  -- que una tarea que se estanca, se rescata y se vuelve a estancar genera un
  -- aviso nuevo.
  unique (task_id, type)
);

create index alerts_open_idx on public.alerts (created_at desc) where acknowledged_at is null;
create index alerts_task_idx on public.alerts (task_id);

alter table public.alerts enable row level security;

revoke all on public.alerts from anon, public, authenticated;
grant select on public.alerts to authenticated;

-- El aviso es para el supervisor. Un trabajador no necesita ver que el resto
-- del equipo tiene trabajo atrasado.
create policy "alerts_select_supervisor"
  on public.alerts for select
  to authenticated
  using ((select public.is_supervisor()));

-- -----------------------------------------------------------------------------
-- sweep_stale_tasks — el barrido
--
-- Idempotente: correrlo diez veces seguidas deja lo mismo que correrlo una.
-- -----------------------------------------------------------------------------

create or replace function public.sweep_stale_tasks()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x integer;
  v_y integer;
  v_created integer := 0;
  v_cleared integer := 0;
  v_n integer;
begin
  -- Llamada desde la aplicación: solo un supervisor puede forzar el barrido.
  -- Llamada desde pg_cron: no hay JWT, auth.uid() es null, y pasa de largo.
  if (select auth.uid()) is not null and not public.is_supervisor() then
    return jsonb_build_object('ok', false, 'code', 'not_supervisor');
  end if;

  select s.stale_available_hours, s.stale_active_hours
    into v_x, v_y
  from public.app_settings s
  where s.id;

  -- Disponibles que nadie tomó en X horas.
  insert into public.alerts (task_id, type, threshold_hours)
  select t.id, 'stale_available', v_x
  from public.tasks t
  where t.status = 'available'
    and t.available_since < now() - make_interval(hours => v_x)
  on conflict (task_id, type) do nothing;
  get diagnostics v_n = row_count;
  v_created := v_created + v_n;

  -- Activas que nadie cerró en Y horas.
  insert into public.alerts (task_id, type, threshold_hours)
  select t.id, 'stale_active', v_y
  from public.tasks t
  where t.status = 'active'
    and t.assigned_at < now() - make_interval(hours => v_y)
  on conflict (task_id, type) do nothing;
  get diagnostics v_n = row_count;
  v_created := v_created + v_n;

  -- Y limpia los que dejaron de aplicar, para que la tabla sea la foto de lo
  -- que pasa AHORA y no un registro histórico. El historial ya vive en
  -- task_events.
  delete from public.alerts a
  using public.tasks t
  where t.id = a.task_id
    and (
      (
        a.type = 'stale_available'
        and (
          t.status <> 'available'
          or t.available_since >= now() - make_interval(hours => v_x)
        )
      )
      or (
        a.type = 'stale_active'
        and (
          t.status <> 'active'
          or t.assigned_at >= now() - make_interval(hours => v_y)
        )
      )
    );
  get diagnostics v_n = row_count;
  v_cleared := v_n;

  return jsonb_build_object(
    'ok', true,
    'code', 'swept',
    'created', v_created,
    'cleared', v_cleared,
    'stale_available_hours', v_x,
    'stale_active_hours', v_y
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- acknowledge_alert — el supervisor da por visto un aviso
--
-- No borra: si la tarea sigue estancada, el aviso sigue ahí, marcado como
-- visto. Lo que lo borra es que la situación se resuelva.
-- -----------------------------------------------------------------------------

create or replace function public.acknowledge_alert(p_alert_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'no_session');
  end if;

  if not public.is_supervisor() then
    return jsonb_build_object('ok', false, 'code', 'not_supervisor');
  end if;

  update public.alerts a
     set acknowledged_at = now(),
         acknowledged_by = v_user
   where a.id = p_alert_id
     and a.acknowledged_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'code', 'acknowledged');
end;
$$;

-- -----------------------------------------------------------------------------
-- open_alerts — los avisos con el contexto de su tarea, en una sola consulta
-- -----------------------------------------------------------------------------

create or replace function public.open_alerts()
returns table (
  id bigint,
  task_id uuid,
  type public.alert_type,
  threshold_hours integer,
  created_at timestamptz,
  acknowledged_at timestamptz,
  title text,
  priority public.task_priority,
  status public.task_status,
  stale_since timestamptz,
  assignee_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.task_id,
    a.type,
    a.threshold_hours,
    a.created_at,
    a.acknowledged_at,
    t.title,
    t.priority,
    t.status,
    case when a.type = 'stale_available' then t.available_since else t.assigned_at end,
    p.full_name
  from public.alerts a
  join public.tasks t on t.id = a.task_id
  left join public.profiles p on p.id = t.assignee_id
  where (select public.is_supervisor())
  order by a.acknowledged_at nulls first, t.priority desc, a.created_at asc;
$$;

revoke execute on function public.sweep_stale_tasks() from public, anon;
revoke execute on function public.acknowledge_alert(bigint) from public, anon;
revoke execute on function public.open_alerts() from public, anon;

grant execute on function public.sweep_stale_tasks() to authenticated;
grant execute on function public.acknowledge_alert(bigint) to authenticated;
grant execute on function public.open_alerts() to authenticated;
