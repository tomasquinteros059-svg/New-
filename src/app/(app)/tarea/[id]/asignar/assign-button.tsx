"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { assignTask, type ActionState } from "@/lib/tasks/actions";
import { Banner } from "@/components/banner";

const INITIAL: ActionState = { status: "idle" };

function Submit({ warn }: { warn: string | null }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn-quiet w-full ${warn ? "border-medium/40 text-medium" : ""}`}
    >
      {pending ? "Asignando…" : warn ? `Asignar igual · ${warn}` : "Asignar"}
    </button>
  );
}

export function AssignButton({
  taskId,
  assigneeId,
  warn,
}: {
  taskId: string;
  assigneeId: string;
  /** Texto corto del costo: "se pasa del tope", "fuera de turno". */
  warn: string | null;
}) {
  const [state, action] = useActionState(assignTask, INITIAL);

  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="assignee_id" value={assigneeId} />
      {state.status === "error" && state.message ? (
        <Banner tone="bad">{state.message}</Banner>
      ) : null}
      <Submit warn={warn} />
    </form>
  );
}
