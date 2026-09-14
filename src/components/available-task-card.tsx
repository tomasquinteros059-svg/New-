import Link from "next/link";
import { PRIORITY_CLASS, PRIORITY_LABEL, formatDateTime, timeAgo } from "@/lib/format";
import type { QueueItem } from "@/lib/types";

type CardTask = Pick<
  QueueItem,
  "id" | "title" | "description" | "priority" | "due_at" | "available_since"
>;

/**
 * Tarjeta de la cola de disponibles.
 *
 * Muestra la antigüedad porque es el tercer criterio de orden: si no se ve, la
 * lista parece arbitraria. La acción de tomar vive en el detalle, no acá: una
 * cosa por pantalla, y tomar algo sin haberlo leído es cómo se sueltan tareas.
 *
 * `stale` marca las que pasaron el umbral X. Es la versión NO destructiva de
 * "sube automáticamente de prioridad": la tarea salta al principio de la lista
 * y se marca, pero la prioridad que puso el supervisor no se pisa.
 *
 * Las que no podés tomar por habilidades tampoco se esconden. Si se
 * escondieran, nadie sabría que hay trabajo esperando a alguien con esa
 * etiqueta, que es justo lo que el supervisor necesita ver.
 */
export function AvailableTaskCard({
  task,
  stale = false,
  requiredSkills = [],
  meetsSkills = true,
}: {
  task: CardTask;
  stale?: boolean;
  requiredSkills?: string[];
  /** Si quien mira cumple las habilidades. Falso NO la esconde: la marca. */
  meetsSkills?: boolean;
}) {
  return (
    <Link
      href={`/tarea/${task.id}`}
      className="card block p-4 transition-shadow hover:shadow-lifted"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[1.0625rem] leading-snug font-semibold text-ink">
          {task.title}
        </h3>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={`pill ${PRIORITY_CLASS[task.priority]}`}>
            {PRIORITY_LABEL[task.priority]}
          </span>
          {stale ? <span className="pill bg-medium-soft text-medium">Estancada</span> : null}
          {!meetsSkills ? (
            <span className="pill bg-sunken text-muted">No podés tomarla</span>
          ) : null}
        </span>
      </div>

      {task.description ? (
        <p className="mt-2 line-clamp-2 text-[0.9375rem] leading-relaxed text-ink-soft">
          {task.description}
        </p>
      ) : null}

      {requiredSkills.length > 0 ? (
        <p className="mt-2.5 text-sm text-muted">
          Pide <span className="font-medium text-ink-soft">{requiredSkills.join(", ")}</span>
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
        <span>En cola {timeAgo(task.available_since)}</span>
        {task.due_at ? <span>Vence {formatDateTime(task.due_at)}</span> : null}
      </div>
    </Link>
  );
}
