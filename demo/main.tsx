import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./demo.css";

/*
 * El buscador y otros formularios de la app apuntan a rutas reales. En el demo
 * no hay servidor, así que se interceptan y se traducen al hash.
 */
document.addEventListener("submit", (evento) => {
  const form = evento.target as HTMLFormElement;
  if (!form.action) return;
  evento.preventDefault();

  const destino = new URL(form.action, window.location.href);
  const datos = new FormData(form);
  const parametros = new URLSearchParams();
  for (const [clave, valor] of datos.entries()) {
    if (typeof valor === "string" && valor) parametros.set(clave, valor);
  }
  const cadena = parametros.toString();
  window.location.hash = destino.pathname + (cadena ? `?${cadena}` : "");
});

createRoot(document.getElementById("app")!).render(<App />);
