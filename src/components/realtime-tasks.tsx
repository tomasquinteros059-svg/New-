"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Cada cuánto refrescar si el canal en vivo no está disponible. */
const RESPALDO_MS = 30_000;
/** Cuánto esperar a que el canal conecte antes de encender el respaldo. */
const ESPERA_CONEXION_MS = 8_000;

/**
 * Mantiene la pantalla al día cuando otro cambia algo.
 *
 * Sin esto la cola miente entre recargas: si alguien toma una tarea mientras
 * vos mirás la lista, la seguís viendo hasta navegar. La consecuencia ya estaba
 * manejada (al tocar "Tomar" llega `already_taken`), pero ver una lista falsa
 * hace que la gente toque tareas que ya no están.
 *
 * No trae los datos por el canal: solo escucha que ALGO cambió y le pide a Next
 * que vuelva a renderizar en el servidor. Así la pantalla sigue saliendo de una
 * sola consulta con RLS aplicada, y no hay dos caminos por los que pueda llegar
 * un dato distinto.
 *
 * Y si el canal no conecta —Realtime apagado en el proyecto, red del galpón,
 * un proxy que corta WebSockets— cae a refrescar cada 30 segundos. Eso importa
 * más de lo que parece: sin respaldo, un tiempo real que falla es peor que no
 * tenerlo, porque nadie se entera de que la lista dejó de actualizarse.
 */
export function RealtimeTasks({ topic }: { topic: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let agrupador: ReturnType<typeof setTimeout> | null = null;
    let respaldo: ReturnType<typeof setInterval> | null = null;
    let vigilaConexion: ReturnType<typeof setTimeout> | null = null;
    let vivo = true;

    const refrescar = () => {
      if (vivo) router.refresh();
    };

    const encenderRespaldo = () => {
      if (respaldo || !vivo) return;
      respaldo = setInterval(refrescar, RESPALDO_MS);
    };

    const apagarRespaldo = () => {
      if (respaldo) clearInterval(respaldo);
      respaldo = null;
    };

    const channel = supabase
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        // Una ráfaga de cambios tiene que provocar UN refresco, no diez: si el
        // supervisor carga seis tareas seguidas, son seis eventos.
        if (agrupador) clearTimeout(agrupador);
        agrupador = setTimeout(refrescar, 250);
      })
      .subscribe((estado) => {
        if (estado === "SUBSCRIBED") {
          apagarRespaldo();
        } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
          encenderRespaldo();
        }
      });

    // Si en unos segundos no llegó a SUBSCRIBED, asumimos que no va a llegar.
    vigilaConexion = setTimeout(() => {
      if (channel.state !== "joined") encenderRespaldo();
    }, ESPERA_CONEXION_MS);

    return () => {
      vivo = false;
      if (agrupador) clearTimeout(agrupador);
      if (vigilaConexion) clearTimeout(vigilaConexion);
      apagarRespaldo();
      void supabase.removeChannel(channel);
    };
  }, [topic, router]);

  return null;
}
