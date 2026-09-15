/**
 * Genera los iconos de la aplicación.
 *
 *   node scripts/generar-iconos.mjs
 *
 * Se dibujan por código y no con una herramienta de diseño para que el icono
 * salga de los MISMOS colores que el resto de la app: si mañana cambia la
 * marca, se cambia acá y se vuelve a correr.
 *
 * Escribe PNG a mano (zlib está en Node) porque no hay librería de imágenes
 * en el entorno, y arrastrar una dependencia para tres cuadrados no se paga.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const FONDO = [10, 43, 59];      // brand-900
const NARANJA = [207, 83, 32];   // signal
const CELESTE = [143, 184, 206]; // brand-300

function crc32(buf) {
  let c, tabla = crc32.tabla;
  if (!tabla) {
    tabla = crc32.tabla = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabla[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i += 1) c = tabla[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function png(ancho, alto, pixeles) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;   // 8 bits por canal
  ihdr[9] = 2;   // color verdadero, sin alfa
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(pixeles, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

/** El mismo mark del encabezado: dos barras, una naranja y una celeste. */
function dibujar(lado) {
  // Zona segura de Android: el sistema recorta hasta un 20% de cada borde en
  // los iconos "maskable". El mark ocupa el centro para sobrevivir el recorte.
  const anchoBarra = Math.round(lado * 0.085);
  const altoBarra = Math.round(lado * 0.34);
  const separacion = Math.round(lado * 0.055);
  const x0 = Math.round((lado - (anchoBarra * 2 + separacion)) / 2);
  const y0 = Math.round((lado - altoBarra) / 2);
  const radio = Math.round(anchoBarra / 2);

  const filas = [];
  for (let y = 0; y < lado; y += 1) {
    const fila = Buffer.alloc(1 + lado * 3);
    fila[0] = 0; // filtro "none"
    for (let x = 0; x < lado; x += 1) {
      let color = FONDO;

      for (const [inicio, tono] of [[x0, NARANJA], [x0 + anchoBarra + separacion, CELESTE]]) {
        const dentroX = x >= inicio && x < inicio + anchoBarra;
        const dentroY = y >= y0 && y < y0 + altoBarra;
        if (!dentroX || !dentroY) continue;

        // Puntas redondeadas: se descarta la esquina fuera del círculo.
        const cy = y < y0 + radio ? y0 + radio : y > y0 + altoBarra - radio ? y0 + altoBarra - radio : y;
        const cx = inicio + radio;
        if (cy !== y && (x - cx) ** 2 + (y - cy) ** 2 > radio ** 2) continue;

        color = tono;
      }

      const i = 1 + x * 3;
      fila[i] = color[0];
      fila[i + 1] = color[1];
      fila[i + 2] = color[2];
    }
    filas.push(fila);
  }
  return png(lado, lado, Buffer.concat(filas));
}

for (const lado of [192, 512]) {
  const archivo = `public/icono-${lado}.png`;
  writeFileSync(archivo, dibujar(lado));
  console.log(`${archivo}  ${lado}x${lado}`);
}
