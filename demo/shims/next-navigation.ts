import { useSyncExternalStore } from "react";

function rutaActual() {
  return window.location.hash.slice(1) || "/mis-tareas";
}

function suscribir(avisar: () => void) {
  window.addEventListener("hashchange", avisar);
  return () => window.removeEventListener("hashchange", avisar);
}

export function usePathname() {
  return useSyncExternalStore(suscribir, rutaActual, () => "/mis-tareas");
}

export function useRouter() {
  return {
    push: (href: string) => {
      window.location.hash = href;
      window.scrollTo(0, 0);
    },
    replace: (href: string) => {
      window.location.hash = href;
    },
    back: () => window.history.back(),
    refresh: () => {},
    prefetch: () => {},
  };
}

export function redirect(href: string): never {
  window.location.hash = href;
  throw new Error("redirect");
}
