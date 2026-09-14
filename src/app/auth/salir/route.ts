import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Salida de emergencia.
 *
 * Corta la sesión y devuelve al login. Existe para un solo caso: una sesión
 * válida cuyo usuario no tiene perfil. Sin esto la aplicación queda en un
 * bucle de redirecciones, porque el proxy ve la sesión y rebota a la cola,
 * que a su vez rebota al login.
 *
 * El cierre de sesión normal está en la pantalla de Cuenta y va por POST.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const motivo = searchParams.get("motivo");

  const supabase = await createClient();
  await supabase.auth.signOut();

  const destino = motivo === "perfil" ? "/login?error=perfil" : "/login";
  return NextResponse.redirect(`${origin}${destino}`);
}
