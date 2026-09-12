import { headers } from "next/headers";

/**
 * URL pública del sitio, para armar el destino del link mágico.
 *
 * Preferimos la variable de entorno porque detrás de un proxy los headers
 * pueden mentir. Si no está, la deducimos del request.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
