/**
 * Baja las tipografías de la marca y las deja adentro del demo.
 *
 * El demo y el APK se usan para decidir el diseño. Si las tipografías viajan por
 * red, en un teléfono sin señal —o adentro de un APK recién instalado— la app se
 * ve con la letra del sistema, que no es la que se está juzgando. Así que se
 * empaquetan.
 *
 * Solo se guardan los subconjuntos `latin` y `latin-ext`: es lo que necesita el
 * español, y bajar vietnamita o cirílico sería triplicar el peso para nada.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const PEDIDO =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Public+Sans:wght@400;500;600&display=swap";

/* Google devuelve woff2 solo si cree que el navegador lo soporta. */
const NAVEGADOR =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SUBCONJUNTOS = new Set(["latin", "latin-ext"]);

async function bajar(url, comoTexto = false) {
  const r = await fetch(url, { headers: { "user-agent": NAVEGADOR } });
  if (!r.ok) throw new Error(`${r.status} al bajar ${url}`);
  return comoTexto ? r.text() : Buffer.from(await r.arrayBuffer());
}

export async function empaquetarFuentes(salida) {
  const hoja = await bajar(PEDIDO, true);

  /* La hoja viene como pares "/* subconjunto *\/" + una regla @font-face. */
  const bloques = hoja
    .split(/\/\*\s*([a-z-]+)\s*\*\//i)
    .slice(1)
    .reduce((acc, parte, i, todas) => {
      if (i % 2 === 0) acc.push({ subconjunto: parte, regla: todas[i + 1] ?? "" });
      return acc;
    }, [])
    .filter(({ subconjunto }) => SUBCONJUNTOS.has(subconjunto));

  if (bloques.length === 0) throw new Error("no se reconoció ninguna regla de tipografía");

  await mkdir(resolve(salida, "fuentes"), { recursive: true });

  let css = "";
  let archivos = 0;
  for (const { regla } of bloques) {
    const url = regla.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    if (!url) continue;
    const nombre = basename(new URL(url).pathname);
    await writeFile(resolve(salida, "fuentes", nombre), await bajar(url));
    css += regla.replace(url, `./fuentes/${nombre}`);
    archivos += 1;
  }

  await writeFile(resolve(salida, "fuentes.css"), css.trim() + "\n");
  console.log(`fuentes: ${archivos} archivos empaquetados`);
}
