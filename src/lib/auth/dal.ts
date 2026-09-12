import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type Session = {
  userId: string;
  email: string | null;
  profile: Profile;
};

/**
 * Data Access Layer.
 *
 * Toda pantalla entra por acá. `cache()` deduplica: si el layout y la página
 * piden la sesión, se resuelve una sola vez por request.
 *
 * Se usa `getUser()` y nunca `getSession()`: `getSession()` lee la cookie sin
 * validarla contra el servidor de auth, y la cookie la controla el navegador.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Usuario autenticado sin perfil: solo pasa si el trigger de alta falló.
  // Mejor tratarlo como sin sesión que renderizar media pantalla rota.
  if (!profile) return null;

  return { userId: user.id, email: user.email ?? null, profile };
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Puerta de supervisor en la interfaz. No es la defensa: la defensa es RLS.
 * Esto solo evita mostrar una pantalla que igual vendría vacía.
 */
export async function requireSupervisor(): Promise<Session> {
  const session = await requireSession();
  if (session.profile.role !== "supervisor") redirect("/mis-tareas");
  return session;
}
