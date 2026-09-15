import { redirect } from "next/navigation";
import { requireSupervisor } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { TeamRow, loadState } from "@/components/team-row";
import { AssignButton } from "./assign-button";
import { ReassignForm } from "./reassign-form";
import { PageHeader } from "@/components/page-header";
import { Banner } from "@/components/banner";
import { EmptyState } from "@/components/empty-state";
import type { TeamMember, Task } from "@/lib/types";

export const metadata = { title: "Asignar · Relevo" };

/** El costo de asignarle a esta persona, en pocas palabras, o nada. */
function warningFor(person: TeamMember): string | null {
  const state = loadState(person);
  if (state === "away") return "está fuera de turno";
  if (state === "over" || state === "full") return "se pasa del tope";
  return null;
}

export default async function AsignarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSupervisor();

  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle<Task>();

  if (!task) redirect("/disponibles?aviso=no-existe");

  // Cerrada o cancelada no se asigna ni se pasa: el detalle lo explica mejor.
  if (task.status !== "available" && task.status !== "active") {
    redirect(`/tarea/${id}?aviso=ya-no-disponible`);
  }

  const { data } = await supabase.rpc("team_load");
  const team: TeamMember[] = data ?? [];

  // Una tarea que ya tiene dueño no se "asigna": se PASA de una persona a otra,
  // sin volver a la cola en el medio. Es otra operación y otra pantalla.
  if (task.status === "active") {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Pasar a otra persona"
          title={task.title}
          backHref={`/tarea/${task.id}`}
          backLabel="La tarea"
        />

        <Banner tone="info">
          No vuelve a la cola: pasa directo de una persona a la otra, así que nadie más
          puede tomarla en el medio.
        </Banner>

        {team.length === 0 ? (
          <EmptyState title="No hay a quién pasarla" />
        ) : (
          <ReassignForm taskId={task.id} team={team} currentHolderId={task.assignee_id} />
        )}

      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Asignar"
        title={task.title}
        backHref={`/tarea/${task.id}`}
        backLabel="La tarea"
      >
        Entra a la lista de quien elijas. No interrumpe lo que esté haciendo.
      </PageHeader>

      <Banner tone="info">
        El tope es un freno para quien toma trabajo, no para vos. Si hace falta, podés
        pasarlo: la app te dice el costo y lo deja registrado.
      </Banner>

      {team.length === 0 ? (
        <EmptyState title="No hay a quién asignar" />
      ) : (
        <ul className="space-y-3">
          {team.map((person) => (
            <li key={person.id}>
              <TeamRow
                person={person}
                action={
                  <AssignButton
                    taskId={task.id}
                    assigneeId={person.id}
                    warn={warningFor(person)}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}
