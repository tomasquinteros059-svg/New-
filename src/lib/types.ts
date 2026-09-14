/**
 * Tipos de la base de datos.
 *
 * Escritos a mano y espejo de supabase/migrations/. Cuando el proyecto de
 * Supabase esté creado se pueden regenerar con:
 *
 *   npx supabase gen types typescript --project-id <id> > src/lib/types.ts
 */

export type AppRole = "worker" | "supervisor";
export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "available" | "active" | "closed" | "cancelled";
export type AssignmentKind = "claimed" | "assigned";
export type TaskEventType =
  | "created"
  | "claimed"
  | "assigned"
  | "released"
  | "closed"
  | "cancelled"
  | "edited";

export type Profile = {
  id: string;
  full_name: string;
  role: AppRole;
  /** Techo de tareas simultáneas. Duro para tomar, blando para asignar. */
  active_task_limit: number;
  /** Presencia DECLARADA. Distinta de la capacidad, que se deriva contando. */
  is_present: boolean;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  due_at: string | null;
  status: TaskStatus;
  requires_evidence: boolean;
  assignee_id: string | null;
  assignment_kind: AssignmentKind | null;
  assigned_at: string | null;
  available_since: string;
  closed_at: string | null;
  closing_note: string | null;
  cancelled_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TaskEvent = {
  id: number;
  task_id: string;
  actor_id: string | null;
  subject_id: string | null;
  type: TaskEventType;
  note: string | null;
  created_at: string;
};

/** Lo que devuelven claim_task y close_task. Ver migración 0004. */
export type TaskActionCode =
  | "claimed"
  | "closed"
  | "already_taken"
  | "at_limit"
  | "not_found"
  | "not_active"
  | "not_yours"
  | "note_required"
  | "note_too_long"
  | "released"
  | "reason_required"
  | "reason_too_long"
  | "evidence_required"
  | "no_session"
  | "no_profile";

export type TaskActionResult = {
  ok: boolean;
  code: TaskActionCode;
  /** Presentes solo en at_limit. */
  active?: number;
  limit?: number;
  /** Presente en already_taken y not_active. */
  status?: TaskStatus;
  task_id?: string;
};

/** Una fila de la foto del equipo. Ver team_load() en la migración 0005. */
export type TeamMember = {
  id: string;
  full_name: string;
  role: AppRole;
  is_present: boolean;
  active_task_limit: number;
  /** Derivado de contar tareas activas. Puede superar el tope si se asignó. */
  active_count: number;
  oldest_active_at: string | null;
};

export type AssignResult =
  | {
      ok: true;
      code: "assigned";
      over_limit: boolean;
      not_present: boolean;
      active: number;
      limit: number;
      assignee_name: string;
    }
  | {
      ok: false;
      code: "no_session" | "not_supervisor" | "no_assignee" | "not_found" | "not_available";
      status?: TaskStatus;
    };

export type TaskEvidence = {
  id: string;
  task_id: string;
  uploaded_by: string;
  /** Ruta dentro del bucket `evidence`: `<task_id>/<archivo>`. */
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

/** Una fila de la cola de disponibles. Ver available_queue() en la 0011. */
export type QueueItem = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  due_at: string | null;
  available_since: string;
  requires_evidence: boolean;
  /** Pasó el umbral X. Se calcula en Postgres, no en el servidor web. */
  is_stale: boolean;
  stale_after_hours: number;
};

export type AlertType = "stale_available" | "stale_active";

export type OpenAlert = {
  id: number;
  task_id: string;
  type: AlertType;
  threshold_hours: number;
  created_at: string;
  acknowledged_at: string | null;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** Desde cuándo está estancada: en cola, o en manos de alguien. */
  stale_since: string;
  assignee_name: string | null;
};

export type ReleaseEntry = {
  id: number;
  task_id: string;
  title: string;
  status: TaskStatus;
  reason: string | null;
  released_at: string;
  actor_name: string | null;
  subject_name: string | null;
  /** Falso cuando el supervisor le sacó la tarea a alguien. */
  self_released: boolean;
};

export type SweepResult =
  | {
      ok: true;
      code: "swept";
      created: number;
      cleared: number;
      stale_available_hours: number;
      stale_active_hours: number;
    }
  | { ok: false; code: "not_supervisor" };

export type SimpleResult = {
  ok: boolean;
  code: string;
  count?: number;
  status?: TaskStatus;
};

export type AppSettings = {
  id: boolean;
  stale_available_hours: number;
  stale_active_hours: number;
  default_active_task_limit: number;
  updated_at: string;
  updated_by: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        // Los perfiles los crea el trigger on_auth_user_created, nunca el cliente.
        Insert: Record<string, never>;
        Update: Partial<Pick<Profile, "full_name" | "is_present" | "role" | "active_task_limit">>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Pick<Task, "title" | "created_by"> &
          Partial<Pick<Task, "description" | "priority" | "due_at" | "requires_evidence">>;
        Update: Partial<Omit<Task, "id" | "created_at" | "created_by">>;
        Relationships: [];
      };
      task_events: {
        Row: TaskEvent;
        // Append-only: escriben triggers y RPCs, no el cliente.
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      task_evidence: {
        Row: TaskEvidence;
        // Se registra con attach_evidence, nunca por INSERT directo.
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      alerts: {
        Row: {
          id: number;
          task_id: string;
          type: AlertType;
          threshold_hours: number;
          created_at: string;
          acknowledged_at: string | null;
          acknowledged_by: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      app_settings: {
        Row: AppSettings;
        Insert: Record<string, never>;
        Update: Partial<
          Pick<AppSettings, "stale_available_hours" | "stale_active_hours" | "default_active_task_limit">
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_supervisor: { Args: Record<string, never>; Returns: boolean };
      claim_task: { Args: { p_task_id: string }; Returns: TaskActionResult };
      close_task: { Args: { p_task_id: string; p_note: string }; Returns: TaskActionResult };
      assign_task: {
        Args: { p_task_id: string; p_assignee_id: string };
        Returns: AssignResult;
      };
      team_load: { Args: Record<string, never>; Returns: TeamMember[] };
      release_task: { Args: { p_task_id: string; p_reason: string }; Returns: TaskActionResult };
      attach_evidence: {
        Args: { p_task_id: string; p_path: string; p_mime?: string; p_size?: number };
        Returns: SimpleResult;
      };
      sweep_stale_tasks: { Args: Record<string, never>; Returns: SweepResult };
      acknowledge_alert: { Args: { p_alert_id: number }; Returns: SimpleResult };
      open_alerts: { Args: Record<string, never>; Returns: OpenAlert[] };
      release_history: { Args: { p_limit?: number }; Returns: ReleaseEntry[] };
      safe_uuid: { Args: { p: string }; Returns: string | null };
      available_queue: { Args: Record<string, never>; Returns: QueueItem[] };
      ensure_profile: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      app_role: AppRole;
      task_priority: TaskPriority;
      task_status: TaskStatus;
      assignment_kind: AssignmentKind;
      task_event_type: TaskEventType;
    };
    CompositeTypes: Record<string, never>;
  };
};
