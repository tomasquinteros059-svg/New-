"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number };

/**
 * Navegación inferior: el pulgar llega abajo, no arriba.
 *
 * Cuatro destinos como techo (el supervisor ve los cuatro). Las acciones no
 * viven acá: crear una tarea es un botón dentro de la cola, no un destino.
 * La cuenta tampoco: se llega por el nombre, arriba a la derecha.
 */
export function Nav({ items }: { items: Item[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Principal"
      className="sticky bottom-0 z-10 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex w-full max-w-md">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 px-1.5 py-3 font-display text-[0.8125rem] font-semibold transition-colors ${
                  active ? "text-signal" : "text-muted hover:text-ink-soft"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-[3px] w-7 rounded-full transition-colors ${
                    active ? "bg-signal" : "bg-transparent"
                  }`}
                />
                {/*
                  El contador va EN LÍNEA y no posicionado en absoluto: sobre el
                  último destino, un badge absoluto se sale de la pantalla y el
                  navegador lo recorta.
                */}
                <span className="flex items-center gap-1.5">
                  {item.label}
                  {item.badge && item.badge > 0 ? (
                    <span
                      aria-label={`${item.badge} sin ver`}
                      className="flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-signal px-1 text-[11px] leading-none font-bold text-white"
                    >
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
