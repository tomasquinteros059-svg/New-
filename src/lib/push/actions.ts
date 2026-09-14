"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/dal";

/**
 * Guardar y borrar la suscripción de ESTE dispositivo.
 *
 * Van por RLS directo: cada persona solo puede tocar las suyas, y la política
 * ya lo dice. No hace falta una función encima.
 */
export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  label?: string;
}): Promise<{ ok: boolean }> {
  const { userId } = await requireSession();

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      label: input.label ?? null,
    },
    { onConflict: "endpoint" },
  );

  return { ok: !error };
}

export async function deletePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  await requireSession();

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  return { ok: !error };
}
