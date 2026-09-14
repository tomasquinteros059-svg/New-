import Link from "next/link";

/**
 * Paginación de la cola.
 *
 * Anterior y siguiente, sin números de página: con el pulgar, dos blancos
 * grandes sirven más que diez chiquitos, y nadie salta a la página 7 de una
 * cola de trabajo.
 */
export function Pager({
  page,
  pageSize,
  total,
  q,
}: {
  page: number;
  pageSize: number;
  total: number;
  q: string;
}) {
  const ultima = Math.max(1, Math.ceil(total / pageSize));
  if (ultima <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("p", String(p));
    const cadena = params.toString();
    return `/disponibles${cadena ? `?${cadena}` : ""}`;
  };

  return (
    <nav aria-label="Páginas de la cola" className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn-quiet px-4">
          Anterior
        </Link>
      ) : (
        <span className="btn-quiet pointer-events-none px-4 opacity-40">Anterior</span>
      )}

      <span className="text-sm text-muted">
        Página {page} de {ultima}
      </span>

      {page < ultima ? (
        <Link href={href(page + 1)} className="btn-quiet px-4">
          Siguiente
        </Link>
      ) : (
        <span className="btn-quiet pointer-events-none px-4 opacity-40">Siguiente</span>
      )}
    </nav>
  );
}
