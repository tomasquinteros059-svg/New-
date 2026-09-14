import Link from "next/link";

/**
 * Buscador de la cola.
 *
 * Es un formulario GET a propósito: la búsqueda queda en la URL, así que se
 * puede compartir, recargar y volver con el botón de atrás. Sin JavaScript
 * también funciona.
 */
export function SearchBox({ q, total, mostrando }: { q: string; total: number; mostrando: number }) {
  return (
    <div className="space-y-2.5">
      <form action="/disponibles" method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar en la cola…"
          aria-label="Buscar en la cola"
          className="field min-w-0 flex-1"
        />
        <button type="submit" className="btn-quiet shrink-0 px-4">
          Buscar
        </button>
      </form>

      {q ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>
            {total === 0
              ? `Nada coincide con «${q}».`
              : total === 1
                ? `1 resultado para «${q}».`
                : `${total} resultados para «${q}».`}
          </span>
          <Link href="/disponibles" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            Ver toda la cola
          </Link>
        </p>
      ) : mostrando < total ? (
        <p className="text-sm text-muted">
          Mostrando {mostrando} de {total}. Buscá para acotar.
        </p>
      ) : null}
    </div>
  );
}
