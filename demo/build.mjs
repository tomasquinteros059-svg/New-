/**
 * Arma el demo navegable.
 *
 *   node demo/build.mjs
 *
 * Importa los COMPONENTES REALES de la app: lo que se ve en el demo es la
 * misma interfaz, no una maqueta aparte que se desactualiza sola. Lo único que
 * se reemplaza son el enrutado de Next y las acciones de servidor, que no
 * existen sin servidor.
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");
const salida = resolve(aqui, "dist");

rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });

await build({
  entryPoints: [resolve(aqui, "main.tsx")],
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2022"],
  jsx: "automatic",
  outfile: resolve(salida, "demo.js"),
  /*
   * Sin Next no hay `process`. Los módulos compartidos leen alguna variable de
   * entorno (la zona horaria, la clave pública de avisos), así que se fijan acá
   * en tiempo de compilación.
   */
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_TIME_ZONE": '"America/Santiago"',
    "process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY": "undefined",
  },
  loader: { ".css": "empty" },
  alias: {
    "next/link": resolve(aqui, "shims/next-link.tsx"),
    "next/navigation": resolve(aqui, "shims/next-navigation.ts"),
    "@/lib/tasks/actions": resolve(aqui, "shims/acciones.ts"),
    "@/lib/admin/actions": resolve(aqui, "shims/acciones.ts"),
    "@/lib/skills/actions": resolve(aqui, "shims/acciones.ts"),
    "@/lib/push/actions": resolve(aqui, "shims/acciones.ts"),
    "@": resolve(raiz, "src"),
  },
  logLevel: "warning",
});

execFileSync(
  "npx",
  ["@tailwindcss/cli", "-i", resolve(aqui, "demo.css"), "-o", resolve(salida, "demo.css"), "--minify"],
  { cwd: raiz, stdio: "inherit" },
);

copyFileSync(resolve(aqui, "index.html"), resolve(salida, "index.html"));
copyFileSync(resolve(raiz, "public/icono-192.png"), resolve(salida, "icono-192.png"));

console.log("demo/dist listo");
