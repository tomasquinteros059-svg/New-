import { requireSupervisor } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Equipo · Relevo" };

export default async function EquipoPage() {
  // La puerta real es RLS. Esto solo evita renderizar una pantalla que vendría
  // vacía para un trabajador.
  await requireSupervisor();

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("role", { ascending: false })
    .order("full_name", { ascending: true });

  const people: Profile[] = data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Equipo</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          {people.length} {people.length === 1 ? "persona" : "personas"} con cuenta.
        </p>
      </header>

      <ul className="space-y-2.5">
        {people.map((person) => (
          <li key={person.id} className="card flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-display text-[1.0625rem] font-semibold text-ink">
                {person.full_name}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {person.role === "supervisor" ? "Supervisor" : "Trabajador"} · tope{" "}
                {person.active_task_limit}
              </p>
            </div>
            <span
              className={`pill shrink-0 ${
                person.is_present ? "bg-free-soft text-free" : "bg-sunken text-muted"
              }`}
            >
              {person.is_present ? "En turno" : "Fuera"}
            </span>
          </li>
        ))}
      </ul>

      <p className="rounded-card border border-line bg-sunken/60 px-4 py-3.5 text-sm leading-relaxed text-muted">
        Esto es el padrón: quién tiene cuenta y quién declaró estar en turno. El panel de
        carga —cuántas tareas activas lleva cada uno y quién está saturado— llega en la
        Fase 3, cuando existan tareas que contar.
      </p>
    </div>
  );
}
