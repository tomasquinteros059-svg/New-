# Relevo

Cola de trabajo con capacidad. Administra una fila de tareas, sabe quién tiene
lugar disponible y entrega trabajo a quien está libre. La gente también puede
tomar tareas por su cuenta.

No es un ERP, no es un chat, no es un gestor de proyectos.

---

## Estado: Fase 1 completa

| Fase | Contenido | Estado |
|---|---|---|
| **1 — Base** | Proyecto, base de datos con RLS, autenticación, entrar y salir | ✅ |
| 2 — Cola | Crear, listar por prioridad, tomar, cerrar | pendiente |
| 3 — Capacidad | Límite activo, panel de carga del equipo | pendiente |
| 4 — Control | Soltar con motivo, evidencia, avisos de rescate | pendiente |

**Criterio de la Fase 1**: dos usuarios distintos pueden iniciar sesión y cada
uno ve solo lo suyo.

Verificado con 31 afirmaciones automatizadas sobre las políticas de seguridad
(`npm run test:db`), entre ellas que un trabajador no ve la tarea activa de otro
ni consultando la API directamente.

---

## Puesta en marcha

### 1. Proyecto de Supabase

Creá un proyecto en [supabase.com](https://supabase.com). Anotá de
**Settings → API** la *Project URL* y la *anon public key*.

> La **service_role key** no va en este repositorio ni en ningún archivo del
> proyecto. Saltea todas las políticas de seguridad.

### 2. Aplicar las migraciones

En **SQL Editor**, pegá y ejecutá los tres archivos de `supabase/migrations/`
**en orden**:

1. `20260912000100_init_schema.sql` — tablas, tipos, índices, restricciones
2. `20260912000200_functions_triggers.sql` — funciones y triggers
3. `20260912000300_rls.sql` — Row Level Security

O con la CLI, si preferís:

```bash
npx supabase link --project-ref <tu-project-ref>
npx supabase db push
```

### 3. Configurar la autenticación

En **Authentication → URL Configuration**:

- *Site URL*: `http://localhost:3000` en desarrollo; el dominio de Vercel en producción.
- *Redirect URLs*: agregá `http://localhost:3000/auth/callback` y
  `https://TU-DOMINIO.vercel.app/auth/callback`. Sin esto, el link mágico rebota.

En **Authentication → Providers → Email**: dejá habilitado *Email*, y desactivá
*Enable Sign Ups*. El registro es cerrado por diseño: las cuentas las crea el
supervisor.

### 4. Crear el primer supervisor

Las cuentas se crean desde **Authentication → Users → Add user**. El trigger
`on_auth_user_created` arma el perfil automáticamente, siempre con rol
`worker` — incluso si alguien manipula la metadata del registro.

El primer supervisor se promueve una sola vez, desde el SQL Editor:

```sql
update public.profiles
set role = 'supervisor'
where id = (select id from auth.users where email = 'ana@tuempresa.cl');
```

De ahí en adelante, un supervisor puede promover a otros desde la aplicación.
El sistema no te deja quedarte sin ningún supervisor.

### 5. Variables de entorno

```bash
cp .env.example .env.local
```

Completá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### 6. Levantar

```bash
npm install
npm run dev
```

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run typecheck` | TypeScript sin emitir |
| `npm run lint` | ESLint |
| `npm run test:db` | 31 pruebas de RLS contra un Postgres local |

`npm run test:db` levanta un Postgres efímero, emula lo mínimo de Supabase
(roles `anon`/`authenticated`/`service_role`, esquema `auth`, `auth.uid()`),
aplica las migraciones y verifica las políticas. No toca tu proyecto de
Supabase y no necesita Docker. Requiere `postgresql-16` instalado.

---

## Cómo está construido

```
src/
  proxy.ts                 Refresca la sesión y redirige (Next 16: era middleware.ts)
  lib/
    supabase/client.ts     Cliente de navegador
    supabase/server.ts     Cliente de servidor (cookies() es async en Next 16)
    supabase/proxy.ts      Refresco de sesión en el borde
    auth/dal.ts            Data Access Layer: toda pantalla entra por acá
    types.ts               Tipos espejo del esquema
    format.ts              Fechas en America/Santiago, 24 horas
  app/
    login/                 Link mágico, sin contraseña
    auth/callback/         Intercambio del código por sesión (PKCE)
    (app)/mis-tareas/      Cola propia y capacidad
    (app)/equipo/          Padrón del equipo (solo supervisor)
    (app)/cuenta/          Nombre, presencia, cerrar sesión
supabase/
  migrations/              Esquema, funciones, RLS
  tests/                   Arnés de pruebas de RLS
```

### Versiones fijadas

Next.js 16.3.5 · React 19.2.8 · Tailwind 4.x · `@supabase/ssr` 0.12.7 ·
`@supabase/supabase-js` 2.116.0 · TypeScript 5.x · Node 20+

Tres cosas que cambiaron y que invalidan casi todo tutorial que encuentres:

- **`middleware.ts` ya no existe**: se llama `proxy.ts` desde Next.js 16.
- **`@supabase/auth-helpers-nextjs` está deprecado** y su repositorio archivado.
  Lo vigente es `@supabase/ssr`.
- **`tailwind.config.js` ya no existe**: los tokens se declaran con `@theme`
  dentro del CSS (ver `src/app/globals.css`).

---

## Decisiones de diseño

**Una sola fuente de verdad por hecho.** `tasks` lleva el estado vigente
(`status` + `assignee_id`) y `task_events` es el historial append-only. La
especificación original tenía el estado duplicado entre la tarea y su
asignación; eso se desincroniza al primer error de red y deja tareas "activas"
sin dueño, invisibles y no tomables.

**La exclusividad la garantiza la fila, no la aplicación.** Como el asignado es
una columna de la propia tarea, tomar es un solo `UPDATE ... WHERE status =
'available'`. Postgres serializa: el primero afecta 1 fila, el segundo afecta 0.
No hay carrera posible ni hace falta bloqueo explícito. Ya está verificado en
las pruebas, aunque la acción de tomar se construye en la Fase 2.

**Capacidad y presencia son cosas distintas.** La *capacidad* se deriva
contando tareas activas; nunca se guarda un contador, porque sería una segunda
fuente de verdad. La *presencia* (`is_present`) es una declaración manual de la
persona. La especificación las mezclaba y se contradecía.

**RLS sin recursión.** Las políticas preguntan el rol a través de
`is_supervisor()`, una función `SECURITY DEFINER` que se saltea RLS. Si una
política de `tasks` consultara `profiles` directamente y `profiles` tuviera su
propia política, Postgres entraría en recursión infinita y fallaría toda
consulta. Es el error más común de Supabase.

**RLS filtra filas; los triggers protegen columnas.** Un trabajador puede
editar su propia fila de `profiles`, pero un trigger le impide tocar `role` y
`active_task_limit`. Sin eso, "podés editar tu perfil" significa "podés
ascenderte a supervisor".

**Las transiciones de estado van por RPC, no por `UPDATE` desde el cliente.**
El trabajador no tiene política de `UPDATE` sobre `tasks` a propósito: tomar,
cerrar y soltar necesitan validar el límite y escribir el historial en el mismo
paso. Eso se construye en la Fase 2.

**X e Y son configurables.** Los umbrales de rescate viven en `app_settings`,
no en el código, y solo un supervisor los cambia.

---

## Cosas que hay que saber antes de producción

**Vercel plan Hobby corre cron una sola vez por día.** Cualquier expresión más
frecuente falla en el *deploy*, no en tiempo de ejecución. Los avisos de rescate
de la Fase 4 miden horas, así que no son implementables con cron de Vercel
gratis: van por `pg_cron` dentro de Supabase, o se reemplazan por prioridad
efectiva calculada, que no necesita ningún proceso corriendo.

**El plan gratis de Supabase pausa el proyecto tras 7 días de baja actividad.**
En un piloto con poco uso, la aplicación se cae sola. Cualquier request diario
reinicia el contador. Después de 90 días pausado se pierde la restauración de
un clic.

**El login dice si un correo tiene cuenta o no.** Es enumeración de usuarios, a
cambio de que alguien sin cuenta entienda por qué no le llega el enlace en vez
de esperar para siempre. Para una herramienta interna de treinta personas el
canje vale la pena; si el padrón deja de ser interno, hay que cambiarlo por un
mensaje neutro en `src/app/login/actions.ts`.

**La evidencia adjunta no está construida.** La columna `requires_evidence`
existe y se muestra, pero subir archivos quedó fuera del MVP por decisión
explícita. Cuando entre, necesita su propio juego de políticas sobre
`storage.objects`.

---

## Lo que sigue (Fase 2)

1. Funciones RPC `claim_task`, `close_task`, `release_task` en PL/pgSQL, con
   validación del límite de tareas activas dentro de la misma transacción.
2. Pantalla de tareas disponibles, ordenada por prioridad → fecha límite →
   antigüedad.
3. Pantalla de crear tarea (supervisor).
4. Detalle de tarea con las acciones.
5. Mensaje claro cuando alguien llega segundo a la misma tarea.

Criterio para darla por cerrada: dos navegadores abiertos al mismo tiempo no
pueden tomar la misma tarea, y el segundo recibe un mensaje que se entiende.
