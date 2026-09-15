import Link from "next/link";

/**
 * Encabezado de una pantalla interior.
 *
 * Reemplaza los botones de «Volver» que estaban al final de cada pantalla. Un
 * botón de volver abajo de todo obliga a recorrer la pantalla entera para
 * salir, y compite visualmente con la acción principal, que es el único botón
 * grande que debería haber.
 *
 * El destino es explícito y no `router.back()`: la persona sabe a dónde va
 * antes de tocar, y el botón del sistema sigue funcionando igual.
 */
export function PageHeader({
  title,
  backHref,
  backLabel,
  eyebrow,
  children,
}: {
  title: string;
  backHref: string;
  /** A dónde vuelve, en una o dos palabras. */
  backLabel: string;
  /** Contexto corto arriba del título. */
  eyebrow?: string;
  /** Bajada opcional. */
  children?: React.ReactNode;
}) {
  return (
    <header className="space-y-3">
      <Link
        href={backHref}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-card px-2 text-[0.9375rem] font-semibold text-brand-700 transition-colors hover:bg-sunken"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {backLabel}
      </Link>

      <div>
        {eyebrow ? <p className="label">{eyebrow}</p> : null}
        <h1
          className={`font-display text-2xl leading-tight font-bold text-ink ${
            eyebrow ? "mt-1.5" : ""
          }`}
        >
          {title}
        </h1>
        {children ? (
          <div className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">{children}</div>
        ) : null}
      </div>
    </header>
  );
}
