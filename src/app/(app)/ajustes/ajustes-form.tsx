"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateSettings, type ActionState } from "@/lib/admin/actions";
import { Banner } from "@/components/banner";
import type { AppSettings } from "@/lib/types";

const INITIAL: ActionState = { status: "idle" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Guardar ajustes"}
    </button>
  );
}

function Campo({
  name,
  label,
  help,
  defaultValue,
  min,
  max,
  suffix,
}: {
  name: string;
  label: string;
  help: string;
  defaultValue: number;
  min: number;
  max: number;
  suffix: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="label">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          required
          min={min}
          max={max}
          step={1}
          defaultValue={defaultValue}
          className="field w-28"
        />
        <span className="text-[0.9375rem] text-ink-soft">{suffix}</span>
      </div>
      <p className="text-sm leading-relaxed text-muted">{help}</p>
    </div>
  );
}

export function AjustesForm({ settings }: { settings: AppSettings }) {
  const [state, action] = useActionState(updateSettings, INITIAL);

  return (
    <form action={action} className="space-y-6">
      <Campo
        name="stale_available_hours"
        label="X · nadie la toma"
        suffix="horas"
        min={1}
        max={720}
        defaultValue={settings.stale_available_hours}
        help="Pasado ese tiempo en la cola, la tarea sube al principio de la lista, se marca «Estancada» y genera aviso."
      />

      <Campo
        name="stale_active_hours"
        label="Y · nadie la cierra"
        suffix="horas"
        min={1}
        max={720}
        defaultValue={settings.stale_active_hours}
        help="Pasado ese tiempo en manos de alguien sin cerrarse, genera aviso."
      />

      <Campo
        name="default_active_task_limit"
        label="Tope por defecto"
        suffix="tareas activas"
        min={1}
        max={20}
        defaultValue={settings.default_active_task_limit}
        help="El que se le asigna a una cuenta nueva. El de cada persona se cambia desde Equipo."
      />

      {state.status !== "idle" && state.message ? (
        <Banner tone={state.status === "ok" ? "good" : "bad"}>{state.message}</Banner>
      ) : null}

      <Submit />
    </form>
  );
}
