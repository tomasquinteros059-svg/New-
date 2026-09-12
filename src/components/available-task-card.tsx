import Link from "next/link";
import { PRIORITY_CLASS, PRIORITY_LABEL, formatDateTime, timeAgo } from "@/lib/format";
import type { Task } from "@/lib/types";

/**
 * Tarjeta de la cola de disponibles.
 *
 * Muestra la antigüedad porque es el tercer criterio de orden: si no se ve, la
 * lista parece arbitraria. La acción de tomar vive en el detalle, no acá: una
 * cosa por pantalla, y tomar algo sin haberlo leído es cómo se sueltan tareas.
 */
export function AvailableTaskCard({ task }: { task: Task }) {
  return (
    <Link
      href={`/tarea/${task.id}`}
      className="card block p-4 transition-shadow hover:shadow-lifted"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[1.0625rem] leading-snug font-semibold text-ink">
          {task.title}
        </h3>
        <span className={`pill shrink-0 ${PRIORITY_CLASS[task.priority]}`}>
          {PRIORITY_LABEL[task.priority]}
        </span>
      </div>

      {task.description ? (
        <p className="mt-2 line-clamp-2 text-[0.9375rem] leading-relaxed text-ink-soft">
          {task.description}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
        <span>En cola {timeAgo(task.available_since)}</span>
        {task.due_at ? <span>Vence {formatDateTime(task.due_at)}</span> : null}
      </div>
    </Link>
  );
}
