/**
 * Formateo con zona horaria fija.
 *
 * Todo se guarda en UTC en Postgres (timestamptz) y se muestra en la zona de
 * la operación. Dejarlo a la zona del navegador haría que el supervisor y el
 * trabajador vean horas distintas para el mismo hecho.
 */
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE ?? "America/Santiago";

const dateTime = new Intl.DateTimeFormat("es-CL", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  // 24 horas: en trabajo por turnos, "18:00" no se confunde con "06:00 a. m.".
  hour12: false,
});

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return dateTime.format(new Date(iso));
}

/** "hace 3 h", "hace 2 d". Para la antigüedad en cola. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export const PRIORITY_LABEL = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
} as const;

export const PRIORITY_CLASS = {
  high: "bg-high-soft text-high",
  medium: "bg-medium-soft text-medium",
  low: "bg-low-soft text-low",
} as const;
