/**
 * Service worker de Relevo.
 *
 * Hace una sola cosa: recibir notificaciones push y abrir la pantalla correcta
 * al tocarlas. NO cachea nada ni intenta funcionar sin conexión — una cola de
 * trabajo que muestra datos viejos es peor que una que no abre.
 */

self.addEventListener("install", () => {
  // Toma el control sin esperar a que se cierren las pestañas viejas.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = {};
  }

  const titulo = datos.title || "Relevo";
  const opciones = {
    body: datos.body || "",
    // `tag` agrupa: dos avisos de la misma tarea se reemplazan en vez de
    // apilarse en la barra de notificaciones.
    tag: datos.tag || "relevo",
    renotify: Boolean(datos.tag),
    data: { url: datos.url || "/mis-tareas" },
    lang: "es",
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/mis-tareas";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((ventanas) => {
        // Si la app ya está abierta, la enfocamos en vez de abrir otra pestaña.
        for (const ventana of ventanas) {
          if ("focus" in ventana) {
            ventana.navigate?.(destino);
            return ventana.focus();
          }
        }
        return self.clients.openWindow(destino);
      }),
  );
});
