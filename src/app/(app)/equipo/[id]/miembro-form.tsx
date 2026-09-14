"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateMember, type ActionState } from "@/lib/admin/actions";
import { Banner } from "@/components/banner";
import type { Profile } from "@/lib/types";

const INITIAL: ActionState = { status: "idle" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Guardar"}
    </button>
  );
}

export function MiembroForm({ person }: { person: Profile }) {
  const [state, action] = useActionState(updateMember, INITIAL);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="id" value={person.id} />

      <fieldset className="space-y-2">
        <legend className="label">Rol</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["worker", "Trabajador"],
              ["supervisor", "Supervisor"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="relative flex cursor-pointer items-center justify-center rounded-card border border-line-strong bg-surface py-3 font-display text-[0.9375rem] font-semibold text-ink-soft transition-colors has-checked:border-signal has-checked:bg-signal-soft has-checked:text-signal"
            >
              <input
                type="radio"
                name="role"
                value={value}
                defaultChecked={person.role === value}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {label}
            </label>
          ))}
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Un supervisor también puede tomar tareas. No es un rol aparte, es uno más.
        </p>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="active_task_limit" className="label">
          Tope de tareas activas
        </label>
        <div className="flex items-center gap-3">
          <input
            id="active_task_limit"
            name="active_task_limit"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={20}
            step={1}
            defaultValue={person.active_task_limit}
            className="field w-28"
          />
          <span className="text-[0.9375rem] text-ink-soft">simultáneas</span>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Es un freno para que tome trabajo por su cuenta. Vos podés pasarlo asignando.
        </p>
      </div>

      {state.status === "error" && state.message ? (
        <Banner tone="bad">{state.message}</Banner>
      ) : null}

      <Submit />
    </form>
  );
}
