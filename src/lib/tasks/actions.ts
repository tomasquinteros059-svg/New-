"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requireSupervisor } from "@/lib/auth/dal";
import { wallTimeToUtcIso } from "@/lib/tz";
import { TIME_ZONE } from "@/lib/format";
import type { TaskPriority } from "@/lib/types";

export type ActionState = { status: "idle" | "error"; message?: string };

/* -------------------------------------------------------------------------- */
/* Tomar                                                                       */
/* -------------------------------------------------------------------------- */

export async function claimTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  const taskId = String(formData.get("task_id") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_task", { p_task_id: taskId });

  if (error || !data) {
    return { status: "error", message: "No pudimos tomar la tarea. Probá de nuevo." };
  }

  if (data.ok) {
    revalidatePath("/mis-tareas");
    revalidatePath("/disponibles");
    redirect("/mis-tareas");
  }

  switch (data.code) {
    // Llegaste segundo. No es un error tuyo, así que se cuenta como tal: te
    // devolvemos a la lista, ya sin esa tarea, con el aviso puesto.
    case "already_taken":
      revalidatePath("/disponibles");
      redirect("/disponibles?aviso=ya-tomada");

    case "not_found":
      revalidatePath("/disponibles");
      redirect("/disponibles?aviso=no-existe");

    // Ésta sí se queda en la pantalla: es una condición tuya, y la acción para
    // resolverla (cerrar algo) está a un toque.
    case "at_limit":
      return {
        status: "error",
        message:
          `Ya tenés ${data.active} de ${data.limit} tareas activas. ` +
          `Cerrá alguna antes de tomar otra.`,
      };

    default:
      return { status: "error", message: "No pudimos tomar la tarea. Probá de nuevo." };
  }
}

/* -------------------------------------------------------------------------- */
/* Cerrar                                                                      */
/* -------------------------------------------------------------------------- */

export async function closeTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();

  const taskId = String(formData.get("task_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  // Validación de cortesía: la de verdad está en close_task y en el CHECK de la
  // tabla. Ésta solo existe para no hacer ir y volver al servidor por nada.
  if (note.length < 3) {
    return { status: "error", message: "Escribí qué hiciste, aunque sea una línea." };
  }
  if (note.length > 1000) {
    return { status: "error", message: "La nota es demasiado larga (máximo 1000 caracteres)." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_task", {
    p_task_id: taskId,
    p_note: note,
  });

  if (error || !data) {
    return { status: "error", message: "No pudimos cerrar la tarea. Probá de nuevo." };
  }

  if (data.ok) {
    revalidatePath("/mis-tareas");
    revalidatePath("/disponibles");
    redirect("/mis-tareas?aviso=cerrada");
  }

  switch (data.code) {
    case "note_required":
      return { status: "error", message: "Escribí qué hiciste, aunque sea una línea." };
    case "not_active":
      return { status: "error", message: "Esta tarea ya no está activa." };
    case "not_yours":
      return { status: "error", message: "Esta tarea la tiene otra persona." };
    default:
      return { status: "error", message: "No pudimos cerrar la tarea. Probá de nuevo." };
  }
}

/* -------------------------------------------------------------------------- */
/* Crear (supervisor)                                                          */
/* -------------------------------------------------------------------------- */

const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { userId } = await requireSupervisor();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "medium");
  const dueLocal = String(formData.get("due_at") ?? "").trim();

  if (title.length < 3 || title.length > 140) {
    return { status: "error", message: "El título tiene que tener entre 3 y 140 caracteres." };
  }
  if (description.length > 4000) {
    return { status: "error", message: "La descripción es demasiado larga." };
  }

  const priority: TaskPriority = PRIORITIES.includes(priorityRaw as TaskPriority)
    ? (priorityRaw as TaskPriority)
    : "medium";

  // La hora escrita se interpreta en la zona de la operación, no en la del
  // servidor. Ver src/lib/tz.ts.
  const dueAt = wallTimeToUtcIso(dueLocal, TIME_ZONE);
  if (dueLocal && !dueAt) {
    return { status: "error", message: "Esa fecha límite no se entiende." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title,
    description: description || undefined,
    priority,
    due_at: dueAt ?? undefined,
    created_by: userId,
  });

  if (error) {
    return { status: "error", message: "No pudimos crear la tarea. Probá de nuevo." };
  }

  revalidatePath("/disponibles");
  redirect("/disponibles?aviso=creada");
}

/* -------------------------------------------------------------------------- */
/* Asignar (supervisor)                                                        */
/* -------------------------------------------------------------------------- */

export async function assignTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSupervisor();

  const taskId = String(formData.get("task_id") ?? "");
  const assigneeId = String(formData.get("assignee_id") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_task", {
    p_task_id: taskId,
    p_assignee_id: assigneeId,
  });

  if (error || !data) {
    return { status: "error", message: "No pudimos asignar la tarea. Probá de nuevo." };
  }

  if (data.ok) {
    revalidatePath("/disponibles");
    revalidatePath("/equipo");
    revalidatePath(`/tarea/${taskId}`);

    // Los avisos viajan como banderas, no como texto: el nombre de la persona
    // ya lo tiene la pantalla de destino.
    const flags = new URLSearchParams({ aviso: "asignada" });
    if (data.over_limit) flags.set("tope", "1");
    if (data.not_present) flags.set("turno", "1");
    redirect(`/tarea/${taskId}?${flags.toString()}`);
  }

  switch (data.code) {
    // Alguien la tomó mientras el supervisor elegía a quién dársela.
    case "not_available":
      revalidatePath(`/tarea/${taskId}`);
      redirect(`/tarea/${taskId}?aviso=ya-no-disponible`);

    case "not_found":
      redirect("/disponibles?aviso=no-existe");

    case "no_assignee":
      return { status: "error", message: "Esa persona ya no tiene cuenta." };

    default:
      return { status: "error", message: "No pudimos asignar la tarea. Probá de nuevo." };
  }
}
