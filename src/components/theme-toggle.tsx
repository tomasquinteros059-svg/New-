"use client";

import { useEffect, useState } from "react";

export type Tema = "system" | "light" | "dark";

const CLAVE = "relevo-tema";

function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === "system") raiz.removeAttribute("data-theme");
  else raiz.dataset.theme = tema;
}

/**
 * Elegir tema.
 *
 * Tres estados y no un interruptor de dos: "sistema" es el default y es lo que
 * la mayoría quiere. Un interruptor de dos obliga a elegir para siempre algo
 * que el teléfono ya decide solo al anochecer.
 *
 * Se guarda en localStorage y no en la base: es del dispositivo, no de la
 * persona. El mismo usuario puede querer claro en el teléfono del galpón y
 * oscuro en el de su casa.
 */
export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>("system");

  useEffect(() => {
    /*
     * En un microtask y no directo: setState síncrono dentro de un efecto
     * dispara renders en cascada. El tema ya está aplicado por el script
     * inline del layout, así que este estado es solo para marcar qué botón
     * está elegido; que llegue un microtask después no se ve.
     */
    queueMicrotask(() => {
      try {
        const guardado = localStorage.getItem(CLAVE) as Tema | null;
        if (guardado === "light" || guardado === "dark") setTema(guardado);
      } catch {
        // Modo privado o almacenamiento bloqueado: se queda en "sistema".
      }
    });
  }, []);

  function elegir(nuevo: Tema) {
    setTema(nuevo);
    aplicar(nuevo);
    try {
      if (nuevo === "system") localStorage.removeItem(CLAVE);
      else localStorage.setItem(CLAVE, nuevo);
    } catch {
      // Si no se puede guardar, al menos vale para esta sesión.
    }
  }

  const opciones: { valor: Tema; texto: string }[] = [
    { valor: "light", texto: "Claro" },
    { valor: "dark", texto: "Oscuro" },
    { valor: "system", texto: "Sistema" },
  ];

  return (
    <div className="space-y-2">
      <span className="label">Aspecto</span>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Aspecto">
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => elegir(o.valor)}
            aria-pressed={tema === o.valor}
            className={`rounded-card border py-3 font-display text-[0.9375rem] font-semibold transition-colors ${
              tema === o.valor
                ? "border-signal bg-signal-soft text-signal"
                : "border-line-strong bg-surface text-ink-soft hover:bg-sunken"
            }`}
          >
            {o.texto}
          </button>
        ))}
      </div>
      <p className="text-sm leading-relaxed text-muted">
        Se guarda en este dispositivo. «Sistema» sigue lo que tenga el teléfono.
      </p>
    </div>
  );
}
