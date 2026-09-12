import { PRIORITY_CLASS, PRIORITY_LABEL, formatDateTime } from "@/lib/format";
import type { Task } from "@/lib/types";

export function TaskCard({ task }: { task: Task }) {
  return (
    <article className="card p-4">
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
        {task.due_at ? <span>Vence {formatDateTime(task.due_at)}</span> : null}
        {task.assignment_kind === "assigned" ? (
          <span className="font-medium text-brand-700">Te la asignaron</span>
        ) : null}
        {task.requires_evidence ? <span>Requiere evidencia</span> : null}
      </div>
    </article>
  );
}
