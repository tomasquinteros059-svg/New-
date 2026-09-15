import { redirect } from "next/navigation";
import { requireSupervisor } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { EditarForm, CancelarForm } from "./editar-form";
import { PageHeader } from "@/components/page-header";
import { utcIsoToWallTime } from "@/lib/tz";
import { TIME_ZONE } from "@/lib/format";
import type { Skill, Task } from "@/lib/types";

export const metadata = { title: "Editar tarea · Relevo" };

export default async function EditarTareaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireSupervisor();

  const supabase = await createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle<Task>();

  if (!task) redirect("/disponibles?aviso=no-existe");

  // Lo cerrado y lo cancelado es registro, no borrador.
  if (task.status === "closed" || task.status === "cancelled") redirect(`/tarea/${id}`);

  const estaActiva = task.status === "active";

  const [{ data: catalogo }, { data: exigidas }] = await Promise.all([
    supabase.from("skills").select("*").order("name"),
    supabase.from("task_skills").select("skill_id").eq("task_id", id),
  ]);
  const skills: Skill[] = catalogo ?? [];
  const seleccion = (exigidas ?? []).map((f) => f.skill_id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Editar"
        title={task.title}
        backHref={`/tarea/${task.id}`}
        backLabel="La tarea"
      >
        Cada cambio queda en el historial de la tarea, con el antes y el después.
      </PageHeader>

      <EditarForm
        task={task}
        dueLocal={utcIsoToWallTime(task.due_at, TIME_ZONE)}
        estaActiva={estaActiva}
        skills={skills}
        selected={seleccion}
      />

      <div className="border-t border-line pt-6">
        <CancelarForm taskId={task.id} estaActiva={estaActiva} />
      </div>
    </div>
  );
}
