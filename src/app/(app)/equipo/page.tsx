import { requireSupervisor } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { TeamRow } from "@/components/team-row";
import { TeamSummary } from "@/components/team-summary";
import { Banner } from "@/components/banner";
import { EmptyState } from "@/components/empty-state";
import type { TeamMember } from "@/lib/types";

export const metadata = { title: "Equipo · Relevo" };

export default async function EquipoPage() {
  // La puerta real está en team_load(), que le devuelve cero filas a quien no
  // es supervisor. Esto solo evita mostrar una pantalla que vendría vacía.
  await requireSupervisor();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_load");
  const team: TeamMember[] = data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Equipo</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          Quién tiene lugar y quién no da más.
        </p>
      </header>

      <TeamSummary team={team} />

      {error ? (
        <Banner tone="bad">No pudimos cargar el equipo. Recargá la página.</Banner>
      ) : team.length === 0 ? (
        <EmptyState title="Todavía no hay nadie">
          Las cuentas se crean desde el panel de Supabase.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {team.map((person) => (
            <li key={person.id}>
              <TeamRow person={person} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm leading-relaxed text-muted">
        La carga se cuenta sola a partir de las tareas activas. &quot;Fuera&quot; es una
        declaración de la persona, no una deducción: alguien puede estar fuera de turno
        y tener trabajo abierto, y eso es justamente lo que conviene ver.
      </p>
    </div>
  );
}
