import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type Aviso = {
  title: string;
  body: string;
  /** A dónde lleva al tocarla. */
  url?: string;
  /** Avisos con el mismo tag se reemplazan en vez de apilarse. */
  tag?: string;
};

let configurado = false;

function configurar(): boolean {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const contacto = process.env.VAPID_CONTACT_EMAIL;

  if (!publica || !privada || !contacto) return false;
  if (!configurado) {
    webpush.setVapidDetails(`mailto:${contacto}`, publica, privada);
    configurado = true;
  }
  return true;
}

/**
 * Manda un aviso a todos los dispositivos de varias personas.
 *
 * Nunca lanza. Un push que falla no puede voltear la acción que lo disparó: si
 * asignar una tarea funcionó, asignar una tarea funcionó, aunque el teléfono
 * de la persona esté apagado o el navegador haya revocado el permiso.
 *
 * Lee las suscripciones con la service_role key porque quien dispara el aviso
 * (el supervisor que asigna) no tiene ni debe tener permiso para leer los
 * endpoints de otros: son credenciales.
 */
export async function avisar(profileIds: string[], aviso: Aviso): Promise<{
  enviados: number;
  fallidos: number;
  motivo?: "sin-configurar";
}> {
  if (profileIds.length === 0) return { enviados: 0, fallidos: 0 };
  if (!configurar()) return { enviados: 0, fallidos: 0, motivo: "sin-configurar" };

  const supabase = createAdminClient();
  if (!supabase) return { enviados: 0, fallidos: 0, motivo: "sin-configurar" };

  const { data: suscripciones } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("profile_id", profileIds);

  if (!suscripciones || suscripciones.length === 0) return { enviados: 0, fallidos: 0 };

  const carga = JSON.stringify(aviso);
  let enviados = 0;
  let fallidos = 0;
  const muertas: string[] = [];

  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          carga,
        );
        enviados += 1;
      } catch (error) {
        fallidos += 1;
        const status = (error as { statusCode?: number }).statusCode;
        // 404 y 410 significan que el navegador tiró la suscripción: se
        // desinstaló la app, se limpiaron los datos, se revocó el permiso.
        // Guardarlas sería acumular basura que falla para siempre.
        if (status === 404 || status === 410) muertas.push(s.endpoint);
      }
    }),
  );

  if (muertas.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", muertas);
  }

  return { enviados, fallidos };
}
