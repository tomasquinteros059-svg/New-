import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Desde Next.js 16 el middleware se llama Proxy y vive en `proxy.ts`.
 * `middleware.ts` está deprecado.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todo salvo estáticos e imágenes. El proxy corre en cada navegación,
     * incluidos los prefetch, así que no debe hacer nada pesado.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
