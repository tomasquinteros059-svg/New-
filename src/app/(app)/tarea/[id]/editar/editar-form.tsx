"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { editTask, cancelTask, type ActionState } from "@/lib/tasks/actions";
import { Banner } from "@/components/banner";
import { SkillPicker } from "@/components/skill-picker";
import type { Skill, Task } from "@/lib/types";

const INITIAL: ActionState = { status: "idle" };

function Submit({ idle, busy, className }: { idle: string; busy: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}

export function EditarForm({
  task,
  dueLocal,
  estaActiva,
  skills,
  selected,
}: {
  task: Task;
  /** `due_at` ya convertido a la hora de pared de la operación. */
  dueLocal: string;
  estaActiva: boolean;
  skills: Skill[];
  selected: string[];
}) {
  const [state, action] = useActionState(editTask, INITIAL);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="task_id" value={task.id} />

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
          defaultValue={task.title}
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
          defaultValue={task.description ?? ""}
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
                defaultChecked={task.priority === value}
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
        <input
          id="due_at"
          name="due_at"
          type="datetime-local"
          defaultValue={dueLocal}
          className="field"
        />
      </div>

      {skills.length > 0 ? (
        <SkillPicker
          skills={skills}
          selected={new Set(selected)}
          label="Habilidades que exige"
          help={
            estaActiva
              ? "Ojo: alguien ya la está haciendo. Agregar una habilidad que no tiene no se la saca, pero queda anotado."
              : "Sin ninguna, la puede tomar cualquiera."
          }
        />
      ) : null}

      <div className="card p-4">
        <label htmlFor="requires_evidence" className="flex items-start justify-between gap-4">
          <span>
            <span className="font-display text-[1.0625rem] font-semibold text-ink">
              Pedir evidencia
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-muted">
              {estaActiva
                ? "Ojo: alguien ya está trabajando en esto. Activarlo ahora le cambia las reglas a mitad de camino, y queda anotado en el historial."
                : "No se va a poder cerrar sin subir una foto o un archivo."}
            </span>
          </span>
          <input
            id="requires_evidence"
            name="requires_evidence"
            type="checkbox"
            defaultChecked={task.requires_evidence}
            className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-signal)]"
          />
        </label>
      </div>

      {state.status === "error" && state.message ? (
        <Banner tone="bad">{state.message}</Banner>
      ) : null}

      <Submit idle="Guardar cambios" busy="Guardando…" className="btn-primary" />
    </form>
  );
}

/**
 * Cancelar está detrás de un paso extra y pide motivo, igual que soltar.
 * Saca la tarea de circulación para todos; no es un botón para tocar de paso.
 */
export function CancelarForm({ taskId, estaActiva }: { taskId: string; estaActiva: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(cancelTask, INITIAL);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-quiet w-full border-high/30 text-high"
      >
        Cancelar esta tarea
      </button>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-4">
      <input type="hidden" name="task_id" value={taskId} />

      {estaActiva ? (
        <Banner tone="warn">
          Alguien la está haciendo ahora. Al cancelarla, le desaparece de su lista.
        </Banner>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="reason" className="label">
          Por qué la cancelás
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          autoFocus
          placeholder="Ej: el cliente dio de baja el pedido."
          className="field resize-y"
        />
        <p className="text-sm leading-relaxed text-muted">
          La tarea no se borra: queda como registro, con tu motivo.
        </p>
      </div>

      {state.status === "error" && state.message ? (
        <Banner tone="bad">{state.message}</Banner>
      ) : null}

      <Submit
        idle="Cancelar la tarea"
        busy="Cancelando…"
        className="btn-quiet w-full border-high/40 text-high"
      />

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="w-full py-1 text-center text-sm font-medium text-muted"
      >
        Mejor no
      </button>
    </form>
  );
}
