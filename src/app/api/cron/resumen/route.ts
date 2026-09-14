import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderDigest } from "@/lib/email/digest";
import { enviarCorreo } from "@/lib/email/send";
import { TIME_ZONE } from "@/lib/format";
import type { Digest } from "@/lib/types";

/**
 * Resumen diario por correo.
 *
 * La dispara el cron de Vercel, que manda `Authorization: Bearer $CRON_SECRET`.
 * Corre una vez por día, que es exactamente lo que permite el plan gratis y
 * exactamente lo que necesita un resumen diario. Los avisos que miden horas no
 * pasan por acá: ésos los genera pg_cron cada quince minutos dentro de la base.
 *
 * Sin CRON_SECRET la ruta se niega a responder. Una ruta que arma un informe de
 * la operación no puede quedar abierta a internet porque falte una variable.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET no está configurado" },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY no está configurada" },
      { status: 503 },
    );
  }

  const { data, error } = await supabase.rpc("daily_digest");

  if (error || !data || !data.ok) {
    return NextResponse.json(
      { ok: false, error: "no se pudo armar el resumen" },
      { status: 500 },
    );
  }

  const digest = data as Digest;
  const correo = renderDigest(digest, TIME_ZONE);
  const envio = await enviarCorreo(correo);

  /*
   * El resumen vuelve en la respuesta aunque el correo no se haya enviado. Así
   * la tarea programada sirve desde el primer día: los registros de Vercel
   * muestran qué está atrasado aunque todavía no haya cuenta de correo.
   */
  return NextResponse.json({
    ok: true,
    envio,
    asunto: correo.subject,
    resumen: {
      totales: digest.totals,
      sin_tomar: digest.stale_available.length,
      sin_cerrar: digest.stale_active.length,
      pasados_de_tope: digest.over_limit.length,
    },
  });
}
