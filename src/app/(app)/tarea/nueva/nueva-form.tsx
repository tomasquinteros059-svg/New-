"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createTask, type ActionState } from "@/lib/tasks/actions";
import { Banner } from "@/components/banner";

const INITIAL: ActionState = { status: "idle" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Creando…" : "Crear y mandar a la cola"}
    </button>
  );
}

export function NuevaTareaForm({ timeZone }: { timeZone: string }) {
  const [state, action] = useActionState(createTask, INITIAL);

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="title" className="label">
          Qué hay que hacer
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          minLength={3}
          maxLength={140}
          autoComplete="off"
          placeholder="Ej: revisar bomba 3 del sector norte"
          className="field"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="label">
          Detalle <span className="font-normal normal-case">(opcional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={4000}
          placeholder="Lo que necesita saber quien la tome para no tener que preguntar."
          className="field resize-y"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="label">Prioridad</legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["low", "Baja"],
              ["medium", "Media"],
              ["high", "Alta"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="relative flex cursor-pointer items-center justify-center rounded-card border border-line-strong bg-surface py-3 font-display text-[0.9375rem] font-semibold text-ink-soft transition-colors has-checked:border-signal has-checked:bg-signal-soft has-checked:text-signal"
            >
              <input
                type="radio"
                name="priority"
                value={value}
                defaultChecked={value === "medium"}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="due_at" className="label">
          Fecha límite <span className="font-normal normal-case">(opcional)</span>
        </label>
        <input id="due_at" name="due_at" type="datetime-local" className="field" />
        <p className="text-sm leading-relaxed text-muted">
          Hora de {timeZone.split("/")[1]?.replace("_", " ") ?? timeZone}. Después de la
          prioridad, es lo que decide el orden de la cola.
        </p>
      </div>

      <div className="card p-4">
        <label htmlFor="requires_evidence" className="flex items-start justify-between gap-4">
          <span>
            <span className="font-display text-[1.0625rem] font-semibold text-ink">
              Pedir evidencia
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-muted">
              No se va a poder cerrar sin subir una foto o un archivo. Usalo cuando haga
              falta poder mostrar que se hizo.
            </span>
          </span>
          <input
            id="requires_evidence"
            name="requires_evidence"
            type="checkbox"
            className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-signal)]"
          />
        </label>
      </div>

      {state.status === "error" && state.message ? (
        <Banner tone="bad">{state.message}</Banner>
      ) : null}

      <Submit />
    </form>
  );
}
