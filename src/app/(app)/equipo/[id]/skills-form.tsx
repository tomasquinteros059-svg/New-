"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveProfileSkills, type ActionState } from "@/lib/skills/actions";
import { SkillPicker } from "@/components/skill-picker";
import { Banner } from "@/components/banner";
import type { Skill } from "@/lib/types";

const INITIAL: ActionState = { status: "idle" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-quiet w-full" disabled={pending}>
      {pending ? "Guardando…" : "Guardar habilidades"}
    </button>
  );
}

export function SkillsForm({
  profileId,
  skills,
  selected,
}: {
  profileId: string;
  skills: Skill[];
  selected: string[];
}) {
  const [state, action] = useActionState(saveProfileSkills, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="profile_id" value={profileId} />

      <SkillPicker
        skills={skills}
        selected={new Set(selected)}
        label="Qué sabe hacer"
        help="Solo puede TOMAR tareas que exijan habilidades que tenga. Vos podés asignársela igual."
        emptyHref="/habilidades"
      />

      {state.status !== "idle" && state.message ? (
        <Banner tone={state.status === "ok" ? "good" : "bad"}>{state.message}</Banner>
      ) : null}

      {skills.length > 0 ? <Submit /> : null}
    </form>
  );
}
