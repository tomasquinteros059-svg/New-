-- =============================================================================
-- Fase 4 — Storage para la evidencia
--
-- Bucket PRIVADO. Una foto de una avería puede mostrar una instalación, una
-- patente o la cara de alguien; nada de eso va a una URL pública adivinable.
-- Se lee con URLs firmadas de duración corta.
--
-- El permiso sale de la ruta: dentro del bucket `evidence`, el primer segmento
-- es el id de la tarea. Quien tiene esa tarea activa puede escribir en su
-- carpeta, y nadie más.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cast defensivo
--
-- `(storage.foldername(name))[1]::uuid` revienta si alguien sube un archivo a
-- una carpeta con cualquier otro nombre, y una política que revienta es una
-- política que bloquea todo. Esto devuelve null en vez de fallar.
-- -----------------------------------------------------------------------------

create or replace function public.safe_uuid(p text)
returns uuid
language plpgsql
immutable
strict
as $$
begin
  return p::uuid;
exception
  when others then
    return null;
end;
$$;

grant execute on function public.safe_uuid(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  26214400,  -- 25 MB: una foto de teléfono entra con holgura
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- En Supabase, storage.objects ya tiene RLS activo y pertenece a otro rol.
-- En el arnés de pruebas hay que activarlo a mano.
do $$
begin
  begin
    alter table storage.objects enable row level security;
  exception
    when insufficient_privilege or wrong_object_type then null;
  end;
end;
$$;

drop policy if exists "evidence_insert_own_active_task" on storage.objects;
drop policy if exists "evidence_select_visible" on storage.objects;

-- Escribe quien tiene la tarea activa. El supervisor también, por si sube la
-- evidencia desde su propio teléfono estando en terreno.
create policy "evidence_insert_own_active_task"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidence'
    and exists (
      select 1
      from public.tasks t
      where t.id = public.safe_uuid((storage.foldername(name))[1])
        and t.status = 'active'
        and (
          t.assignee_id = (select auth.uid())
          or (select public.is_supervisor())
        )
    )
  );

-- Lee el supervisor siempre, y quien tiene o tuvo la tarea. La evidencia sigue
-- siendo visible después de cerrada: para eso se pidió.
create policy "evidence_select_visible"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'evidence'
    and (
      (select public.is_supervisor())
      or exists (
        select 1
        from public.tasks t
        where t.id = public.safe_uuid((storage.foldername(name))[1])
          and t.assignee_id = (select auth.uid())
      )
    )
  );

-- Sin políticas de UPDATE ni DELETE: la evidencia no se corrige ni se borra.
