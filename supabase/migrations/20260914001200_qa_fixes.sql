-- =============================================================================
-- Correcciones encontradas en el QA de las cuatro fases
--
-- 1. Un correo con una sola letra antes de la arroba rompía el alta de usuario
--    ENTERA, no solo el perfil.
-- 2. La evidencia se heredaba entre asignaciones: quien tomaba una tarea
--    soltada podía cerrarla con la foto del anterior.
-- 3. Quien subía evidencia dejaba de verla al soltar la tarea.
-- 4. Una sesión válida sin fila en profiles dejaba la aplicación en un bucle
--    de redirecciones.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El nombre siempre cumple el CHECK de la tabla
--
-- `profiles.full_name` exige entre 2 y 80 caracteres. El trigger de alta
-- derivaba el nombre de la parte local del correo sin mirar su largo, así que
-- 'a@empresa.cl' producía 'a', violaba el CHECK, la excepción subía por el
-- trigger AFTER INSERT y hacía fallar el INSERT en auth.users. Resultado: no se
-- podía crear ese usuario, con un error que no mencionaba el nombre por ningún
-- lado.
--
-- Una sola función deriva el nombre, y la usan el trigger y ensure_profile().
-- -----------------------------------------------------------------------------

create or replace function public.derive_full_name(p_meta jsonb, p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(btrim(coalesce(p_meta ->> 'full_name', ''))) >= 2
      then left(btrim(p_meta ->> 'full_name'), 80)
    when length(split_part(coalesce(p_email, ''), '@', 1)) >= 2
      then left(split_part(p_email, '@', 1), 80)
    else 'Sin nombre'
  end;
$$;

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
    public.derive_full_name(new.raw_user_meta_data, new.email),
    -- Siempre 'worker': raw_user_meta_data lo controla quien se registra.
    'worker',
    coalesce(v_limit, 3)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Autocuración del perfil faltante
--
-- Pasa de verdad: si alguien crea su usuario en el panel de Supabase ANTES de
-- aplicar las migraciones, el trigger todavía no existe y queda una cuenta sin
-- perfil. La aplicación no tenía cómo salir de ahí.
-- -----------------------------------------------------------------------------

create or replace function public.ensure_profile()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_meta jsonb;
  v_limit smallint;
begin
  if v_user is null then
    return false;
  end if;

  if exists (select 1 from public.profiles p where p.id = v_user) then
    return true;
  end if;

  select u.email, u.raw_user_meta_data into v_email, v_meta
  from auth.users u
  where u.id = v_user;

  if not found then
    return false;
  end if;

  select s.default_active_task_limit into v_limit
  from public.app_settings s
  where s.id;

  insert into public.profiles (id, full_name, role, active_task_limit)
  values (v_user, public.derive_full_name(v_meta, v_email), 'worker', coalesce(v_limit, 3))
  on conflict (id) do nothing;

  return true;
end;
$$;

revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Quien subió la evidencia la sigue viendo
--
-- Antes el permiso salía solo de ser el asignado actual. Al soltar la tarea,
-- assignee_id queda en null y la persona perdía de vista lo que ella misma
-- había subido.
-- -----------------------------------------------------------------------------

drop policy if exists "task_evidence_select_visible" on public.task_evidence;

create policy "task_evidence_select_visible"
  on public.task_evidence for select
  to authenticated
  using (
    (select public.is_supervisor())
    or uploaded_by = (select auth.uid())
    or exists (
      select 1 from public.tasks t
      where t.id = task_id
        and t.assignee_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- 2. La evidencia no se hereda entre asignaciones
--
-- Antes: Beto tomaba una tarea que pide evidencia, subía la foto, la soltaba;
-- Carla la tomaba y la cerraba sin subir nada, porque el chequeo solo miraba
-- si la TAREA tenía alguna evidencia. La foto de la tarea que hizo Carla
-- terminaba siendo la que sacó Beto.
--
-- Ahora cuenta solo la evidencia cargada desde que empezó la asignación actual.
-- La anterior no se borra: es historia, y el supervisor la sigue viendo.
-- -----------------------------------------------------------------------------

create or replace function public.close_task(p_task_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_note text := btrim(coalesce(p_note, ''));
  v_task public.tasks%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'no_session');
  end if;

  if length(v_note) < 3 then
    return jsonb_build_object('ok', false, 'code', 'note_required');
  end if;

  if length(v_note) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'note_too_long');
  end if;

  select * into v_task
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_task.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'not_active', 'status', v_task.status);
  end if;

  if v_task.assignee_id <> v_user and not public.is_supervisor() then
    return jsonb_build_object('ok', false, 'code', 'not_yours');
  end if;

  if v_task.requires_evidence
     and not exists (
       select 1 from public.task_evidence e
       where e.task_id = p_task_id
         and e.created_at >= v_task.assigned_at
     )
  then
    return jsonb_build_object('ok', false, 'code', 'evidence_required');
  end if;

  update public.tasks t
     set status = 'closed',
         closed_at = now(),
         closing_note = v_note
   where t.id = p_task_id;

  insert into public.task_events (task_id, actor_id, subject_id, type, note)
  values (p_task_id, v_user, v_task.assignee_id, 'closed', v_note);

  return jsonb_build_object('ok', true, 'code', 'closed', 'task_id', p_task_id);
end;
$$;
