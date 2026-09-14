import Link from "next/link";
import { requireSupervisor } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { deleteSkill } from "@/lib/skills/actions";
import { NuevaHabilidadForm } from "./habilidades-form";
import { Banner } from "@/components/banner";
import { EmptyState } from "@/components/empty-state";
import type { Skill } from "@/lib/types";

export const metadata = { title: "Habilidades · Relevo" };

const AVISOS = {
  creada: { tone: "good" as const, text: "Habilidad creada." },
  borrada: { tone: "good" as const, text: "Habilidad borrada." },
  "en-uso": {
    tone: "warn" as const,
    text: "No se puede borrar: hay tareas que la exigen. Quitásela a esas tareas primero.",
  },
};

export default async function HabilidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  await requireSupervisor();
  const { aviso } = await searchParams;

  const supabase = await createClient();
  const [{ data: skills }, { data: usos }] = await Promise.all([
    supabase.from("skills").select("*").order("name"),
    supabase.from("profile_skills").select("skill_id"),
  ]);

  const lista: Skill[] = skills ?? [];
  const cuantosLaTienen = new Map<string, number>();
  for (const fila of usos ?? []) {
    cuantosLaTienen.set(fila.skill_id, (cuantosLaTienen.get(fila.skill_id) ?? 0) + 1);
  }

  const notice = aviso && aviso in AVISOS ? AVISOS[aviso as keyof typeof AVISOS] : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Habilidades</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          Etiquetas para decir qué hace falta saber para una tarea.
        </p>
      </header>

      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}

      <NuevaHabilidadForm />

      {lista.length === 0 ? (
        <EmptyState title="Todavía no hay ninguna">
          Sin habilidades cargadas, cualquiera puede tomar cualquier tarea. Es un estado
          válido: agregalas solo si de verdad importan.
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {lista.map((skill) => {
            const gente = cuantosLaTienen.get(skill.id) ?? 0;
            return (
              <li key={skill.id} className="card flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-display text-[1.0625rem] font-semibold text-ink">
                    {skill.name}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {gente === 0
                      ? "Nadie la tiene todavía"
                      : gente === 1
                        ? "1 persona la tiene"
                        : `${gente} personas la tienen`}
                  </p>
                </div>
                <form action={deleteSkill}>
                  <input type="hidden" name="id" value={skill.id} />
                  <button type="submit" className="btn-quiet shrink-0 px-4 text-high">
                    Borrar
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <p className="rounded-card border border-line bg-sunken/60 px-4 py-3.5 text-sm leading-relaxed text-muted">
        Una tarea sin habilidades la puede tomar cualquiera. Con habilidades, solo quien
        las tenga TODAS. El supervisor puede asignarla igual a alguien que no las tenga,
        pero la app se lo va a decir.
      </p>

      <Link href="/equipo" className="btn-quiet w-full">
        Ir al equipo para repartirlas
      </Link>
    </div>
  );
}
