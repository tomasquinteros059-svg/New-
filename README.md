# Relevo

Cola de trabajo con capacidad. Administra una fila de tareas, sabe quién tiene
lugar disponible y entrega trabajo a quien está libre. La gente también puede
tomar tareas por su cuenta.

No es un ERP, no es un chat, no es un gestor de proyectos.

---

## Estado: Fases 1 y 2 completas

| Fase | Contenido | Estado |
|---|---|---|
| **1 — Base** | Proyecto, base de datos con RLS, autenticación, entrar y salir | ✅ |
| **2 — Cola** | Crear, listar por prioridad, tomar, cerrar | ✅ |
| 3 — Capacidad | Panel de carga del equipo, asignación directa | pendiente |
| 4 — Control | Soltar con motivo, evidencia, avisos de rescate | pendiente |

**Criterio de la Fase 1**: dos usuarios distintos pueden iniciar sesión y cada
uno ve solo lo suyo. → pruebas 20 a 24 de `01_rls_tests.sql`.

**Criterio de la Fase 2**: dos navegadores abiertos al mismo tiempo no pueden
tomar la misma tarea, y el segundo recibe un mensaje claro. → prueba A de
`03_concurrency.sh`, con procesos y transacciones de verdad.

En total, `npm run test:db` corre **58 afirmaciones más 3 pruebas de
concurrencia real**. El límite de tareas activas también está probado bajo
concurrencia: seis pedidos simultáneos de la misma persona con tope 3 dejan
exactamente 3.

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
| `npm run test:db` | Pruebas de RLS, de tomar/cerrar y de concurrencia real |

`npm run test:db` levanta un Postgres efímero, emula lo mínimo de Supabase
(roles `anon`/`authenticated`/`service_role`, esquema `auth`, `auth.uid()`),
y corre cada juego de pruebas contra una base recién creada:

| Archivo | Qué prueba |
|---|---|
| `01_rls_tests.sql` | 31 afirmaciones sobre las políticas de seguridad |
| `02_rpc_tests.sql` | 27 afirmaciones sobre tomar y cerrar |
| `03_concurrency.sh` | Carreras reales: procesos y transacciones simultáneas |

No toca tu proyecto de Supabase y no necesita Docker. Requiere `postgresql-16`.

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
    tz.ts                  Hora de pared -> UTC, con horario de verano
    tasks/actions.ts       Tomar, cerrar y crear (Server Actions)
  app/
    login/                 Link mágico, sin contraseña
    auth/callback/         Intercambio del código por sesión (PKCE)
    (app)/mis-tareas/      Cola propia y capacidad
    (app)/disponibles/     La cola, ordenada por prioridad
    (app)/tarea/[id]/      Detalle, con tomar y cerrar
    (app)/tarea/nueva/     Crear tarea (solo supervisor)
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
El trabajador no tiene política de `UPDATE` sobre `tasks` a propósito: tomar y
cerrar validan el límite y escriben el historial en el mismo paso, dentro de
una transacción. Ver `claim_task` y `close_task` en la migración 0004.

**El límite de tareas activas se protege bloqueando el perfil, no contando.**
`claim_task` toma un `for update` sobre la fila del perfil antes de contar. Sin
ese bloqueo, seis pedidos simultáneos de la misma persona cuentan "0 activas"
los seis, pasan el límite los seis, y la dejan con seis tareas. El orden de
bloqueo es siempre perfil y después tarea, para que dos transacciones no se
traben en espejo.

**Llegar segundo no es un error.** `claim_task` devuelve `{ ok, code }` en vez
de tirar excepción: `already_taken`, `at_limit` y `not_found` son resultados
esperados y cada uno tiene su mensaje. `at_limit` se queda en la pantalla
porque la acción para resolverlo está a un toque; `already_taken` te devuelve a
la cola, ya sin esa tarea.

**La fecha límite se interpreta en la zona de la operación.** El input
`datetime-local` entrega una hora sin zona; leerla con `new Date()` usaría la
del servidor, que en Vercel es UTC, y una fecha escrita a las 18:30 se
guardaría cuatro horas corrida. Ver `src/lib/tz.ts`, que además contempla el
cambio de horario de verano chileno.

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

## Lo que sigue (Fase 3)

1. Panel de carga del equipo: cuántas activas lleva cada uno contra su tope, y
   quién está en turno.
2. Asignación directa del supervisor a una persona (`assign_task`), con el
   límite blando: avisa si se pasa, pero deja.
3. La tarea asignada se muestra distinta de la tomada; el dato ya se guarda
   (`assignment_kind`).

Criterio para darla por cerrada: el supervisor ve de un vistazo quién está
saturado y quién libre.

**Todavía no se puede soltar una tarea.** Está en la Fase 4 junto con el motivo
obligatorio y el historial de soltadas. Hasta entonces, una tarea tomada se
cierra o la cierra el supervisor.
