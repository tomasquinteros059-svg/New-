"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createSkill, type ActionState } from "@/lib/skills/actions";
import { Banner } from "@/components/banner";

const INITIAL: ActionState = { status: "idle" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-quiet shrink-0 px-4" disabled={pending}>
      {pending ? "…" : "Agregar"}
    </button>
  );
}

export function NuevaHabilidadForm() {
  const [state, action] = useActionState(createSkill, INITIAL);

  return (
    <form action={action} className="space-y-2.5">
      <div className="flex gap-2">
        <input
          type="text"
          name="name"
          required
          minLength={2}
          maxLength={40}
          placeholder="Ej: soldadura"
          aria-label="Nombre de la habilidad"
          className="field min-w-0 flex-1"
        />
        <Submit />
      </div>
      {state.status === "error" && state.message ? (
        <Banner tone="bad">{state.message}</Banner>
      ) : null}
    </form>
  );
}
