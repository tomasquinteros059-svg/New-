"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { reassignTask, type ActionState } from "@/lib/tasks/actions";
import { LoadBar } from "@/components/load-bar";
import { Banner } from "@/components/banner";
import type { TeamMember } from "@/lib/types";

const INITIAL: ActionState = { status: "idle" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Pasando…" : "Pasarle la tarea"}
    </button>
  );
}

/**
 * Reasignar es UN formulario y no un botón por persona, porque el motivo es
 * obligatorio: con un botón por fila habría que repetir el campo del motivo
 * en cada una.
 */
export function ReassignForm({
  taskId,
  team,
  currentHolderId,
}: {
  taskId: string;
  team: TeamMember[];
  /** Quien la tiene ahora: se muestra, pero no se puede elegir. */
  currentHolderId: string | null;
}) {
  const [state, action] = useActionState(reassignTask, INITIAL);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="task_id" value={taskId} />

      <fieldset className="space-y-3">
        <legend className="label">A quién se la pasás</legend>

        {team.map((person) => {
          const esElActual = person.id === currentHolderId;
          const sobrecupo = person.active_count >= person.active_task_limit;

          return (
            <label
              key={person.id}
              className={`card block p-4 transition-colors ${
                esElActual
                  ? "opacity-55"
                  : "cursor-pointer has-checked:border-signal has-checked:bg-signal-soft"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-display text-[1.0625rem] font-semibold text-ink">
                    {person.full_name}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {person.active_count} de {person.active_task_limit}
                    {esElActual
                      ? " · ya la tiene"
                      : !person.is_present
                        ? " · fuera de turno"
                        : sobrecupo
                          ? " · se pasa del tope"
                          : ""}
                  </span>
                </span>
                <input
                  type="radio"
                  name="assignee_id"
                  value={person.id}
                  disabled={esElActual}
                  required
                  className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-signal)]"
                />
              </div>
              <span className="mt-3 block">
                <LoadBar used={person.active_count} limit={person.active_task_limit} />
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="reason" className="label">
          Por qué se la pasás
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          placeholder="Ej: Beto quedó con licencia."
          className="field resize-y"
          aria-describedby="reason-help"
        />
        <p id="reason-help" className="text-sm leading-relaxed text-muted">
          La tarea no pasa por la cola: va directo de una persona a la otra, y el
          historial guarda de quién venía.
        </p>
      </div>

      {state.status === "error" && state.message ? (
        <Banner tone="bad">{state.message}</Banner>
      ) : null}

      <Submit />
    </form>
  );
}
