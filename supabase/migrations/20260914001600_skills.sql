-- =============================================================================
-- Habilidades
--
-- Quedaron fuera desde el día uno por decisión: una cola única funciona y las
-- etiquetas se agregan después sin romper nada. Ahora se agregan.
--
-- Etiquetas simples, sin niveles. Si mañana importa distinguir junior de
-- senior, esto NO alcanza y hay que rediseñarlo: un nivel no es una etiqueta
-- más, es un orden, y cambia la pregunta de "¿la tiene?" a "¿le alcanza?".
--
-- La regla de la especificación: una tarea la puede tomar cualquiera que cumpla
-- TODAS las etiquetas que la tarea exige. Una tarea sin etiquetas la puede
-- tomar cualquiera.
-- =============================================================================

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 40),
  created_at timestamptz not null default now()
);

-- Único sin distinguir mayúsculas: "Soldadura" y "soldadura" son la misma.
create unique index skills_name_unique on public.skills (lower(btrim(name)));

create table public.profile_skills (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  primary key (profile_id, skill_id)
);

create index profile_skills_skill_idx on public.profile_skills (skill_id);

create table public.task_skills (
  task_id uuid not null references public.tasks (id) on delete cascade,
  -- `restrict` y no `cascade`: borrar una habilidad que alguna tarea exige
  -- cambiaría en silencio quién puede tomarla.
  skill_id uuid not null references public.skills (id) on delete restrict,
  primary key (task_id, skill_id)
);

create index task_skills_skill_idx on public.task_skills (skill_id);

alter table public.skills         enable row level security;
alter table public.profile_skills enable row level security;
alter table public.task_skills    enable row level security;

revoke all on public.skills         from anon, public, authenticated;
revoke all on public.profile_skills from anon, public, authenticated;
revoke all on public.task_skills    from anon, public, authenticated;

-- El catálogo lo mantiene el supervisor directamente: es una lista de nombres,
-- no una máquina de estados, y no hay historial que escribir.
grant select, insert, update, delete on public.skills to authenticated;
grant select on public.profile_skills to authenticated;
grant select on public.task_skills to authenticated;

-- Todos ven el catálogo: hace falta para entender por qué una tarea no se
-- puede tomar.
create policy "skills_select_all" on public.skills for select to authenticated using (true);
create policy "skills_write_supervisor" on public.skills for insert to authenticated
  with check ((select public.is_supervisor()));
create policy "skills_update_supervisor" on public.skills for update to authenticated
  using ((select public.is_supervisor())) with check ((select public.is_supervisor()));
create policy "skills_delete_supervisor" on public.skills for delete to authenticated
  using ((select public.is_supervisor()));

-- Quién sabe qué es información de equipo: si no se ve, nadie entiende por qué
-- una tarea quedó esperando.
create policy "profile_skills_select_all" on public.profile_skills for select
  to authenticated using (true);

create policy "task_skills_select_all" on public.task_skills for select
  to authenticated using (true);

-- Las escrituras van por función, para que queden en el historial de la tarea.

-- -----------------------------------------------------------------------------
-- has_required_skills — el corazón de la regla
--
-- Sin etiquetas exigidas, cualquiera. Con etiquetas, hay que tenerlas TODAS.
-- -----------------------------------------------------------------------------

create or replace function public.has_required_skills(p_user uuid, p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.task_skills ts
    where ts.task_id = p_task
      and not exists (
        select 1 from public.profile_skills ps
        where ps.profile_id = p_user and ps.skill_id = ts.skill_id
      )
  );
$$;

create or replace function public.missing_skill_names(p_user uuid, p_task uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(s.name order by s.name), '{}')
  from public.task_skills ts
  join public.skills s on s.id = ts.skill_id
  where ts.task_id = p_task
    and not exists (
      select 1 from public.profile_skills ps
      where ps.profile_id = p_user and ps.skill_id = ts.skill_id
    );
$$;

-- Los nombres que exige una tarea, en una llamada. Se hace como función y no
-- con un embedding de PostgREST para que el tipado no dependa de que la
-- librería adivine la relación entre dos tablas.
create or replace function public.task_skill_names(p_task_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(s.name order by s.name), '{}')
  from public.task_skills ts
  join public.skills s on s.id = ts.skill_id
  where ts.task_id = p_task_id;
$$;

-- -----------------------------------------------------------------------------
-- set_task_skills / set_profile_skills
-- -----------------------------------------------------------------------------

create or replace function public.set_task_skills(p_task_id uuid, p_skill_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_task public.tasks%rowtype;
  v_antes text;
  v_despues text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'no_session');
  end if;

  if not public.is_supervisor() then
    return jsonb_build_object('ok', false, 'code', 'not_supervisor');
  end if;

  select * into v_task from public.tasks t where t.id = p_task_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_task.status in ('closed', 'cancelled') then
    return jsonb_build_object('ok', false, 'code', 'not_editable', 'status', v_task.status);
  end if;

  select coalesce(string_agg(s.name, ', ' order by s.name), 'ninguna') into v_antes
  from public.task_skills ts join public.skills s on s.id = ts.skill_id
  where ts.task_id = p_task_id;

  delete from public.task_skills where task_id = p_task_id;

  insert into public.task_skills (task_id, skill_id)
  select p_task_id, sid
  from unnest(coalesce(p_skill_ids, '{}'::uuid[])) as sid
  where exists (select 1 from public.skills s where s.id = sid)
  on conflict do nothing;

  select coalesce(string_agg(s.name, ', ' order by s.name), 'ninguna') into v_despues
  from public.task_skills ts join public.skills s on s.id = ts.skill_id
  where ts.task_id = p_task_id;

  if v_antes is distinct from v_despues then
    insert into public.task_events (task_id, actor_id, subject_id, type, note)
    values (p_task_id, v_user, v_task.assignee_id, 'edited',
            left('habilidades: ' || v_antes || ' → ' || v_despues, 1000));
  end if;

  return jsonb_build_object('ok', true, 'code', 'saved', 'skills', v_despues);
end;
$$;

create or replace function public.set_profile_skills(p_profile_id uuid, p_skill_ids uuid[])
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

  if not exists (select 1 from public.profiles p where p.id = p_profile_id) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  delete from public.profile_skills where profile_id = p_profile_id;

  insert into public.profile_skills (profile_id, skill_id)
  select p_profile_id, sid
  from unnest(coalesce(p_skill_ids, '{}'::uuid[])) as sid
  where exists (select 1 from public.skills s where s.id = sid)
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true, 'code', 'saved',
    'count', (select count(*) from public.profile_skills where profile_id = p_profile_id)
  );
end;
$$;

revoke execute on function public.task_skill_names(uuid) from public, anon;
grant execute on function public.task_skill_names(uuid) to authenticated;

revoke execute on function public.has_required_skills(uuid, uuid) from public, anon;
revoke execute on function public.missing_skill_names(uuid, uuid) from public, anon;
revoke execute on function public.set_task_skills(uuid, uuid[]) from public, anon;
revoke execute on function public.set_profile_skills(uuid, uuid[]) from public, anon;

grant execute on function public.has_required_skills(uuid, uuid) to authenticated;
grant execute on function public.missing_skill_names(uuid, uuid) to authenticated;
grant execute on function public.set_task_skills(uuid, uuid[]) to authenticated;
grant execute on function public.set_profile_skills(uuid, uuid[]) to authenticated;
