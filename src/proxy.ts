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
     * Todo salvo estáticos, imágenes y `/api`. El proxy corre en cada
     * navegación, incluidos los prefetch, así que no debe hacer nada pesado.
     *
     * `/api` queda EXCLUIDO a propósito: esas rutas no tienen sesión de
     * navegador y se autentican solas. Si el proxy las tocara, las mandaría al
     * login con un 307 y la tarea programada del resumen no correría nunca,
     * sin un solo error a la vista.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
