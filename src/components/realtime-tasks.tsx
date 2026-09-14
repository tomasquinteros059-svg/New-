"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Mantiene la pantalla al día cuando otro cambia algo.
 *
 * Sin esto la cola miente entre recargas: si alguien toma una tarea mientras
 * vos mirás la lista, la seguís viendo hasta navegar. La consecuencia ya estaba
 * manejada (al tocar "Tomar" llega `already_taken`), pero ver una lista falsa
 * hace que la gente toque tareas que ya no están.
 *
 * No trae los datos por el canal: solo escucha que ALGO cambió y le pide a
 * Next que vuelva a renderizar en el servidor. Así la pantalla sigue saliendo
 * de una sola consulta con RLS aplicada, y no hay dos caminos por los que
 * pueda llegar un dato distinto.
 */
export function RealtimeTasks({ topic }: { topic: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        // Una ráfaga de cambios tiene que provocar UN refresco, no diez: si el
        // supervisor carga seis tareas seguidas, son seis eventos.
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 250);
      })
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [topic, router]);

  return null;
}
