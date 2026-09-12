"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

/**
 * Navegación inferior: el pulgar llega abajo, no arriba.
 *
 * Cuatro destinos como techo (el supervisor ve los cuatro). Las acciones no
 * viven acá: crear una tarea es un botón dentro de la cola, no un destino.
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
                className={`flex flex-col items-center gap-1 px-2 py-3 font-display text-[0.8125rem] font-semibold transition-colors ${
                  active ? "text-signal" : "text-muted hover:text-ink-soft"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-[3px] w-7 rounded-full transition-colors ${
                    active ? "bg-signal" : "bg-transparent"
                  }`}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
