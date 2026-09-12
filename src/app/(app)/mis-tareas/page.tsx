import { requireSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { TaskCard } from "@/components/task-card";
import { EmptyState } from "@/components/empty-state";
import { CapacityMeter } from "@/components/capacity-meter";
import type { Task } from "@/lib/types";

export const metadata = { title: "Mis tareas · Relevo" };

export default async function MisTareasPage() {
  const { userId, profile } = await requireSession();
  const supabase = await createClient();

  // RLS ya limita a lo propio. El filtro explícito es para no traer también
  // las disponibles, que se ven en otra pantalla.
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("assignee_id", userId)
    .eq("status", "active")
    .order("priority", { ascending: false })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("assigned_at", { ascending: true });

  const tasks: Task[] = data ?? [];
  const used = tasks.length;
  const limit = profile.active_task_limit;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Mis tareas</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          {used === 0
            ? "No tenés nada activo ahora mismo."
            : `Tenés ${used} ${used === 1 ? "tarea activa" : "tareas activas"}.`}
        </p>
      </header>

      {/* Capacidad: derivada de contar, nunca de un contador guardado. */}
      <CapacityMeter used={used} limit={limit} />

      {error ? (
        <p role="alert" className="rounded-card border border-high/25 bg-high-soft px-4 py-3 text-[0.9375rem] text-high">
          No pudimos cargar tus tareas. Recargá la página.
        </p>
      ) : tasks.length === 0 ? (
        <EmptyState title="Sin tareas activas">
          Cuando tomes una tarea o el supervisor te asigne alguna, va a aparecer acá.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
