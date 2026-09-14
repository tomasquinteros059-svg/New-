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

  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  /*
   * Sesión válida sin fila en `profiles`.
   *
   * Pasa de verdad: si alguien crea su usuario en el panel de Supabase ANTES
   * de aplicar las migraciones, el trigger de alta todavía no existe y queda
   * una cuenta huérfana. `ensure_profile()` la repara sola.
   */
  if (!profile) {
    await supabase.rpc("ensure_profile");
    ({ data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle());
  }

  /*
   * Si ni siquiera así hay perfil, NO se puede devolver null y dejar que
   * requireSession mande a /login: el proxy ve una sesión válida en /login y
   * rebota a /mis-tareas, que vuelve a /login. Bucle infinito y pantalla de
   * error del navegador, sin ninguna explicación.
   *
   * La única salida es cortar la sesión.
   */
  if (!profile) redirect("/auth/salir?motivo=perfil");

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
