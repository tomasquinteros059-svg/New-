import type { OpenAlert, Profile, QueueItem, ReleaseEntry, Skill, Task, TeamMember } from "@/lib/types";

const ahora = Date.now();
export const haceHoras = (h: number) => new Date(ahora - h * 3600_000).toISOString();

/**
 * Corte de antigüedad, calculado UNA vez al cargar.
 *
 * `Date.now()` dentro del render es impuro: el resultado cambia entre renders
 * sin que cambie ningún dato. En la app de verdad este cálculo lo hace
 * Postgres, por la misma razón.
 */
export const CORTE_ESTANCADA = ahora - 12 * 3600_000;

export const YO = "p1";

export const habilidades: Skill[] = [
  { id: "s1", name: "Soldadura", created_at: "" },
  { id: "s2", name: "Eléctrica", created_at: "" },
  { id: "s3", name: "Trabajo en altura", created_at: "" },
];

/** Beto: el que está en el galpón. Es quien mira el demo por defecto. */
export const yo: Profile = {
  id: YO,
  full_name: "Beto Pérez",
  role: "worker",
  active_task_limit: 3,
  is_present: true,
  created_at: "",
  updated_at: "",
};

export const equipo: TeamMember[] = [
  { id: "p1", full_name: "Beto Pérez", role: "worker", is_present: true,
    active_task_limit: 3, active_count: 1, oldest_active_at: haceHoras(9),
    skills: ["Soldadura"] },
  { id: "p2", full_name: "Marta Ibáñez", role: "worker", is_present: true,
    active_task_limit: 3, active_count: 0, oldest_active_at: null,
    skills: ["Eléctrica", "Trabajo en altura"] },
  { id: "p3", full_name: "Carla Núñez", role: "worker", is_present: false,
    active_task_limit: 3, active_count: 4, oldest_active_at: haceHoras(51), skills: [] },
  { id: "p4", full_name: "Ana Rojas", role: "supervisor", is_present: true,
    active_task_limit: 3, active_count: 0, oldest_active_at: null, skills: [] },
];

type TareaDemo = Task & { required_skills: string[] };

export const tareasIniciales: TareaDemo[] = [
  { id: "t1", title: "Revisar bomba 3 del sector norte",
    description: "Ruido anormal desde el turno de la mañana. Verificar rodamientos antes de que pare la línea.",
    priority: "high", due_at: haceHoras(-7), status: "active", requires_evidence: true,
    assignee_id: YO, assignment_kind: "claimed", assigned_at: haceHoras(9),
    available_since: haceHoras(11), closed_at: null, closing_note: null, cancelled_at: null,
    created_by: "p4", created_at: haceHoras(11), updated_at: haceHoras(9),
    required_skills: ["Soldadura"] },

  { id: "t2", title: "Inventario del galpón",
    description: "Contar filtros, correas y rodamientos. Anotar lo que falte.",
    priority: "low", due_at: null, status: "available", requires_evidence: false,
    assignee_id: null, assignment_kind: null, assigned_at: null,
    available_since: haceHoras(31), closed_at: null, closing_note: null, cancelled_at: null,
    created_by: "p4", created_at: haceHoras(31), updated_at: haceHoras(31),
    required_skills: [] },

  { id: "t3", title: "Cambiar filtros de la línea B",
    description: "Son los de 10 pulgadas. Hay repuesto en el estante 4.",
    priority: "medium", due_at: haceHoras(-30), status: "available", requires_evidence: false,
    assignee_id: null, assignment_kind: null, assigned_at: null,
    available_since: haceHoras(2), closed_at: null, closing_note: null, cancelled_at: null,
    created_by: "p4", created_at: haceHoras(2), updated_at: haceHoras(2),
    required_skills: [] },

  { id: "t4", title: "Cambiar la luminaria del pasillo",
    description: "La del fondo, sobre la puerta del depósito.",
    priority: "medium", due_at: null, status: "available", requires_evidence: false,
    assignee_id: null, assignment_kind: null, assigned_at: null,
    available_since: haceHoras(5), closed_at: null, closing_note: null, cancelled_at: null,
    created_by: "p4", created_at: haceHoras(5), updated_at: haceHoras(5),
    required_skills: ["Eléctrica", "Trabajo en altura"] },

  { id: "t5", title: "Pintar la reja del acceso",
    description: null,
    priority: "low", due_at: null, status: "available", requires_evidence: false,
    assignee_id: null, assignment_kind: null, assigned_at: null,
    available_since: haceHoras(74), closed_at: null, closing_note: null, cancelled_at: null,
    created_by: "p4", created_at: haceHoras(74), updated_at: haceHoras(74),
    required_skills: [] },

  { id: "t6", title: "Revisar el tablero del compresor",
    description: "Salta la térmica cada tanto.",
    priority: "high", due_at: haceHoras(-20), status: "active", requires_evidence: false,
    assignee_id: "p3", assignment_kind: "assigned", assigned_at: haceHoras(61),
    available_since: haceHoras(70), closed_at: null, closing_note: null, cancelled_at: null,
    created_by: "p4", created_at: haceHoras(70), updated_at: haceHoras(61),
    required_skills: ["Eléctrica"] },
];

export const avisos: OpenAlert[] = [
  { id: 1, task_id: "t6", type: "stale_active", threshold_hours: 48,
    created_at: haceHoras(3), acknowledged_at: null, title: "Revisar el tablero del compresor",
    priority: "high", status: "active", stale_since: haceHoras(61), assignee_name: "Carla Núñez" },
  { id: 2, task_id: "t5", type: "stale_available", threshold_hours: 12,
    created_at: haceHoras(2), acknowledged_at: null, title: "Pintar la reja del acceso",
    priority: "low", status: "available", stale_since: haceHoras(74), assignee_name: null },
];

export const soltadas: ReleaseEntry[] = [
  { id: 10, task_id: "t3", title: "Cambiar filtros de la línea B", status: "available",
    reason: "Me falta la llave de 32, no la tengo hoy.", released_at: haceHoras(2),
    actor_name: "Beto Pérez", subject_name: "Beto Pérez", self_released: true },
  { id: 11, task_id: "t2", title: "Inventario del galpón", status: "available",
    reason: "Carla está con licencia, la devuelvo a la cola.", released_at: haceHoras(28),
    actor_name: "Ana Rojas", subject_name: "Carla Núñez", self_released: false },
];

/** Convierte una tarea del demo en la forma que espera la tarjeta de la cola. */
export function aItemDeCola(t: TareaDemo, misHabilidades: string[], total: number): QueueItem {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    due_at: t.due_at,
    available_since: t.available_since,
    requires_evidence: t.requires_evidence,
    is_stale: new Date(t.available_since).getTime() < CORTE_ESTANCADA,
    stale_after_hours: 12,
    total_count: total,
    required_skills: t.required_skills,
    meets_skills: t.required_skills.every((h) => misHabilidades.includes(h)),
  };
}

export type { TareaDemo };
