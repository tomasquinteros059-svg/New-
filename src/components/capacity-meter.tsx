import { LoadBar } from "@/components/load-bar";

/**
 * Medidor de capacidad propio.
 *
 * `used` SIEMPRE llega de contar tareas activas, nunca de un contador guardado
 * en la tabla de perfiles: un contador es una segunda fuente de verdad y se
 * desincroniza al primer error.
 */
export function CapacityMeter({ used, limit }: { used: number; limit: number }) {
  const atLimit = used >= limit;
  const over = used > limit;

  return (
    <section aria-label="Tu capacidad" className="card p-4">
      <div className="flex items-baseline justify-between">
        <span className="label">Capacidad</span>
        <span className="font-display text-sm font-semibold text-ink-soft">
          {used} de {limit}
        </span>
      </div>

      <div className="mt-2.5">
        <LoadBar used={used} limit={limit} />
      </div>

      {over ? (
        <p className="mt-2.5 text-sm leading-relaxed text-high">
          Estás {used - limit} por encima de tu tope porque te asignaron trabajo. Cerrá lo
          que puedas.
        </p>
      ) : atLimit ? (
        <p className="mt-2.5 text-sm leading-relaxed text-busy">
          Estás en tu límite. Para tomar otra, cerrá o soltá una.
        </p>
      ) : null}
    </section>
  );
}
