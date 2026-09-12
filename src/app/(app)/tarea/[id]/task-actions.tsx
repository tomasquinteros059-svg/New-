"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { claimTask, closeTask, type ActionState } from "@/lib/tasks/actions";
import { Banner } from "@/components/banner";

const INITIAL: ActionState = { status: "idle" };

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}

export function ClaimForm({ taskId }: { taskId: string }) {
  const [state, action] = useActionState(claimTask, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="task_id" value={taskId} />
      {state.status === "error" && state.message ? (
        <Banner tone="warn">{state.message}</Banner>
      ) : null}
      <Submit idle="Tomar esta tarea" busy="Tomando…" />
    </form>
  );
}

export function CloseForm({ taskId }: { taskId: string }) {
  const [state, action] = useActionState(closeTask, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="task_id" value={taskId} />

      <div className="space-y-2">
        <label htmlFor="note" className="label">
          Qué hiciste
        </label>
        <textarea
          id="note"
          name="note"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          placeholder="Una línea alcanza. Ej: cambié el rodamiento, quedó sin ruido."
          className="field resize-y"
          aria-describedby="note-help"
        />
        <p id="note-help" className="text-sm leading-relaxed text-muted">
          Queda en el historial. Es lo que va a leer el que agarre esto después.
        </p>
      </div>

      {state.status === "error" && state.message ? (
        <Banner tone="bad">{state.message}</Banner>
      ) : null}

      <Submit idle="Cerrar tarea" busy="Cerrando…" />
    </form>
  );
}
