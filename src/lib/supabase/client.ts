import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import type { Database } from "@/lib/types";

/** Cliente de Supabase para componentes de cliente ("use client"). */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY());
}
