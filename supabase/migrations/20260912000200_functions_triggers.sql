-- =============================================================================
-- Fase 1 — Funciones y triggers
--
-- `is_supervisor()` es SECURITY DEFINER a propósito: si una política de
-- `tasks` consultara `profiles` directamente y `profiles` tuviera una política
-- que a su vez mire `profiles`, Postgres entra en recursión infinita y toda
-- consulta falla. SECURITY DEFINER se saltea RLS y corta el ciclo.
--
-- Toda función lleva `set search_path = ''` y referencias calificadas: sin eso,
-- una SECURITY DEFINER es un agujero de escalada de privilegios.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ¿Quién consulta es supervisor?
-- STABLE para que, envuelta en (select ...), se evalúe una vez por sentencia y
-- no una vez por fila.
-- -----------------------------------------------------------------------------

create or replace function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'supervisor'
  );
$$;

revoke execute on function public.is_supervisor() from public, anon;
grant execute on function public.is_supervisor() to authenticated;

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

create trigger app_settings_touch_updated_at
  before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- profiles: proteger las columnas privilegiadas
--
-- RLS filtra filas, no columnas. Sin este guardia, la política "podés editar tu
-- propia fila" deja que un trabajador se ascienda a supervisor o se suba el
-- límite de tareas. Los GRANT por columna no sirven acá porque supervisores y
-- trabajadores son ambos el rol `authenticated`.
-- -----------------------------------------------------------------------------

create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'no se puede cambiar el id de un perfil'
      using errcode = '42501';
  end if;

  -- Sin JWT no hay usuario final: es la consola SQL, una migración o
  -- service_role, o sea una operación administrativa. Esta puerta es la que
  -- permite promover al PRIMER supervisor; sin ella nadie podría hacerlo nunca,
  -- porque is_supervisor() sería falso para siempre.
  --
  -- `anon` también tiene auth.uid() null, pero no llega hasta acá: no tiene el
  -- privilegio de UPDATE sobre profiles ni política que lo habilite.
  if (select auth.uid()) is null then
    new.updated_at := now();
    return new;
  end if;

  if (new.role is distinct from old.role
      or new.active_task_limit is distinct from old.active_task_limit)
     and not public.is_supervisor()
  then
    raise exception 'solo un supervisor puede cambiar el rol o el límite de tareas'
      using errcode = '42501';
  end if;

  -- No dejar la organización sin ningún supervisor: si pasa, nadie puede
  -- volver a promover a nadie sin entrar a la base de datos a mano.
  if old.role = 'supervisor' and new.role <> 'supervisor' then
    if (select count(*) from public.profiles p where p.role = 'supervisor') <= 1 then
      raise exception 'no se puede quitar al último supervisor'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- -----------------------------------------------------------------------------
-- Alta de usuario: crear el perfil espejo
--
-- El rol se fija SIEMPRE en 'worker'. `raw_user_meta_data` lo controla quien se
-- registra, así que leer el rol de ahí permitiría autoproclamarse supervisor.
-- El primer supervisor se promueve a mano (ver README).
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit smallint;
begin
  select s.default_active_task_limit into v_limit
  from public.app_settings s
  where s.id;

  insert into public.profiles (id, full_name, role, active_task_limit)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Sin nombre'
    ),
    'worker',
    coalesce(v_limit, 3)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- task_events: append-only de verdad
--
-- Las políticas RLS no alcanzan porque `service_role` las ignora. Un trigger
-- no lo ignora nadie.
-- -----------------------------------------------------------------------------

create or replace function public.task_events_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'task_events es append-only: no se puede % un evento', lower(tg_op)
    using errcode = '42501';
end;
$$;

create trigger task_events_no_update
  before update on public.task_events
  for each row execute function public.task_events_is_append_only();

create trigger task_events_no_delete
  before delete on public.task_events
  for each row execute function public.task_events_is_append_only();

-- -----------------------------------------------------------------------------
-- Auditoría: toda tarea creada deja su evento
--
-- SECURITY DEFINER para poder escribir en task_events sin abrirle a los
-- clientes un INSERT directo sobre el historial.
-- -----------------------------------------------------------------------------

create or replace function public.log_task_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_events (task_id, actor_id, type)
  values (new.id, new.created_by, 'created');
  return new;
end;
$$;

create trigger tasks_log_created
  after insert on public.tasks
  for each row execute function public.log_task_created();
