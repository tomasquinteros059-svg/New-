"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateProfile, type ProfileState } from "./actions";

const INITIAL: ProfileState = { status: "idle" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Guardar"}
    </button>
  );
}

export function CuentaForm({
  fullName,
  isPresent,
}: {
  fullName: string;
  isPresent: boolean;
}) {
  const [state, formAction] = useActionState(updateProfile, INITIAL);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="full_name" className="label">
          Tu nombre
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          defaultValue={fullName}
          className="field"
        />
        <p className="text-sm leading-relaxed text-muted">
          Es el nombre que ve el resto del equipo.
        </p>
      </div>

      <div className="card p-4">
        <label htmlFor="is_present" className="flex items-start justify-between gap-4">
          <span>
            <span className="font-display text-[1.0625rem] font-semibold text-ink">
              Estoy en turno
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-muted">
              Es una declaración tuya, aparte de cuántas tareas tengas. Sirve para que el
              supervisor no te asigne trabajo cuando no estás.
            </span>
          </span>
          <input
            id="is_present"
            name="is_present"
            type="checkbox"
            defaultChecked={isPresent}
            className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-free)]"
          />
        </label>
      </div>

      {state.status !== "idle" && state.message ? (
        <p
          role="status"
          className={`rounded-card px-4 py-3 text-[0.9375rem] leading-relaxed ${
            state.status === "ok"
              ? "border border-free/25 bg-free-soft text-free"
              : "border border-high/25 bg-high-soft text-high"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <SaveButton />
    </form>
  );
}
