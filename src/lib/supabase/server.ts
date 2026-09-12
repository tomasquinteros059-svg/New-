import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import type { Database } from "@/lib/types";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * `cookies()` es asíncrono desde Next.js 16: las versiones síncronas fueron
 * removidas, no deprecadas.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Un Server Component no puede escribir cookies. No es un problema:
          // el proxy ya refrescó la sesión antes de que se renderizara.
        }
      },
    },
  });
}
