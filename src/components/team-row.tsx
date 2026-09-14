import Link from "next/link";
import { LoadBar } from "@/components/load-bar";
import { timeAgo } from "@/lib/format";
import type { TeamMember } from "@/lib/types";

export function loadState(person: TeamMember) {
  if (!person.is_present) return "away" as const;
  if (person.active_count > person.active_task_limit) return "over" as const;
  if (person.active_count >= person.active_task_limit) return "full" as const;
  if (person.active_count === 0) return "idle" as const;
  return "ok" as const;
}

const PILL = {
  idle: { className: "bg-free-soft text-free", label: "Libre" },
  ok: { className: "bg-brand-100 text-brand-700", label: "Con cupo" },
  full: { className: "bg-busy-soft text-busy", label: "Al tope" },
  over: { className: "bg-high-soft text-high", label: "Pasado" },
  away: { className: "bg-sunken text-muted", label: "Fuera" },
} as const;

export function TeamRow({
  person,
  action,
  href,
}: {
  person: TeamMember;
  /** Botón opcional debajo de la carga (usado al asignar). */
  action?: React.ReactNode;
  /** Si viene, el nombre lleva a esa pantalla. */
  href?: string;
}) {
  const state = loadState(person);
  const pill = PILL[state];

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {href ? (
            <Link
              href={href}
              className="block truncate font-display text-[1.0625rem] font-semibold text-ink underline-offset-4 hover:underline"
            >
              {person.full_name}
            </Link>
          ) : (
            <p className="truncate font-display text-[1.0625rem] font-semibold text-ink">
              {person.full_name}
            </p>
          )}
          <p className="mt-0.5 text-sm text-muted">
            {person.active_count} de {person.active_task_limit}
            {person.role === "supervisor" ? " · supervisor" : ""}
          </p>
        </div>
        <span className={`pill shrink-0 ${pill.className}`}>{pill.label}</span>
      </div>

      <div className="mt-3">
        <LoadBar used={person.active_count} limit={person.active_task_limit} />
      </div>

      {person.oldest_active_at ? (
        <p className="mt-2.5 text-sm text-muted">
          La más vieja abierta {timeAgo(person.oldest_active_at)}
        </p>
      ) : null}

      {action ? <div className="mt-3.5">{action}</div> : null}
    </div>
  );
}
