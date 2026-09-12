-- =============================================================================
-- Fase 1 — Row Level Security
--
-- Convenciones aplicadas en TODAS las políticas, según la guía vigente de
-- Supabase:
--   * `to authenticated` siempre. Sin eso la política se evalúa también para
--     `anon`, y `auth.uid()` devolviendo null no es una defensa.
--   * `(select auth.uid())` y `(select public.is_supervisor())` envueltos en
--     subconsulta: el planner los evalúa una vez por sentencia en lugar de una
--     vez por fila. La diferencia medida por Supabase es de dos órdenes de
--     magnitud en tablas grandes.
--   * Una política por operación, no `for all`.
--   * Índice en toda columna que aparezca en una política (ver migración 0001).
--
-- NO usamos `force row level security`: los triggers SECURITY DEFINER de la
-- migración 0002 son del dueño de las tablas y necesitan saltearse RLS para
-- escribir el historial.
-- =============================================================================

alter table public.profiles      enable row level security;
alter table public.tasks         enable row level security;
alter table public.task_events   enable row level security;
alter table public.app_settings  enable row level security;

-- -----------------------------------------------------------------------------
-- Privilegios de tabla
--
-- Supabase concede permisos amplios por defecto a `anon` y `authenticated`.
-- RLS filtra filas, pero el privilegio de tabla es la primera puerta: la
-- cerramos explícitamente en vez de confiar en el default.
-- -----------------------------------------------------------------------------

revoke all on public.profiles     from anon, public;
revoke all on public.tasks        from anon, public;
revoke all on public.task_events  from anon, public;
revoke all on public.app_settings from anon, public;

revoke all on public.profiles     from authenticated;
revoke all on public.tasks        from authenticated;
revoke all on public.task_events  from authenticated;
revoke all on public.app_settings from authenticated;

grant select, update          on public.profiles     to authenticated;
grant select, insert, update  on public.tasks        to authenticated;
grant select                  on public.task_events  to authenticated;
grant select, update          on public.app_settings to authenticated;

-- Nadie borra nada: las tareas se cancelan, los eventos son append-only y los
-- perfiles se van por cascada cuando se borra el usuario en auth.users.

-- -----------------------------------------------------------------------------
-- profiles
--
-- Decisión 5: el trabajador ve nombre, rol y presencia de todo el equipo para
-- poder coordinarse. Lo que no ve es el detalle de las tareas ajenas, y eso lo
-- gobierna la política de `tasks`, no ésta.
-- -----------------------------------------------------------------------------

create policy "profiles_select_all_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- El UPDATE sobre columnas privilegiadas lo bloquea el trigger
-- profiles_guard_privileged_columns. RLS decide QUÉ FILA; el trigger decide
-- QUÉ COLUMNA.
create policy "profiles_update_self_or_supervisor"
  on public.profiles for update
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_supervisor())
  )
  with check (
    id = (select auth.uid())
    or (select public.is_supervisor())
  );

-- Sin política de INSERT: los perfiles los crea el trigger on_auth_user_created.
-- Sin política de DELETE: cascada desde auth.users.

-- -----------------------------------------------------------------------------
-- tasks
-- -----------------------------------------------------------------------------

create policy "tasks_select_visible"
  on public.tasks for select
  to authenticated
  using (
    (select public.is_supervisor())
    or status = 'available'
    or assignee_id = (select auth.uid())
  );

-- Crear tareas es potestad del supervisor. Se fuerza el estado inicial: una
-- tarea nace disponible y sin dueño. Asignar es otra operación.
create policy "tasks_insert_supervisor"
  on public.tasks for insert
  to authenticated
  with check (
    (select public.is_supervisor())
    and created_by = (select auth.uid())
    and status = 'available'
    and assignee_id is null
  );

-- Solo el supervisor edita tareas directamente (título, prioridad, fecha).
--
-- El trabajador NO tiene política de UPDATE a propósito: tomar, cerrar y
-- soltar van por funciones RPC en Fase 2. Una transición de estado necesita
-- validar el límite de tareas activas y escribir el historial en el mismo
-- paso; un UPDATE suelto desde el cliente no puede garantizar eso.
create policy "tasks_update_supervisor"
  on public.tasks for update
  to authenticated
  using ((select public.is_supervisor()))
  with check ((select public.is_supervisor()));

-- -----------------------------------------------------------------------------
-- task_events
--
-- El supervisor ve el historial completo, incluidas todas las soltadas con su
-- motivo. El trabajador ve solo lo suyo.
-- -----------------------------------------------------------------------------

create policy "task_events_select_own_or_supervisor"
  on public.task_events for select
  to authenticated
  using (
    (select public.is_supervisor())
    or actor_id = (select auth.uid())
    or subject_id = (select auth.uid())
  );

-- Sin políticas de escritura: los eventos los escriben triggers y RPCs.

-- -----------------------------------------------------------------------------
-- app_settings
-- -----------------------------------------------------------------------------

create policy "app_settings_select_all_authenticated"
  on public.app_settings for select
  to authenticated
  using (true);

create policy "app_settings_update_supervisor"
  on public.app_settings for update
  to authenticated
  using ((select public.is_supervisor()))
  with check ((select public.is_supervisor()));
