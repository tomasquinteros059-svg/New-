# El demo

Los componentes **reales** de Relevo con datos de prueba en memoria. No es una
maqueta aparte: importa la misma interfaz que usa la app, así que lo que ves
acá es lo que vas a ver en producción. Lo único reemplazado es el enrutado de
Next y las acciones de servidor, que sin servidor no existen.

## Para qué sirve

Para tocarlo en el teléfono y decir qué hay que arreglar, **antes** de montar
Supabase. Podés navegar todo, tomar una tarea, cerrarla con nota, soltarla,
chocar contra el tope, chocar contra una habilidad que no tenés, y cambiar
entre la vista del trabajador y la del supervisor.

## Para qué NO sirve

- No hay sesión: no se entra ni se sale.
- **Nada se guarda.** Al recargar vuelve al estado inicial.
- No hay base de datos, así que nada de lo que probás acá prueba que las reglas
  de seguridad funcionan. Para eso está `npm test`.
- Los avisos al teléfono y la subida de archivos no andan: necesitan servidor.

## Verlo

```bash
npm run demo
npx http-server demo/dist -p 4800   # o cualquier servidor estático
```

En cada `push` se publica solo en GitHub Pages: ver `.github/workflows/demo.yml`.

## Cómo está armado

| Archivo | Qué hace |
|---|---|
| `datos.ts` | Las tareas, el equipo y los avisos de prueba |
| `app.tsx` | Las pantallas, compuestas con los componentes reales |
| `main.tsx` | Monta la app e intercepta los formularios que apuntan a rutas |
| `shims/` | Reemplazos de `next/link`, `next/navigation` y las acciones |
| `build.mjs` | esbuild para el código, Tailwind CLI para los estilos |

Si el demo se desactualiza respecto de la app es porque alguien cambió una
pantalla sin cambiar su componente. Los componentes son compartidos; las
pantallas del demo, no.
