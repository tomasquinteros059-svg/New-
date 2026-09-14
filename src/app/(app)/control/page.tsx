import { requireSupervisor } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { sweepNow } from "@/lib/tasks/actions";
import { AlertCard } from "@/components/alert-card";
import { Banner } from "@/components/banner";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/format";
import type { OpenAlert, ReleaseEntry } from "@/lib/types";

export const metadata = { title: "Control · Relevo" };

export default async function ControlPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  await requireSupervisor();
  const { aviso } = await searchParams;

  const supabase = await createClient();
  const [alertsResult, releasesResult] = await Promise.all([
    supabase.rpc("open_alerts"),
    supabase.rpc("release_history", { p_limit: 20 }),
  ]);

  const alerts: OpenAlert[] = alertsResult.data ?? [];
  const releases: ReleaseEntry[] = releasesResult.data ?? [];
  const sinVer = alerts.filter((a) => a.acknowledged_at === null).length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Control</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          Lo que se está quedando atrás, y lo que la gente devuelve.
        </p>
      </header>

      {aviso === "revisado" ? <Banner tone="good">Revisado recién.</Banner> : null}
      {aviso === "error" ? (
        <Banner tone="bad">No pudimos completar la acción. Probá de nuevo.</Banner>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">
            Rescate
            {sinVer > 0 ? (
              <span className="ml-2 align-middle text-sm font-semibold text-signal">
                {sinVer} sin ver
              </span>
            ) : null}
          </h2>
        </div>

        {alerts.length === 0 ? (
          <EmptyState title="Nada estancado">
            Ninguna tarea pasó los umbrales. Los avisos aparecen solos: el barrido corre
            cada quince minutos dentro de la base de datos.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {alerts.map((alert) => (
              <li key={alert.id}>
                <AlertCard alert={alert} />
              </li>
            ))}
          </ul>
        )}

        {/*
          Salida de emergencia. Si ésta es la única forma de que aparezcan
          avisos, el barrido programado no está andando: ver supabase/scheduled.
        */}
        <form action={sweepNow}>
          <button type="submit" className="btn-quiet w-full">
            Revisar ahora
          </button>
        </form>
      </section>

      <section className="space-y-4 border-t border-line pt-8">
        <h2 className="font-display text-lg font-semibold text-ink">Soltadas recientes</h2>

        {releases.length === 0 ? (
          <EmptyState title="Nadie soltó nada">
            Cuando alguien devuelva una tarea a la cola, acá vas a ver quién, cuándo y por
            qué.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {releases.map((entry) => (
              <li key={entry.id} className="card p-4">
                <p className="font-display text-[1.0625rem] leading-snug font-semibold text-ink">
                  {entry.title}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {entry.self_released
                    ? `${entry.subject_name ?? "Alguien"} la soltó`
                    : `${entry.actor_name ?? "El supervisor"} se la sacó a ${entry.subject_name ?? "alguien"}`}
                  {" · "}
                  {formatDateTime(entry.released_at)}
                </p>
                {entry.reason ? (
                  <p className="mt-2.5 border-l-2 border-line-strong pl-3 text-[0.9375rem] leading-relaxed text-ink-soft">
                    {entry.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
