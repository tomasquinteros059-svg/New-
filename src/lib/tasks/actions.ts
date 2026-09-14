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
    case "evidence_required":
      return {
        status: "error",
        message: "Esta tarea pide evidencia. Subí una foto o un archivo antes de cerrarla.",
      };
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
  const requiresEvidence = formData.get("requires_evidence") === "on";

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
    requires_evidence: requiresEvidence,
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

/* -------------------------------------------------------------------------- */
/* Soltar                                                                      */
/* -------------------------------------------------------------------------- */

export async function releaseTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();

  const taskId = String(formData.get("task_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (reason.length < 3) {
    return { status: "error", message: "Escribí por qué la soltás, aunque sea una línea." };
  }
  if (reason.length > 1000) {
    return { status: "error", message: "El motivo es demasiado largo (máximo 1000 caracteres)." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("release_task", {
    p_task_id: taskId,
    p_reason: reason,
  });

  if (error || !data) {
    return { status: "error", message: "No pudimos soltar la tarea. Probá de nuevo." };
  }

  if (data.ok) {
    revalidatePath("/mis-tareas");
    revalidatePath("/disponibles");
    revalidatePath("/control");
    redirect("/mis-tareas?aviso=soltada");
  }

  switch (data.code) {
    case "reason_required":
      return { status: "error", message: "Escribí por qué la soltás, aunque sea una línea." };
    case "not_active":
      return { status: "error", message: "Esta tarea ya no está activa." };
    case "not_yours":
      return { status: "error", message: "Esta tarea la tiene otra persona." };
    default:
      return { status: "error", message: "No pudimos soltar la tarea. Probá de nuevo." };
  }
}

/* -------------------------------------------------------------------------- */
/* Rescate (supervisor)                                                        */
/* -------------------------------------------------------------------------- */

export async function acknowledgeAlert(formData: FormData): Promise<void> {
  await requireSupervisor();
  const alertId = Number(formData.get("alert_id"));

  if (!Number.isInteger(alertId)) {
    redirect("/control?aviso=error");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("acknowledge_alert", { p_alert_id: alertId });

  if (error || !data?.ok) {
    redirect("/control?aviso=error");
  }

  revalidatePath("/control");
  revalidatePath("/", "layout");
  redirect("/control");
}

/**
 * Forzar el barrido a mano.
 *
 * El barrido programado (pg_cron, cada 15 minutos) es lo que cumple el criterio
 * de la fase: el aviso aparece sin que nadie toque nada. Esto es solo la salida
 * de emergencia para mirar ahora mismo, o para cuando todavía no se programó el
 * cron. Si esta pantalla es el único modo de que aparezcan avisos, el cron no
 * está andando.
 */
export async function sweepNow(): Promise<void> {
  await requireSupervisor();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sweep_stale_tasks");

  if (error || !data?.ok) {
    redirect("/control?aviso=error");
  }

  revalidatePath("/control");
  revalidatePath("/", "layout");
  redirect("/control?aviso=revisado");
}
