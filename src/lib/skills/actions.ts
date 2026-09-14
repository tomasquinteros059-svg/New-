"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSupervisor } from "@/lib/auth/dal";

export type ActionState = { status: "idle" | "error" | "ok"; message?: string };

/* -------------------------------------------------------------------------- */
/* Catálogo                                                                    */
/* -------------------------------------------------------------------------- */

export async function createSkill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSupervisor();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 40) {
    return { status: "error", message: "El nombre tiene que tener entre 2 y 40 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("skills").insert({ name });

  if (error) {
    // 23505 es violación de único: el índice ignora mayúsculas, así que
    // «Soldadura» y «soldadura» chocan, que es lo que queremos.
    if (error.code === "23505") {
      return { status: "error", message: `Ya existe una habilidad llamada «${name}».` };
    }
    return { status: "error", message: "No pudimos crear la habilidad. Probá de nuevo." };
  }

  revalidatePath("/habilidades");
  redirect("/habilidades?aviso=creada");
}

export async function deleteSkill(formData: FormData): Promise<void> {
  await requireSupervisor();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("skills").delete().eq("id", id);

  revalidatePath("/habilidades");

  /*
   * 23503 es violación de clave foránea: alguna tarea exige esta habilidad. La
   * referencia es `on delete restrict` a propósito — borrarla en cascada
   * cambiaría en silencio quién puede tomar esa tarea.
   */
  redirect(error?.code === "23503" ? "/habilidades?aviso=en-uso" : "/habilidades?aviso=borrada");
}

/* -------------------------------------------------------------------------- */
/* Quién sabe qué                                                              */
/* -------------------------------------------------------------------------- */

export async function saveProfileSkills(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSupervisor();

  const profileId = String(formData.get("profile_id") ?? "");
  const ids = formData.getAll("skill_id").map(String).filter(Boolean);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_profile_skills", {
    p_profile_id: profileId,
    p_skill_ids: ids,
  });

  if (error || !data?.ok) {
    return { status: "error", message: "No pudimos guardar las habilidades. Probá de nuevo." };
  }

  revalidatePath(`/equipo/${profileId}`);
  revalidatePath("/equipo");
  revalidatePath("/disponibles");
  return { status: "ok", message: "Habilidades guardadas." };
}

/* -------------------------------------------------------------------------- */
/* Qué exige una tarea                                                         */
/* -------------------------------------------------------------------------- */

export async function saveTaskSkills(taskId: string, ids: string[]): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_task_skills", {
    p_task_id: taskId,
    p_skill_ids: ids,
  });
  return !error && Boolean(data?.ok);
}
