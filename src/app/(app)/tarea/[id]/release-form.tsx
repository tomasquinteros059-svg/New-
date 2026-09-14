"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { releaseTask, type ActionState } from "@/lib/tasks/actions";
import { Banner } from "@/components/banner";

const INITIAL: ActionState = { status: "idle" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-quiet w-full border-medium/40 text-medium"
    >
      {pending ? "Soltando…" : "Soltar y devolver a la cola"}
    </button>
  );
}

/**
 * Soltar está detrás de un paso extra a propósito.
 *
 * No es una acción de todos los días y el motivo es obligatorio: si el botón
 * estuviera al lado de "Cerrar", se tocaría por error y el historial se
 * llenaría de motivos vacíos escritos a las apuradas.
 */
export function ReleaseForm({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(releaseTask, INITIAL);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-quiet w-full">
        No puedo con esta
      </button>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-4">
      <input type="hidden" name="task_id" value={taskId} />

      <div className="space-y-2">
        <label htmlFor="reason" className="label">
          Por qué la soltás
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          autoFocus
          placeholder="Ej: me falta la llave de 32, no la tengo hoy."
          className="field resize-y"
          aria-describedby="reason-help"
        />
        <p id="reason-help" className="text-sm leading-relaxed text-muted">
          Vuelve a la cola para que la tome otro. El supervisor ve quién la soltó y por
          qué.
        </p>
      </div>

      {state.status === "error" && state.message ? (
        <Banner tone="bad">{state.message}</Banner>
      ) : null}

      <Submit />

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
