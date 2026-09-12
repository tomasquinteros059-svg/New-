import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino del link mágico. Supabase redirige acá con `?code=` (flujo PKCE) y
 * cambiamos ese código por una sesión.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const volverParam = searchParams.get("volver") ?? "/mis-tareas";

  // Solo rutas internas: sin esto, `?volver=https://otro-sitio` convierte el
  // callback en un redirector abierto.
  const volver =
    volverParam.startsWith("/") && !volverParam.startsWith("//") ? volverParam : "/mis-tareas";

  if (searchParams.get("error")) {
    const reason =
      searchParams.get("error_code") === "otp_expired" ? "expirado" : "invalido";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=invalido`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=expirado`);
  }

  return NextResponse.redirect(`${origin}${volver}`);
}
