import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";
import type { Database } from "@/lib/types";

/**
 * Cliente con la service_role key.
 *
 * Se saltea TODAS las políticas de seguridad. Existe para un solo uso: la tarea
 * programada del resumen diario, que corre sin ninguna persona detrás y por lo
 * tanto sin sesión.
 *
 * La clave es de servidor y nunca lleva el prefijo NEXT_PUBLIC_, así que no
 * puede terminar en el navegador ni por accidente. Devuelve null si no está
 * configurada, para que la ruta pueda explicarlo en vez de reventar.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;

  return createSupabaseClient<Database>(SUPABASE_URL(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
