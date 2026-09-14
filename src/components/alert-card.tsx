import Link from "next/link";
import { acknowledgeAlert } from "@/lib/tasks/actions";
import { PRIORITY_CLASS, PRIORITY_LABEL, timeAgo } from "@/lib/format";
import type { OpenAlert } from "@/lib/types";

const KIND = {
  stale_available: {
    label: "Nadie la toma",
    tone: "border-medium/30 bg-medium-soft",
    text: "text-medium",
  },
  stale_active: {
    label: "Nadie la cierra",
    tone: "border-high/25 bg-high-soft",
    text: "text-high",
  },
} as const;

export function AlertCard({ alert }: { alert: OpenAlert }) {
  const kind = KIND[alert.type];
  const seen = alert.acknowledged_at !== null;

  return (
    <article
      className={`rounded-card border p-4 ${seen ? "border-line bg-surface" : kind.tone}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`font-display text-sm font-semibold ${seen ? "text-muted" : kind.text}`}
        >
          {kind.label}
        </span>
        <span className={`pill shrink-0 ${PRIORITY_CLASS[alert.priority]}`}>
          {PRIORITY_LABEL[alert.priority]}
        </span>
      </div>

      <Link
        href={`/tarea/${alert.task_id}`}
        className="mt-1.5 block font-display text-[1.0625rem] leading-snug font-semibold text-ink underline-offset-4 hover:underline"
      >
        {alert.title}
      </Link>

      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {alert.type === "stale_available"
          ? `En la cola ${timeAgo(alert.stale_since)}, y el umbral son ${alert.threshold_hours} h.`
          : `La tiene ${alert.assignee_name ?? "alguien"} ${timeAgo(alert.stale_since)}, y el umbral son ${alert.threshold_hours} h.`}
      </p>

      {seen ? (
        <p className="mt-3 text-sm text-muted">Ya lo viste. Sigue sin resolverse.</p>
      ) : (
        <form action={acknowledgeAlert} className="mt-3.5">
          <input type="hidden" name="alert_id" value={alert.id} />
          <button type="submit" className="btn-quiet w-full">
            Lo vi
          </button>
        </form>
      )}
    </article>
  );
}
