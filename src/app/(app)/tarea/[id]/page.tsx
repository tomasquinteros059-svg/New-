import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ClaimForm, CloseForm } from "./task-actions";
import { ReleaseForm } from "./release-form";
import { EvidenceUploader } from "./evidence-uploader";
import { EvidenceList } from "@/components/evidence-list";
import { Banner } from "@/components/banner";
import { TaskFacts, TaskHeading } from "@/components/task-facts";
import { formatDateTime } from "@/lib/format";
import type { Profile, Task } from "@/lib/types";

export const metadata = { title: "Tarea · Relevo" };

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; tope?: string; turno?: string }>;
}) {
  // Next.js 16: params y searchParams son promesas.
  const { id } = await params;
  const { aviso, tope, turno } = await searchParams;
  const { userId, profile } = await requireSession();
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle<Task>();

  /*
   * Si la tarea no aparece puede ser que no exista, o que RLS la esté
   * escondiendo porque se la llevó otra persona mientras mirabas la lista.
   * Desde acá las dos cosas son indistinguibles, y para quien mira son lo
   * mismo: ya no está. Una página de error 404 diría menos.
   */
  if (!task) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-bold text-ink">Esta tarea ya no está</h1>
        <Banner tone="warn">
          O la tomó otra persona, o el supervisor la sacó de la cola.
        </Banner>
        <Link href="/disponibles" className="btn-quiet w-full">
          Ver la cola
        </Link>
      </div>
    );
  }

  const isMine = task.assignee_id === userId;
  const isSupervisor = profile.role === "supervisor";

  let assignee: Profile | null = null;
  if (task.assignee_id && !isMine) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", task.assignee_id)
      .maybeSingle<Profile>();
    assignee = data;
  }

  return (
    <div className="space-y-6">
      {aviso === "asignada" ? (
        <Banner tone={tope || turno ? "warn" : "good"}>
          Asignada a {assignee?.full_name ?? "esa persona"}.
          {tope ? " Quedó por encima de su tope." : ""}
          {turno ? " Está fuera de turno, así que puede que no la vea hoy." : ""}
        </Banner>
      ) : null}

      {aviso === "ya-no-disponible" ? (
        <Banner tone="warn">
          Mientras elegías a quién dársela, alguien la tomó.
        </Banner>
      ) : null}

      <TaskHeading task={task} />

      <TaskFacts task={task} isMine={isMine} assigneeName={assignee?.full_name} />

      {task.status === "closed" ? (
        <section className="card p-4">
          <h2 className="label">Nota de cierre</h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink">
            {task.closing_note}
          </p>
          <p className="mt-2 text-sm text-muted">Cerrada {formatDateTime(task.closed_at)}</p>
        </section>
      ) : null}

      {task.status === "available" ? (
        <div className="space-y-3">
          <ClaimForm taskId={task.id} />
          {isSupervisor ? (
            <Link href={`/tarea/${task.id}/asignar`} className="btn-quiet w-full">
              Asignar a alguien
            </Link>
          ) : null}
        </div>
      ) : null}

      {task.status === "active" && (isMine || isSupervisor) ? (
        <section className="space-y-5">
          {!isMine ? (
            <Banner tone="info">
              Esta tarea la tiene {assignee?.full_name ?? "otra persona"}. Podés cerrarla o
              soltarla vos porque sos supervisor; queda registrado quién lo hizo.
            </Banner>
          ) : null}

          {task.requires_evidence ? <EvidenceUploader taskId={task.id} /> : null}

          <EvidenceList taskId={task.id} since={task.assigned_at} />

          <CloseForm taskId={task.id} />
          <ReleaseForm taskId={task.id} />
        </section>
      ) : null}

      {task.status === "closed" ? (
        <EvidenceList taskId={task.id} since={task.assigned_at} />
      ) : null}

      <Link href={task.status === "available" ? "/disponibles" : "/mis-tareas"} className="btn-quiet w-full">
        Volver
      </Link>
    </div>
  );
}
