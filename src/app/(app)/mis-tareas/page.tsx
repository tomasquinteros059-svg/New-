import { requireSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { TaskCard } from "@/components/task-card";
import { EmptyState } from "@/components/empty-state";
import { CapacityMeter } from "@/components/capacity-meter";
import { Banner } from "@/components/banner";
import { RealtimeTasks } from "@/components/realtime-tasks";
import type { Task } from "@/lib/types";

export const metadata = { title: "Mis tareas · Relevo" };

export default async function MisTareasPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { userId, profile } = await requireSession();
  const { aviso } = await searchParams;
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
      <RealtimeTasks topic="mis-tareas" />

      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Mis tareas</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          {used === 0
            ? "No tenés nada activo ahora mismo."
            : `Tenés ${used} ${used === 1 ? "tarea activa" : "tareas activas"}.`}
        </p>
      </header>

      {aviso === "cerrada" ? (
        <Banner tone="good">Tarea cerrada. Te quedó un cupo libre.</Banner>
      ) : null}

      {aviso === "soltada" ? (
        <Banner tone="info">
          La soltaste. Volvió a la cola con tu motivo anotado.
        </Banner>
      ) : null}

      {/* Capacidad: derivada de contar, nunca de un contador guardado. */}
      <CapacityMeter used={used} limit={limit} />

      {error ? (
        <Banner tone="bad">No pudimos cargar tus tareas. Recargá la página.</Banner>
      ) : tasks.length === 0 ? (
        <EmptyState title="Sin tareas activas">
          Tomá algo de la cola de disponibles, o esperá a que el supervisor te asigne
          trabajo.
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
