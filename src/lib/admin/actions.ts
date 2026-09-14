"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSupervisor } from "@/lib/auth/dal";
import type { AppRole } from "@/lib/types";

export type ActionState = { status: "idle" | "error" | "ok"; message?: string };

/* -------------------------------------------------------------------------- */
/* Rol y tope de una persona                                                   */
/* -------------------------------------------------------------------------- */

export async function updateMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSupervisor();

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "") as AppRole;
  const limit = Number(formData.get("active_task_limit"));

  if (role !== "worker" && role !== "supervisor") {
    return { status: "error", message: "Rol inválido." };
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    return { status: "error", message: "El tope tiene que ser un número entre 1 y 20." };
  }

  const supabase = await createClient();

  /*
   * Update directo y no RPC: las dos reglas que importan ya viven en la base y
   * están probadas. RLS decide qué fila, y el trigger
   * profiles_guard_privileged_columns decide qué columna y protege al último
   * supervisor. Una función encima sería una tercera copia de lo mismo.
   */
  const { error } = await supabase
    .from("profiles")
    .update({ role, active_task_limit: limit })
    .eq("id", id);

  if (error) {
    // 42501 es el código que levanta el trigger, con un mensaje ya escrito
    // para que lo lea una persona.
    if (error.code === "42501" && error.message.includes("último supervisor")) {
      return {
        status: "error",
        message: "No podés quitar al último supervisor. Nombrá a otro primero.",
      };
    }
    return { status: "error", message: "No pudimos guardar los cambios. Probá de nuevo." };
  }

  revalidatePath("/equipo");
  revalidatePath("/", "layout");
  redirect("/equipo?aviso=guardado");
}

/* -------------------------------------------------------------------------- */
/* Umbrales de rescate                                                         */
/* -------------------------------------------------------------------------- */

export async function updateSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSupervisor();

  const available = Number(formData.get("stale_available_hours"));
  const active = Number(formData.get("stale_active_hours"));
  const defaultLimit = Number(formData.get("default_active_task_limit"));

  const enRango = (n: number, min: number, max: number) =>
    Number.isInteger(n) && n >= min && n <= max;

  if (!enRango(available, 1, 720)) {
    return { status: "error", message: "X tiene que estar entre 1 y 720 horas." };
  }
  if (!enRango(active, 1, 720)) {
    return { status: "error", message: "Y tiene que estar entre 1 y 720 horas." };
  }
  if (!enRango(defaultLimit, 1, 20)) {
    return { status: "error", message: "El tope por defecto tiene que estar entre 1 y 20." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .update({
      stale_available_hours: available,
      stale_active_hours: active,
      default_active_task_limit: defaultLimit,
    })
    .eq("id", true)
    .select("id");

  // Sin error pero sin filas significa que RLS lo filtró: no es supervisor.
  if (error || !data || data.length === 0) {
    return { status: "error", message: "No pudimos guardar los ajustes. Probá de nuevo." };
  }

  revalidatePath("/ajustes");
  revalidatePath("/disponibles");
  revalidatePath("/control");
  return { status: "ok", message: "Guardado. El próximo barrido usa los umbrales nuevos." };
}
