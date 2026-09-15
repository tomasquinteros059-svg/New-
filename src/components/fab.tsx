import Link from "next/link";

/**
 * Acción flotante.
 *
 * Crear una tarea era un botón naranja a todo el ancho en medio de la lista:
 * empujaba la cola hacia abajo y competía con las tarjetas por la atención.
 * Flotando queda siempre al alcance del pulgar sin ocupar lugar en el flujo.
 *
 * El envoltorio fijo respeta el ancho de la columna de contenido, así que en
 * una pantalla ancha el botón no se va al borde lejos de la lista.
 */
export function Fab({ href, label }: { href: string; label: string }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-20 px-5"
      style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex w-full max-w-md justify-end">
        <Link
          href={href}
          aria-label={label}
          className="pointer-events-auto inline-flex min-h-14 items-center gap-2 rounded-pill bg-signal pr-5 pl-4 font-display text-[0.9375rem] font-semibold text-white shadow-lifted transition-colors hover:bg-signal-dark"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {label}
        </Link>
      </div>
    </div>
  );
}
