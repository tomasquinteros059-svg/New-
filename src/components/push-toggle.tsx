"use client";

import { useEffect, useState } from "react";
import { savePushSubscription, deletePushSubscription } from "@/lib/push/actions";
import { Banner } from "@/components/banner";

type Estado = "cargando" | "no-soportado" | "sin-configurar" | "apagado" | "encendido" | "bloqueado";

/**
 * La clave VAPID viaja en base64url y el navegador la quiere como bytes.
 *
 * El buffer se crea explícito para que el tipo sea `Uint8Array<ArrayBuffer>`:
 * `new Uint8Array(n)` da `ArrayBufferLike`, que incluye `SharedArrayBuffer` y
 * no entra donde la API web pide un `BufferSource`.
 */
function claveABytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

/**
 * Encender o apagar los avisos en el teléfono.
 *
 * La suscripción es del DISPOSITIVO, no de la persona: hay que encenderla en
 * cada teléfono. Por eso el texto habla de "este teléfono" y no de "tu cuenta".
 *
 * El permiso del navegador solo se puede pedir a partir de un toque real. Si se
 * pidiera al cargar la pantalla, la mayoría lo bloquea por reflejo y después no
 * hay forma de volver a preguntar salvo desde los ajustes del sistema.
 */
export function PushToggle() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState<string | null>(null);
  const clavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    let vivo = true;

    /*
     * Todo el diagnóstico va adentro de una promesa aunque varias ramas sean
     * síncronas: llamar a setState de forma síncrona dentro de un efecto
     * dispara renders en cascada. El `.then` garantiza que siempre ocurra en
     * un microtask posterior.
     */
    const determinar = async (): Promise<Estado> => {
      if (!clavePublica) return "sin-configurar";
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "no-soportado";
      if (Notification.permission === "denied") return "bloqueado";

      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        return sub ? "encendido" : "apagado";
      } catch {
        return "apagado";
      }
    };

    void determinar().then((resultado) => {
      if (vivo) setEstado(resultado);
    });

    return () => {
      vivo = false;
    };
  }, [clavePublica]);

  async function encender() {
    setError(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "apagado");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: claveABytes(clavePublica!),
      });

      const json = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError("El navegador devolvió una suscripción incompleta.");
        return;
      }

      const { ok } = await savePushSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        label: navigator.userAgent.slice(0, 120),
      });

      if (!ok) {
        setError("No pudimos guardar la suscripción. Probá de nuevo.");
        return;
      }

      setEstado("encendido");
    } catch {
      setError("No pudimos encender los avisos en este teléfono.");
    }
  }

  async function apagar() {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("apagado");
    } catch {
      setError("No pudimos apagar los avisos. Probá de nuevo.");
    }
  }

  return (
    <div className="space-y-2.5">
      <span className="label">Avisos en este teléfono</span>

      {estado === "cargando" ? (
        <p className="text-sm text-muted">Comprobando…</p>
      ) : estado === "sin-configurar" ? (
        <p className="text-sm leading-relaxed text-muted">
          Los avisos al teléfono no están configurados en esta instalación.
        </p>
      ) : estado === "no-soportado" ? (
        <p className="text-sm leading-relaxed text-muted">
          Este navegador no admite avisos. En iPhone hay que agregar la app a la pantalla
          de inicio primero.
        </p>
      ) : estado === "bloqueado" ? (
        <Banner tone="warn">
          Bloqueaste los avisos para este sitio. Hay que volver a permitirlos desde los
          ajustes del navegador; desde acá ya no se puede preguntar.
        </Banner>
      ) : estado === "encendido" ? (
        <>
          <button type="button" onClick={apagar} className="btn-quiet w-full">
            Apagar los avisos
          </button>
          <p className="text-sm leading-relaxed text-muted">
            Te avisamos cuando te asignen una tarea. Solo en este teléfono.
          </p>
        </>
      ) : (
        <>
          <button type="button" onClick={encender} className="btn-quiet w-full">
            Encender los avisos
          </button>
          <p className="text-sm leading-relaxed text-muted">
            Para enterarte cuando te asignen trabajo sin tener que abrir la app. Hay que
            encenderlos en cada teléfono.
          </p>
        </>
      )}

      {error ? <Banner tone="bad">{error}</Banner> : null}
    </div>
  );
}
