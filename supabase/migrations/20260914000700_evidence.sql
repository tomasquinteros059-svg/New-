-- =============================================================================
-- Fase 4 — Evidencia de cierre
--
-- El archivo vive en Supabase Storage; acá queda el registro de que existe, con
-- quién lo subió y cuándo. Dos lugares, una sola verdad: la fila manda, y las
-- políticas de Storage (migración 0008) usan la misma convención de rutas.
--
-- Convención: dentro del bucket `evidence`, la ruta es `<task_id>/<archivo>`.
-- El primer segmento de la ruta ES el id de la tarea, y de ahí sale el permiso.
-- =============================================================================

create table public.task_evidence (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,

  -- Ruta dentro del bucket. Única: dos filas no pueden apuntar al mismo archivo.
  storage_path text not null unique
    check (length(storage_path) between 3 and 512),

  mime_type text check (mime_type is null or length(mime_type) <= 120),
  size_bytes integer check (size_bytes is null or size_bytes between 0 and 26214400),

  created_at timestamptz not null default now()
);

create index task_evidence_task_idx on public.task_evidence (task_id, created_at desc);
create index task_evidence_uploader_idx on public.task_evidence (uploaded_by);

alter table public.task_evidence enable row level security;

revoke all on public.task_evidence from anon, public, authenticated;
grant select on public.task_evidence to authenticated;

-- Ve la evidencia quien ve la tarea: el supervisor siempre, y quien la tiene o
-- la tuvo. La escritura va por attach_evidence, no por política.
create policy "task_evidence_select_visible"
  on public.task_evidence for select
  to authenticated
  using (
    (select public.is_supervisor())
    or exists (
      select 1 from public.tasks t
      where t.id = task_id
        and t.assignee_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- attach_evidence — registrar un archivo ya subido
--
-- El navegador sube a Storage y después llama a esto. Si la subida quedó
-- huérfana porque el registro falló, el archivo existe pero no cuenta: la
-- verdad es la fila, no el archivo.
-- -----------------------------------------------------------------------------

create or replace function public.attach_evidence(
  p_task_id uuid,
  p_path text,
  p_mime text default null,
  p_size integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_task public.tasks%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'no_session');
  end if;

  select * into v_task from public.tasks t where t.id = p_task_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_task.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'not_active', 'status', v_task.status);
  end if;

  if v_task.assignee_id <> v_user and not public.is_supervisor() then
    return jsonb_build_object('ok', false, 'code', 'not_yours');
  end if;

  -- La ruta tiene que caer dentro de la carpeta de ESTA tarea. Sin este
  -- chequeo, alguien podría registrar como evidencia propia un archivo de otra.
  if p_path is null or p_path not like (p_task_id::text || '/%') then
    return jsonb_build_object('ok', false, 'code', 'bad_path');
  end if;

  insert into public.task_evidence (task_id, uploaded_by, storage_path, mime_type, size_bytes)
  values (p_task_id, v_user, p_path, p_mime, p_size)
  on conflict (storage_path) do nothing;

  return jsonb_build_object(
    'ok', true,
    'code', 'attached',
    'count', (select count(*) from public.task_evidence e where e.task_id = p_task_id)
  );
end;
$$;

revoke execute on function public.attach_evidence(uuid, text, text, integer) from public, anon;
grant execute on function public.attach_evidence(uuid, text, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- close_task ahora exige la evidencia cuando la tarea la pide
--
-- Se reemplaza la función entera porque en la Fase 2 el chequeo estaba
-- deliberadamente afuera: sin subida de archivos, exigirla habría dejado tareas
-- imposibles de cerrar.
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
     and not exists (select 1 from public.task_evidence e where e.task_id = p_task_id)
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
