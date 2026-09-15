import type { MetadataRoute } from "next";

/**
 * Manifiesto de aplicación instalable.
 *
 * Esto es lo que convierte a Relevo en una app del teléfono: se agrega a la
 * pantalla de inicio, abre a pantalla completa sin barra de direcciones, y en
 * iPhone es además el requisito para que funcionen las notificaciones.
 *
 * `display: standalone` y no `fullscreen`: hace falta que se vea la hora y la
 * batería. Alguien que está en un galpón mira el reloj del teléfono.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Relevo · cola de trabajo",
    short_name: "Relevo",
    description: "Quién está libre, qué falta hacer.",
    lang: "es-CL",
    dir: "ltr",
    start_url: "/mis-tareas",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f1ea",
    theme_color: "#f4f1ea",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // `maskable` deja que Android recorte el icono a la forma del sistema
      // sin comerse el mark: por eso está centrado con margen.
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mis tareas", url: "/mis-tareas" },
      { name: "Disponibles", url: "/disponibles" },
    ],
  };
}
