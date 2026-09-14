import type { Digest } from "@/lib/types";

/**
 * Convierte el resumen en un correo.
 *
 * Función pura a propósito: recibe datos y devuelve texto. No sabe de correo,
 * de red ni de proveedores, así que se puede probar sin ninguno de los tres.
 * Enviarlo es problema de send.ts.
 */
export type Correo = { subject: string; text: string; html: string };

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function renderDigest(digest: Digest, timeZone: string): Correo {
  // `day: "numeric"` y no "2-digit": en es-CL, "2-digit" produce
  // "14-septiembre" y "numeric" produce "14 de septiembre", que es lo que uno
  // quiere leer en el asunto de un correo.
  const fecha = new Intl.DateTimeFormat("es-CL", {
    timeZone,
    day: "numeric",
    month: "long",
  }).format(new Date(digest.generated_at));

  const { stale_available: sinTomar, stale_active: sinCerrar, over_limit: pasados } = digest;
  const atrasos = sinTomar.length + sinCerrar.length;

  const subject =
    atrasos === 0
      ? `Relevo · ${fecha} · al día`
      : `Relevo · ${fecha} · ${plural(atrasos, "tarea atrasada", "tareas atrasadas")}`;

  const lineas: string[] = [];

  lineas.push(`Resumen del ${fecha}`);
  lineas.push("");
  lineas.push(
    `En cola: ${digest.totals.available} · ` +
      `En curso: ${digest.totals.active} · ` +
      `Cerradas en 24 h: ${digest.totals.closed_last_24h} · ` +
      `Soltadas en 24 h: ${digest.totals.released_last_24h}`,
  );

  if (atrasos === 0 && pasados.length === 0) {
    lineas.push("");
    lineas.push("Nada pasó los umbrales. No hay nada que rescatar.");
  }

  if (sinTomar.length > 0) {
    lineas.push("");
    lineas.push(
      `NADIE LAS TOMA (más de ${digest.thresholds.stale_available_hours} h en la cola)`,
    );
    for (const t of sinTomar) {
      lineas.push(`  · ${t.title} — hace ${t.waiting_hours} h`);
    }
  }

  if (sinCerrar.length > 0) {
    lineas.push("");
    lineas.push(
      `NADIE LAS CIERRA (más de ${digest.thresholds.stale_active_hours} h en curso)`,
    );
    for (const t of sinCerrar) {
      lineas.push(`  · ${t.title} — ${t.assignee ?? "sin dueño"}, hace ${t.open_hours} h`);
    }
  }

  if (pasados.length > 0) {
    lineas.push("");
    lineas.push("PASADOS DE SU TOPE");
    for (const p of pasados) {
      lineas.push(`  · ${p.name} — ${p.active} de ${p.limit}`);
    }
  }

  const text = lineas.join("\n");

  const escapar = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#14171b">
<h1 style="font-size:18px;margin:0 0 4px">Relevo · ${escapar(fecha)}</h1>
<pre style="white-space:pre-wrap;font-family:inherit;font-size:15px;line-height:1.6;margin:0">${escapar(
    text.split("\n").slice(2).join("\n"),
  )}</pre>
</div>`;

  return { subject, text, html };
}
