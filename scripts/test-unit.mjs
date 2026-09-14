/**
 * Pruebas de las funciones puras del lado de la aplicación.
 *
 *   npm run test:unit
 *
 * Son las dos piezas que hacen cuentas de verdad fuera de Postgres: la
 * conversión de zona horaria y el armado del correo. Ambas están escritas como
 * funciones puras justamente para poder probarlas sin navegador, sin Supabase
 * y sin proveedor de correo.
 */
import assert from "node:assert/strict";

const { wallTimeToUtcIso, utcIsoToWallTime } = await import("../src/lib/tz.ts");
const { renderDigest } = await import("../src/lib/email/digest.ts");

const TZ = "America/Santiago";
let pasadas = 0;

function prueba(nombre, fn) {
  try {
    fn();
    pasadas += 1;
    console.log(`  OK  ${nombre}`);
  } catch (error) {
    console.error(`  FALLO  ${nombre}`);
    console.error(`        ${error.message}`);
    process.exitCode = 1;
  }
}

console.log("\n--- zona horaria ---");

prueba("invierno chileno (UTC-4): 18:30 local es 22:30 UTC", () => {
  assert.equal(wallTimeToUtcIso("2026-06-15T18:30", TZ), "2026-06-15T22:30:00.000Z");
});

prueba("verano chileno (UTC-3): 18:30 local es 21:30 UTC", () => {
  assert.equal(wallTimeToUtcIso("2026-01-15T18:30", TZ), "2026-01-15T21:30:00.000Z");
});

prueba("ida y vuelta sin desajuste, a los dos lados del cambio de hora", () => {
  for (const local of ["2026-06-15T18:30", "2026-01-15T18:30", "2026-09-14T00:00"]) {
    assert.equal(utcIsoToWallTime(wallTimeToUtcIso(local, TZ), TZ), local);
  }
});

prueba("lo vacío y lo inválido devuelven null en vez de una fecha inventada", () => {
  assert.equal(wallTimeToUtcIso("", TZ), null);
  assert.equal(wallTimeToUtcIso("no-es-fecha", TZ), null);
  assert.equal(wallTimeToUtcIso("2026-13-45T99:99", TZ), null);
  assert.equal(utcIsoToWallTime(null, TZ), "");
});

console.log("\n--- resumen diario ---");

const vacio = {
  ok: true,
  generated_at: "2026-09-14T11:00:00.000Z",
  thresholds: { stale_available_hours: 12, stale_active_hours: 48 },
  totals: { available: 4, active: 3, closed_last_24h: 7, released_last_24h: 1 },
  stale_available: [],
  stale_active: [],
  over_limit: [],
};

prueba("sin atrasos, el asunto dice «al día» y no inventa secciones", () => {
  const { subject, text } = renderDigest(vacio, TZ);
  assert.match(subject, /al día/);
  assert.match(text, /Nada pasó los umbrales/);
  assert.doesNotMatch(text, /NADIE LAS TOMA/);
  assert.doesNotMatch(text, /PASADOS DE SU TOPE/);
});

prueba("los totales salen en el cuerpo", () => {
  const { text } = renderDigest(vacio, TZ);
  assert.match(text, /En cola: 4/);
  assert.match(text, /Cerradas en 24 h: 7/);
});

const conAtrasos = {
  ...vacio,
  stale_available: [
    { id: "1", title: "Inventario del galpón", priority: "low", waiting_hours: 30 },
  ],
  stale_active: [
    {
      id: "2",
      title: "Cambiar filtros",
      priority: "medium",
      assignee: "Beto Pérez",
      open_hours: 61,
    },
  ],
  over_limit: [{ name: "Beto Pérez", active: 4, limit: 3 }],
};

prueba("con atrasos, el asunto los cuenta", () => {
  assert.match(renderDigest(conAtrasos, TZ).subject, /2 tareas atrasadas/);
});

prueba("una sola tarea atrasada va en singular", () => {
  const uno = { ...conAtrasos, stale_active: [] };
  assert.match(renderDigest(uno, TZ).subject, /1 tarea atrasada/);
});

prueba("cada sección trae título, horas y de quién es", () => {
  const { text } = renderDigest(conAtrasos, TZ);
  assert.match(text, /Inventario del galpón — hace 30 h/);
  assert.match(text, /Cambiar filtros — Beto Pérez, hace 61 h/);
  assert.match(text, /Beto Pérez — 4 de 3/);
  assert.match(text, /más de 12 h en la cola/);
  assert.match(text, /más de 48 h en curso/);
});

prueba("una tarea sin dueño no rompe el renglón", () => {
  const huerfana = {
    ...conAtrasos,
    stale_active: [{ id: "2", title: "Sin dueño", priority: "low", assignee: null, open_hours: 50 }],
  };
  assert.match(renderDigest(huerfana, TZ).text, /Sin dueño — sin dueño, hace 50 h/);
});

prueba("el HTML escapa lo que escribió una persona", () => {
  const conHtml = {
    ...vacio,
    stale_available: [
      { id: "1", title: '<script>alert("x")</script> & más', priority: "low", waiting_hours: 20 },
    ],
  };
  const { html } = renderDigest(conHtml, TZ);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp; más/);
});

prueba("la fecha del asunto usa la zona de la operación, no la del servidor", () => {
  // 11:00 UTC del 14 es el 14 en Chile; 02:00 UTC del 15 es todavía el 14.
  const tarde = { ...vacio, generated_at: "2026-09-15T02:00:00.000Z" };
  assert.match(renderDigest(tarde, TZ).subject, /14 de septiembre/);
});

console.log(`\n${pasadas} pruebas de funciones puras: ${process.exitCode ? "CON FALLOS" : "PASARON"}\n`);
