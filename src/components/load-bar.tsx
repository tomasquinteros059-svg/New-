/**
 * Barra de carga de una persona.
 *
 * Tiene que poder dibujar MÁS tareas que el tope: el límite es blando para la
 * asignación, así que alguien con tope 3 puede terminar con 4. Los segmentos
 * que se pasan del tope van en rojo, no en el color normal: si no se
 * distinguieran, el panel escondería justo el caso que hay que mirar.
 */
export function LoadBar({ used, limit }: { used: number; limit: number }) {
  const total = Math.max(used, limit);
  const over = used > limit;

  return (
    <div
      className="flex gap-1"
      role="img"
      aria-label={
        over
          ? `${used} tareas activas, ${used - limit} por encima de su tope de ${limit}`
          : `${used} de ${limit} tareas activas`
      }
    >
      {Array.from({ length: total }, (_, i) => {
        const filled = i < used;
        const beyondLimit = i >= limit;

        return (
          <span
            key={i}
            className={`h-2 flex-1 rounded-full ${
              filled
                ? beyondLimit
                  ? "bg-high"
                  : used >= limit
                    ? "bg-busy"
                    : "bg-brand-500"
                : "bg-sunken"
            }`}
          />
        );
      })}
    </div>
  );
}
