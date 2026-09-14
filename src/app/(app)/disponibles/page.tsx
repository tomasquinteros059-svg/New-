import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { AvailableTaskCard } from "@/components/available-task-card";
import { EmptyState } from "@/components/empty-state";
import { Banner } from "@/components/banner";
import type { QueueItem } from "@/lib/types";

export const metadata = { title: "Disponibles · Relevo" };

const AVISOS = {
  "ya-tomada": {
    tone: "warn" as const,
    text: "Esa tarea la tomó otra persona antes que vos. Acá está el resto.",
  },
  "no-existe": {
    tone: "warn" as const,
    text: "Esa tarea ya no está en la cola.",
  },
  creada: { tone: "good" as const, text: "Tarea creada. Ya está en la cola." },
};

export default async function DisponiblesPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { profile } = await requireSession();
  const { aviso } = await searchParams;
  const supabase = await createClient();

  // El orden de la especificación: prioridad, después vencimiento más cercano,
  // después antigüedad en cola. Hay un índice parcial que lo cubre exacto.
  // Todo el orden y la marca de estancada los resuelve Postgres: es donde viven
  // las marcas de tiempo, y así no hay desfase de reloj con el servidor web.
  const { data, error } = await supabase.rpc("available_queue");

  const tasks: QueueItem[] = data ?? [];
  const estancadas = tasks.filter((t) => t.is_stale);
  const staleHours = tasks[0]?.stale_after_hours;

  const notice = aviso && aviso in AVISOS ? AVISOS[aviso as keyof typeof AVISOS] : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Disponibles</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          {tasks.length === 0
            ? "No hay nada esperando en la cola."
            : `${tasks.length} ${tasks.length === 1 ? "tarea espera" : "tareas esperan"} que alguien las tome.`}
        </p>
      </header>

      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}

      {estancadas.length > 0 ? (
        <Banner tone="warn">
          {estancadas.length === 1
            ? `Hay 1 tarea esperando hace más de ${staleHours} h. Está arriba de todo.`
            : `Hay ${estancadas.length} tareas esperando hace más de ${staleHours} h. Están arriba de todo.`}
        </Banner>
      ) : null}

      {profile.role === "supervisor" ? (
        <Link href="/tarea/nueva" className="btn-primary">
          Crear tarea
        </Link>
      ) : null}

      {error ? (
        <Banner tone="bad">No pudimos cargar la cola. Recargá la página.</Banner>
      ) : tasks.length === 0 ? (
        <EmptyState title="Cola vacía">
          {profile.role === "supervisor"
            ? "Cuando crees una tarea va a aparecer acá para que alguien la tome."
            : "Cuando el supervisor cargue trabajo nuevo, lo vas a ver acá."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li key={task.id}>
              <AvailableTaskCard task={task} stale={task.is_stale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
