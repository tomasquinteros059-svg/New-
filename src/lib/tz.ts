/**
 * Conversión de "hora de pared" a instante UTC.
 *
 * El input `datetime-local` del navegador entrega "2026-09-12T18:30" sin zona.
 * Interpretarlo con `new Date(...)` usa la zona del SERVIDOR, que en Vercel es
 * UTC: una fecha límite escrita como las 18:30 se guardaría como las 18:30 UTC,
 * o sea las 14:30 en Chile. Cuatro horas de error, siempre.
 *
 * Acá se interpreta explícitamente en la zona de la operación, y se tiene en
 * cuenta el horario de verano, que en Chile mueve el reloj entre UTC-4 y UTC-3.
 */

/** Cuántos milisegundos adelanta `timeZone` respecto de UTC en ese instante. */
function offsetAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");

  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24, // en-US puede devolver "24" para la medianoche
    get("minute"),
    get("second"),
  );

  return asIfUtc - instant.getTime();
}

/**
 * "2026-09-12T18:30" en America/Santiago -> "2026-09-12T22:30:00.000Z"
 *
 * Devuelve null si el valor está vacío o no se entiende.
 */
export function wallTimeToUtcIso(local: string, timeZone: string): string | null {
  if (!local) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;

  const naive = Date.parse(`${local.length === 16 ? `${local}:00` : local}Z`);
  if (Number.isNaN(naive)) return null;

  // Primera estimación, y una corrección: si la fecha cae justo en el cambio de
  // horario, el offset correcto es el del instante resultante, no el de la
  // estimación inicial.
  let utc = naive - offsetAt(new Date(naive), timeZone);
  utc = naive - offsetAt(new Date(utc), timeZone);

  return new Date(utc).toISOString();
}

/** El camino inverso, para rellenar el formulario al editar. */
export function utcIsoToWallTime(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const shifted = new Date(d.getTime() + offsetAt(d, timeZone));
  return shifted.toISOString().slice(0, 16);
}
