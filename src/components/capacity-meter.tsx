/**
 * Medidor de capacidad.
 *
 * `used` SIEMPRE llega de contar tareas activas, nunca de un contador guardado
 * en la tabla de perfiles: un contador es una segunda fuente de verdad y se
 * desincroniza al primer error.
 */
export function CapacityMeter({ used, limit }: { used: number; limit: number }) {
  const atLimit = used >= limit;

  return (
    <section aria-label="Tu capacidad" className="card p-4">
      <div className="flex items-baseline justify-between">
        <span className="label">Capacidad</span>
        <span className="font-display text-sm font-semibold text-ink-soft">
          {used} de {limit}
        </span>
      </div>

      <div
        className="mt-2.5 flex gap-1.5"
        role="img"
        aria-label={`${used} de ${limit} tareas activas`}
      >
        {Array.from({ length: limit }, (_, i) => (
          <span
            key={i}
            className={`h-2 flex-1 rounded-full ${
              i < used ? (atLimit ? "bg-busy" : "bg-brand-500") : "bg-sunken"
            }`}
          />
        ))}
      </div>

      {atLimit ? (
        <p className="mt-2.5 text-sm leading-relaxed text-busy">
          Estás en tu límite. Para tomar otra, cerrá o soltá una.
        </p>
      ) : null}
    </section>
  );
}
