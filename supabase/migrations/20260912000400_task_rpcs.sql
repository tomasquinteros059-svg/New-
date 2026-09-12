-- =============================================================================
-- Fase 2 — Transiciones de estado
--
-- Por qué RPC y no UPDATE desde el cliente:
--
--   Tomar una tarea es TRES cosas que tienen que pasar juntas o no pasar:
--   validar el límite de tareas activas, cambiar el estado, y escribir el
--   historial. Un UPDATE suelto desde el navegador no puede garantizar eso, y
--   el trabajador ni siquiera tiene política de UPDATE sobre `tasks`.
--
-- Estas funciones son SECURITY DEFINER: se saltean RLS a propósito, porque son
-- ellas las que aplican las reglas. Todas llevan `set search_path = ''`.
--
-- Devuelven jsonb con la forma { ok, code, ... } en vez de tirar excepción: un
-- segundo que llega tarde a una tarea no es un error del sistema, es un
-- resultado esperado que la interfaz tiene que saber explicar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- claim_task — el trabajador toma una tarea disponible
--
-- Orden de bloqueo: SIEMPRE perfil y después tarea. Si dos funciones tomaran
-- los mismos bloqueos en orden distinto, dos transacciones simultáneas se
-- traban en espejo (deadlock).
--
-- El bloqueo del perfil es lo que hace confiable el conteo: sin él, dos
-- pedidos simultáneos de la misma persona pueden contar 2 activas cada uno,
-- pasar el límite de 3 los dos, y dejarla con 4.
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

  select count(*) into v_active
  from public.tasks t
  where t.assignee_id = v_user
    and t.status = 'active';

  if v_active >= v_limit then
    return jsonb_build_object(
      'ok', false, 'code', 'at_limit',
      'active', v_active, 'limit', v_limit
    );
  end if;

  -- El corazón del asunto: un solo UPDATE condicionado por el estado.
  -- Si otra transacción está tomando la misma tarea, ésta espera a que aquélla
  -- confirme y entonces vuelve a evaluar el WHERE, que ya no se cumple.
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
-- close_task — cerrar con nota obligatoria
--
-- Cierra quien la tiene, o un supervisor. La nota mínima es la misma que
-- exige el CHECK de la tabla: si alguien se saltea esta función, la base de
-- datos sigue sin aceptar un cierre vacío.
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

  -- La evidencia obligatoria (requires_evidence) llega en la Fase 4, junto con
  -- la subida de archivos. Hasta entonces la columna se muestra pero no traba
  -- el cierre: trabarlo ahora dejaría tareas imposibles de cerrar.

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

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------

revoke execute on function public.claim_task(uuid) from public, anon;
revoke execute on function public.close_task(uuid, text) from public, anon;

grant execute on function public.claim_task(uuid) to authenticated;
grant execute on function public.close_task(uuid, text) to authenticated;
