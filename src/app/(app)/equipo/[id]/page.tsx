import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSupervisor } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { MiembroForm } from "./miembro-form";
import { SkillsForm } from "./skills-form";
import { Banner } from "@/components/banner";
import { EmptyState } from "@/components/empty-state";
import { PRIORITY_CLASS, PRIORITY_LABEL, formatDateTime, timeAgo } from "@/lib/format";
import type { PersonTask, Profile, Skill } from "@/lib/types";

export const metadata = { title: "Persona · Relevo" };

export default async function MiembroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await requireSupervisor();

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle<Profile>();

  if (!person) redirect("/equipo");

  // El panel de equipo decía cuántas, no cuáles. Para saber qué estaba
  // haciendo alguien había que ir tarea por tarea.
  const [{ data: tareas }, { data: catalogo }, { data: suyas }] = await Promise.all([
    supabase.rpc("person_tasks", { p_person_id: id }),
    supabase.from("skills").select("*").order("name"),
    supabase.from("profile_skills").select("skill_id").eq("profile_id", id),
  ]);

  const activas: PersonTask[] = tareas ?? [];
  const skills: Skill[] = catalogo ?? [];
  const suSeleccion = (suyas ?? []).map((f) => f.skill_id);

  return (
    <div className="space-y-6">
      <header>
        <p className="label">Persona</p>
        <h1 className="mt-1.5 font-display text-2xl leading-tight font-bold text-ink">
          {person.full_name}
        </h1>
        <p className="mt-1 text-[0.9375rem] text-ink-soft">
          {person.is_present ? "En turno" : "Fuera de turno"}
        </p>
      </header>

      {person.id === userId ? (
        <Banner tone="info">
          Sos vos. Si te sacás el rol de supervisor perdés esta pantalla, y la app no te va
          a dejar hacerlo si sos el único que queda.
        </Banner>
      ) : null}

      <section className="space-y-3">
        <h2 className="label">
          Tiene ahora ({activas.length} de {person.active_task_limit})
        </h2>

        {activas.length === 0 ? (
          <EmptyState title="Sin tareas activas" />
        ) : (
          <ul className="space-y-2.5">
            {activas.map((t) => (
              <li key={t.id}>
                <Link href={`/tarea/${t.id}`} className="card block p-4 transition-shadow hover:shadow-lifted">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-[1.0625rem] leading-snug font-semibold text-ink">
                      {t.title}
                    </h3>
                    <span className={`pill shrink-0 ${PRIORITY_CLASS[t.priority]}`}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    <span>
                      {t.assignment_kind === "assigned" ? "Asignada" : "Tomada"}{" "}
                      {timeAgo(t.assigned_at)}
                    </span>
                    {t.due_at ? <span>Vence {formatDateTime(t.due_at)}</span> : null}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="border-t border-line pt-6">
        <SkillsForm profileId={person.id} skills={skills} selected={suSeleccion} />
      </div>

      <div className="border-t border-line pt-6">
        <MiembroForm person={person} />
      </div>

      <p className="rounded-card border border-line bg-sunken/60 px-4 py-3.5 text-sm leading-relaxed text-muted">
        El nombre y la presencia los maneja cada uno desde su propia pantalla de Cuenta.
        Desde acá solo se cambian el rol y el tope.
      </p>

      <Link href="/equipo" className="btn-quiet w-full">
        Volver al equipo
      </Link>
    </div>
  );
}
