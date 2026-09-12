-- =============================================================================
-- Fase 1 — Esquema base
--
-- Principio rector: UNA sola fuente de verdad por hecho.
--   * `tasks` lleva el estado vigente (status + assignee_id). Como el asignado
--     es una columna de la propia tarea, una tarea no puede tener dos dueños:
--     la exclusividad la garantiza la fila, no una tabla aparte.
--   * `task_events` es el historial append-only. Nunca se actualiza ni se borra.
--
-- Todo lo que la especificación llamaba "asignaciones" quedó partido en esos
-- dos, porque mezclaba el vínculo vigente con el registro histórico.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

create type public.app_role as enum ('worker', 'supervisor');

-- El orden de declaración define el orden de comparación del enum.
-- 'high' es el mayor, así que la cola ordena con `priority desc`.
create type public.task_priority as enum ('low', 'medium', 'high');

create type public.task_status as enum ('available', 'active', 'closed', 'cancelled');

-- Cómo llegó la tarea a la persona. Se muestra distinto en la interfaz.
create type public.assignment_kind as enum ('claimed', 'assigned');

create type public.task_event_type as enum (
  'created', 'claimed', 'assigned', 'released', 'closed', 'cancelled', 'edited'
);

-- -----------------------------------------------------------------------------
-- app_settings — X e Y configurables (singleton)
--
-- La especificación exige que los umbrales de rescate NO estén escritos a fuego.
-- El truco del `id boolean primary key check (id)` fuerza una única fila.
-- -----------------------------------------------------------------------------

create table public.app_settings (
  id boolean primary key default true check (id),

  -- X: horas que una tarea puede estar disponible sin que nadie la tome.
  stale_available_hours integer not null default 12
    check (stale_available_hours between 1 and 720),

  -- Y: horas que una tarea puede estar activa sin cerrarse.
  stale_active_hours integer not null default 48
    check (stale_active_hours between 1 and 720),

  -- Límite de tareas activas que se le asigna a una cuenta nueva.
  default_active_task_limit smallint not null default 3
    check (default_active_task_limit between 1 and 20),

  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.app_settings (id) values (true);

comment on table public.app_settings is
  'Configuración global. Fila única. Los umbrales de rescate viven acá, no en el código.';

-- -----------------------------------------------------------------------------
-- profiles — espejo de auth.users
--
-- La identidad vive en auth.users, que no controlamos. Esta tabla cuelga de ahí.
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  full_name text not null
    check (length(btrim(full_name)) between 2 and 80),

  role public.app_role not null default 'worker',

  -- CAPACIDAD: techo de tareas simultáneas. Duro para tomar, blando para asignar.
  active_task_limit smallint not null default 3
    check (active_task_limit between 1 and 20),

  -- PRESENCIA: declaración manual de la persona ("estoy en turno").
  -- Deliberadamente distinto de la capacidad, que se deriva contando tareas
  -- activas. Colapsar ambos en un booleano era la contradicción de la spec.
  is_present boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.is_present is
  'Presencia declarada por la persona. La capacidad NO se guarda: se deriva contando tareas activas.';

-- -----------------------------------------------------------------------------
-- tasks
-- -----------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),

  title text not null
    check (length(btrim(title)) between 3 and 140),
  description text
    check (description is null or length(description) <= 4000),

  priority public.task_priority not null default 'medium',
  due_at timestamptz,

  status public.task_status not null default 'available',
  requires_evidence boolean not null default false,

  -- Vínculo vigente. Una columna, una fila: la doble toma es imposible.
  assignee_id uuid references public.profiles (id) on delete restrict,
  assignment_kind public.assignment_kind,
  assigned_at timestamptz,

  -- Reloj de antigüedad en cola. Se reinicia cada vez que la tarea vuelve a
  -- estar disponible; el churn queda registrado en task_events.
  available_since timestamptz not null default now(),

  closed_at timestamptz,
  closing_note text,

  cancelled_at timestamptz,

  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Coherencia entre estado y vínculo. Sin esto, un error de red deja tareas
  -- "activas" sin dueño: invisibles para todos y no tomables por nadie.
  constraint tasks_state_matches_assignee check (
    case status
      when 'available' then
        assignee_id is null and assignment_kind is null and assigned_at is null
      when 'active' then
        assignee_id is not null and assignment_kind is not null and assigned_at is not null
      when 'closed' then
        assignee_id is not null and assignment_kind is not null and assigned_at is not null
      when 'cancelled' then
        true
    end
  ),

  constraint tasks_closed_requires_note check (
    status <> 'closed'
    or (closed_at is not null and length(btrim(coalesce(closing_note, ''))) >= 3)
  ),

  constraint tasks_note_only_when_closed check (
    status = 'closed' or (closed_at is null and closing_note is null)
  ),

  constraint tasks_cancelled_at_only_when_cancelled check (
    (status = 'cancelled') = (cancelled_at is not null)
  )
);

-- Orden de la cola: prioridad, después fecha límite más cercana, después
-- antigüedad. Índice parcial porque solo se consultan las disponibles.
create index tasks_queue_idx
  on public.tasks (priority desc, due_at asc nulls last, available_since asc)
  where status = 'available';

-- Contar tareas activas por persona (capacidad derivada y panel de carga).
create index tasks_active_by_assignee_idx
  on public.tasks (assignee_id)
  where status = 'active';

-- Toda columna usada en una política RLS necesita índice.
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_created_by_idx on public.tasks (created_by);

-- -----------------------------------------------------------------------------
-- task_events — historial append-only
-- -----------------------------------------------------------------------------

create table public.task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,

  -- Quién hizo la acción.
  actor_id uuid references public.profiles (id) on delete set null,
  -- Sobre quién recae (a quién se le asignó / quién soltó).
  subject_id uuid references public.profiles (id) on delete set null,

  type public.task_event_type not null,

  -- Nota de cierre o motivo de soltada, según el tipo.
  note text check (note is null or length(note) <= 1000),

  created_at timestamptz not null default now()
);

create index task_events_task_idx on public.task_events (task_id, created_at desc);
create index task_events_actor_idx on public.task_events (actor_id);
create index task_events_subject_idx on public.task_events (subject_id);
create index task_events_released_idx
  on public.task_events (created_at desc)
  where type = 'released';

comment on table public.task_events is
  'Historial append-only. Un trigger bloquea UPDATE y DELETE, incluso para service_role.';
