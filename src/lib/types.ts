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
