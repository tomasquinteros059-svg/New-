-- =============================================================================
-- Notificaciones push
--
-- El correo diario llega una vez por día. Esto llega al teléfono en el momento,
-- que es lo que hacía falta para que "te asignaron una tarea" sirva de algo.
--
-- Cada suscripción es un endpoint del navegador más dos claves. Son
-- credenciales: quien las tiene puede mandarle notificaciones a esa persona.
-- Por eso NADIE las lee desde la aplicación, ni siquiera el supervisor; las
-- lee el servidor con la service_role key, al momento de enviar.
-- =============================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,

  -- Un endpoint identifica un navegador en un dispositivo. Único: volver a
  -- suscribirse desde el mismo teléfono actualiza, no duplica.
  endpoint text not null unique check (length(endpoint) between 10 and 1000),
  p256dh text not null,
  auth text not null,

  -- Para que la persona reconozca cuál es cuál al desconectar un dispositivo.
  label text,

  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  -- Cuántos envíos seguidos fallaron. El servidor borra la suscripción cuando
  -- el navegador responde que ya no existe.
  failures smallint not null default 0
);

create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

revoke all on public.push_subscriptions from anon, public, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Cada uno maneja SOLO las suyas. Un supervisor tampoco ve las de otro: no le
-- hacen falta para nada, y son credenciales.
create policy "push_select_own" on public.push_subscriptions for select
  to authenticated using (profile_id = (select auth.uid()));

create policy "push_insert_own" on public.push_subscriptions for insert
  to authenticated with check (profile_id = (select auth.uid()));

create policy "push_update_own" on public.push_subscriptions for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "push_delete_own" on public.push_subscriptions for delete
  to authenticated using (profile_id = (select auth.uid()));
