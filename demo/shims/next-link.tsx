import * as React from "react";

/**
 * Reemplazo de `next/link` para el demo.
 *
 * El demo no tiene servidor: la navegación vive en el hash de la URL. Así el
 * botón de atrás del teléfono funciona igual y se puede compartir un enlace a
 * una pantalla concreta.
 */
export default function Link({
  href,
  children,
  ...resto
}: { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={`#${href}`}
      onClick={(e) => {
        e.preventDefault();
        window.location.hash = href;
        window.scrollTo(0, 0);
      }}
      {...resto}
    >
      {children}
    </a>
  );
}
