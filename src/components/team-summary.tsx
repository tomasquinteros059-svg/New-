import { loadState } from "@/components/team-row";
import type { TeamMember } from "@/lib/types";

/**
 * Los tres números que responden "de un vistazo".
 *
 * La lista de abajo es el detalle; esto es lo que el supervisor mira sin leer.
 */
export function TeamSummary({ team }: { team: TeamMember[] }) {
  let libres = 0;
  let alTope = 0;
  let fuera = 0;

  for (const person of team) {
    const state = loadState(person);
    if (state === "away") fuera += 1;
    else if (state === "full" || state === "over") alTope += 1;
    else libres += 1;
  }

  return (
    <section
      aria-label="Resumen del equipo"
      className="card grid grid-cols-3 divide-x divide-line"
    >
      <Stat value={libres} label="con cupo" tone="text-free" />
      <Stat value={alTope} label="al tope" tone="text-busy" />
      <Stat value={fuera} label="fuera" tone="text-muted" />
    </section>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="px-3 py-4 text-center">
      <p className={`font-display text-3xl leading-none font-bold ${tone}`}>{value}</p>
      <p className="mt-1.5 text-sm text-muted">{label}</p>
    </div>
  );
}
