import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import type { Database } from "@/lib/types";

/** Rutas que se pueden ver sin sesión. */
const PUBLIC_PREFIXES = ["/login", "/auth"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refresca el token de Supabase y hace el redirect optimista.
 *
 * La guía de autenticación de Next.js es explícita: el proxy sirve para
 * chequeos optimistas, NO es la capa de autorización. Acá solo decidimos
 * "¿hay sesión?" para no renderizar pantallas vacías. Quién puede ver qué lo
 * decide RLS en Postgres, y en segundo lugar el DAL (src/lib/auth/dal.ts).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // No insertar código entre createServerClient y getUser(): cualquier cosa en
  // el medio puede hacer que el token no se refresque y cierre sesiones sola.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    if (pathname !== "/") target.searchParams.set("volver", pathname);
    return redirectKeepingCookies(target, response);
  }

  if (user && pathname === "/login") {
    const target = request.nextUrl.clone();
    target.pathname = "/mis-tareas";
    target.search = "";
    return redirectKeepingCookies(target, response);
  }

  return response;
}

/**
 * Un redirect nuevo pierde las cookies que Supabase acaba de refrescar, y el
 * usuario queda deslogueado cada vez que vence el token. Hay que copiarlas.
 */
function redirectKeepingCookies(target: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(target);
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
