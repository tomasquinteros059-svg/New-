import type { Correo } from "@/lib/email/digest";

export type ResultadoEnvio =
  | { enviado: true; proveedor: string }
  | { enviado: false; motivo: "sin-configurar" | "error"; detalle?: string };

/**
 * Envío de correo.
 *
 * Deliberadamente chico y con un solo proveedor cableado por HTTP, sin SDK.
 * Si mañana se cambia de proveedor, se cambia esta función y nada más: el
 * contenido del correo lo arma digest.ts, que no sabe que el correo existe.
 *
 * Sin RESEND_API_KEY no falla: no envía y lo dice. Así la tarea programada
 * puede correr desde el primer día aunque todavía no haya cuenta de correo, y
 * el resumen queda disponible igual en la respuesta de la ruta.
 */
export async function enviarCorreo(correo: Correo): Promise<ResultadoEnvio> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESUMEN_FROM;
  const to = process.env.RESUMEN_TO;

  if (!apiKey || !from || !to) {
    return { enviado: false, motivo: "sin-configurar" };
  }

  try {
    const respuesta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        // Varios destinatarios separados por coma.
        to: to.split(",").map((d) => d.trim()).filter(Boolean),
        subject: correo.subject,
        text: correo.text,
        html: correo.html,
      }),
    });

    if (!respuesta.ok) {
      return {
        enviado: false,
        motivo: "error",
        detalle: `${respuesta.status} ${await respuesta.text().catch(() => "")}`.slice(0, 300),
      };
    }

    return { enviado: true, proveedor: "resend" };
  } catch (error) {
    return {
      enviado: false,
      motivo: "error",
      detalle: error instanceof Error ? error.message : "desconocido",
    };
  }
}
