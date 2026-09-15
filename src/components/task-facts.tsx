import { formatDateTime, timeAgo } from "@/lib/format";
import type { Task } from "@/lib/types";

/** La ficha de datos de una tarea. Separada para poder verla sin base de datos. */
export function TaskFacts({
  task,
  isMine,
  assigneeName,
}: {
  task: Task;
  isMine: boolean;
  assigneeName?: string | null;
}) {
  return (
    <dl className="card divide-y divide-line text-[0.9375rem]">
      <Row label="Estado" value={<StatusLabel task={task} isMine={isMine} />} />
      {task.due_at ? <Row label="Vence" value={formatDateTime(task.due_at)} /> : null}
      {task.status === "available" ? (
        <Row label="En cola" value={timeAgo(task.available_since)} />
      ) : null}
      {task.assigned_at ? (
        <Row
          label={task.assignment_kind === "assigned" ? "Asignada" : "Tomada"}
          value={formatDateTime(task.assigned_at)}
        />
      ) : null}
      {assigneeName ? <Row label="La tiene" value={assigneeName} /> : null}
      {task.requires_evidence ? (
        <Row label="Evidencia" value="Se pide al cerrar (Fase 4)" />
      ) : null}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

function StatusLabel({ task, isMine }: { task: Task; isMine: boolean }) {
  if (task.status === "available") return <span className="text-free">Disponible</span>;
  if (task.status === "active") {
    return (
      <span className="text-brand-700">
        {isMine
          ? task.assignment_kind === "assigned"
            ? "Te la asignaron"
            : "La tomaste vos"
          : "En curso"}
      </span>
    );
  }
  if (task.status === "closed") return <span className="text-muted">Cerrada</span>;
  return <span className="text-muted">Cancelada</span>;
}
