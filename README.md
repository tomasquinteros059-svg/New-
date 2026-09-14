# Relevo

Cola de trabajo con capacidad. Administra una fila de tareas, sabe quién tiene
lugar disponible y entrega trabajo a quien está libre. La gente también puede
tomar tareas por su cuenta.

No es un ERP, no es un chat, no es un gestor de proyectos.

---

## Estado: las cuatro fases completas

| Fase | Contenido | Estado |
|---|---|---|
| **1 — Base** | Proyecto, base de datos con RLS, autenticación, entrar y salir | ✅ |
| **2 — Cola** | Crear, listar por prioridad, tomar, cerrar | ✅ |
| **3 — Capacidad** | Panel de carga del equipo, asignación directa | ✅ |
| **4 — Control** | Soltar con motivo, evidencia, avisos de rescate | ✅ |

**Criterio de la Fase 1**: dos usuarios distintos pueden iniciar sesión y cada
uno ve solo lo suyo. → pruebas 20 a 24 de `01_rls_tests.sql`.

**Criterio de la Fase 2**: dos navegadores abiertos al mismo tiempo no pueden
tomar la misma tarea, y el segundo recibe un mensaje claro. → prueba A de
`03_concurrency.sh`, con procesos y transacciones de verdad.

**Criterio de la Fase 3**: el supervisor ve de un vistazo quién está saturado y
quién libre. → los tres números del resumen en `/equipo`, sobre `team_load()`.

**Criterio de la Fase 4**: una tarea abandonada genera aviso sola, sin que nadie
la toque. → pruebas 32 a 37 de `05_phase4_tests.sql`, donde se envejece una
tarea sin que nadie interactúe y el barrido crea el aviso.

`npm test` corre todo: typecheck, lint, **12 pruebas de funciones puras** y
**290 afirmaciones sobre la base más 5 pruebas de concurrencia real**, incluido
un escenario de punta a punta que recorre un día completo de operación.

Lo que no se puede automatizar sin un proyecto de Supabase real está en
[`docs/prueba-manual.md`](docs/prueba-manual.md): veinte minutos de lista, una
sola vez. El límite de tareas activas está probado bajo concurrencia
(seis pedidos simultáneos de la misma persona con tope 3 dejan exactamente 3), y
también la carrera entre tomar y asignar sobre la misma tarea.

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

> **El orden importa.** Las cuentas se crean DESPUÉS de aplicar las migraciones.
> El trigger que arma el perfil se instala en el paso 2; una cuenta creada antes
> queda sin perfil. La aplicación ahora se autocura si eso pasa
> (`ensure_profile()`), pero es más limpio no provocarlo.

Las cuentas se crean desde **Authentication → Users → Add user**. El trigger
`on_auth_user_created` arma el perfil automáticamente, siempre con rol
`worker` — incluso si alguien manipula la metadata del registro.

El primer supervisor se promueve una sola vez, desde el SQL Editor:

```sql
update public.profiles
set role = 'supervisor'
where id = (select id from auth.users where email = 'ana@tuempresa.cl');
```

Para promover a alguien más, o para cambiarle el tope de tareas, hoy hay que
usar el mismo `update` desde el SQL Editor: **todavía no hay pantalla para
eso**. Las reglas ya están (un supervisor puede hacerlo, un trabajador no, y no
podés quedarte sin ningún supervisor); lo que falta es la interfaz.

> Una vez adentro, el resto se maneja desde la aplicación: el rol y el tope de
> cada persona se cambian tocando su nombre en **Equipo**, y los umbrales X e Y
> en **Control → Cambiar los umbrales**.

### 5. Programar el barrido de rescate

En el SQL Editor, pegá y ejecutá `supabase/scheduled/pg_cron.sql`. Programa el
barrido cada 15 minutos **dentro de la base de datos**.

Sin este paso, la aplicación funciona igual pero los avisos de rescate no
aparecen solos: el supervisor los tiene que pedir con el botón "Revisar ahora"
de la pantalla Control. Si ése es el único modo en que aparecen avisos, el cron
no está andando.

No va con las migraciones porque `create extension pg_cron` necesita permisos
que un Postgres local no tiene, y rompería `npm run test:db`.

### 6. Variables de entorno

```bash
cp .env.example .env.local
```

Completá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### 7. Resumen diario por correo (opcional)

Si querés que el supervisor se entere sin abrir la app, en Vercel →
Settings → Environment Variables cargá `CRON_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY` y las tres de Resend (ver `.env.example`).
`vercel.json` ya programa la corrida diaria.

Sin esto la aplicación funciona igual: los avisos siguen apareciendo dentro de
la app, con su contador en la navegación.

### 8. Levantar

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
| `npm test` | Todo lo de abajo, en orden |
| `npm run test:unit` | Zona horaria y armado del correo (sin red ni base) |
| `npm run test:db` | Pruebas de la base y de concurrencia real |

`npm run test:db` levanta un Postgres efímero, emula lo mínimo de Supabase
(roles `anon`/`authenticated`/`service_role`, esquema `auth`, `auth.uid()`),
y corre cada juego de pruebas contra una base recién creada:

| Archivo | Qué prueba |
|---|---|
| `01_rls_tests.sql` | 31 afirmaciones sobre las políticas de seguridad |
| `02_rpc_tests.sql` | 27 afirmaciones sobre tomar y cerrar |
| `04_assign_tests.sql` | 31 afirmaciones sobre asignar y la carga del equipo |
| `05_phase4_tests.sql` | 66 afirmaciones sobre soltar, evidencia, Storage y rescate |
| `06_qa_regression.sql` | 14 afirmaciones sobre los defectos encontrados en el QA |
| `07_e2e_scenario.sql` | Un día completo de operación, 48 pasos verificados |
| `08_edit_cancel_tests.sql` | 32 afirmaciones sobre editar, cancelar y la publicación |
| `09_reassign_search_digest.sql` | 41 afirmaciones sobre reasignar, buscar y el resumen |
| `03_concurrency.sh` | Cinco carreras reales: procesos y transacciones simultáneas |

`07_e2e_scenario.sql` narra lo que va pasando mientras verifica. Correrlo es la
forma más rápida de entender cómo funciona la aplicación sin leer el código.

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
    (app)/tarea/[id]/asignar/  Elegir a quién dársela (solo supervisor)
    (app)/control/         Rescate y soltadas (solo supervisor)
    (app)/ajustes/         Umbrales X e Y (solo supervisor)
    (app)/equipo/[id]/     Rol y tope de una persona (solo supervisor)
    (app)/tarea/[id]/editar/   Editar y cancelar (solo supervisor)
    api/cron/resumen/      Resumen diario por correo (lo llama Vercel Cron)
  lib/email/               Armado del correo (puro) y envío (un proveedor)
docs/prueba-manual.md      Lo que hay que probar a mano contra Supabase
    (app)/tarea/nueva/     Crear tarea (solo supervisor)
    (app)/equipo/          Padrón del equipo (solo supervisor)
    (app)/cuenta/          Nombre, presencia, cerrar sesión
supabase/
  migrations/              Esquema, funciones, RLS
  scheduled/pg_cron.sql    Programar el barrido (se corre UNA vez, a mano)
  tests/                   Arnés de pruebas
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

**Nadie edita `tasks` con un UPDATE directo, ni siquiera el supervisor.** El
privilegio está revocado para el rol `authenticated` entero. Todo cambio pasa
por una función que escribe su evento, así que el historial no tiene agujeros.
Antes había una política amplia de supervisor que la aplicación no usaba y que
permitía cambiar una tarea por la API sin dejar rastro.

**El tiempo real tiene respaldo.** Si el canal no conecta —Realtime apagado, la
red del galpón, un proxy que corta WebSockets— cae a refrescar cada 30
segundos. Importa más de lo que parece: sin respaldo, un tiempo real que falla
es PEOR que no tenerlo, porque nadie se entera de que la lista dejó de
actualizarse.

**El resumen diario se arma en un lado y se envía en otro.** `renderDigest()`
recibe datos y devuelve texto: no sabe de correo, de red ni de proveedores, así
que se puede probar sin ninguno de los tres. Cambiar de proveedor toca una sola
función de veinte líneas.

**`/api` queda fuera del proxy de sesión.** Esas rutas no tienen sesión de
navegador y se autentican solas. Cuando estaban dentro, la ruta del resumen
recibía un 307 al login y la tarea programada no corría nunca, sin un solo
error a la vista.

**El buscador no usa comodines.** Busca por posición de texto y no con
`ILIKE '%...%'`: un `%` o un `_` tipeado por alguien actuaría como comodín y
devolvería resultados que no pidió.

**Reasignar no es soltar y volver a asignar.** La tarea pasa directo de una
persona a la otra sin tocar la cola, así que nadie puede tomarla en el medio. Y
NO se registra como soltada: ponerla en el historial de soltadas sería decir
algo que no pasó.

**El tiempo real no trae datos, solo avisa.** El cliente escucha los cambios de
`tasks` y le pide a Next que vuelva a renderizar en el servidor. La pantalla
sigue saliendo de una sola consulta con RLS aplicada, y no hay dos caminos por
los que pueda llegar un dato distinto. Los eventos se agrupan con un retardo
corto: si el supervisor carga seis tareas seguidas, es un refresco y no seis. Si
el tiempo real no está disponible, la aplicación funciona como antes.

**El motivo por el que una tarea dejó de estar disponible viaja en la
respuesta.** `claim_task` devuelve `already_taken` tanto si alguien la tomó como
si el supervisor la canceló, pero incluye el estado. Sin usarlo, la app le
diría «la tomó otra persona» a quien toca Tomar en una tarea cancelada.

**El aviso de rescate tiene que existir aunque nadie mire.** Por eso hay una
tabla `alerts` y un barrido que la llena, en vez de calcular los avisos cuando
alguien abre la pantalla. El barrido es idempotente (correrlo diez veces deja lo
mismo que correrlo una) y borra los avisos que dejaron de aplicar: la tabla es
la foto de lo que pasa ahora, no un registro histórico. El historial ya vive en
`task_events`.

**El barrido corre con pg_cron, no con el cron de Vercel.** El plan Hobby de
Vercel corre cron una vez por día, y los umbrales se miden en horas. pg_cron
corre dentro de la base cada 15 minutos, sin HTTP y sin que la `service_role`
key ande dando vueltas por variables de entorno.

**La escalada de prioridad no pisa la prioridad.** La especificación pedía que
una tarea vieja "suba automáticamente de prioridad". Hacerlo con un `UPDATE`
perdería para siempre lo que decidió el supervisor, y una tarea que se toma y se
suelta en círculo escalaría hasta 'alta' y se quedaría ahí. En vez de eso,
`available_queue()` la pone primera en la lista y la marca "Estancada". Mismo
efecto para quien mira, reversible, y sin ningún proceso corriendo.

**El bucket de evidencia es privado.** Una foto de una avería puede mostrar una
instalación, una patente o la cara de alguien. Se sirve con URLs firmadas de
cinco minutos, y el permiso sale de la ruta: el primer segmento es el id de la
tarea, y escribe quien tiene esa tarea activa. Un cast defensivo
(`public.safe_uuid`) evita que una carpeta con nombre raro haga fallar la
política — una política que revienta es una política que bloquea todo.

**Subir evidencia son dos pasos y pueden romperse en el medio.** Si el archivo
sube pero el registro falla, el archivo queda huérfano y NO cuenta como
evidencia: la verdad es la fila en `task_evidence`. Es el lado seguro para
fallar; al revés se podrían cerrar tareas con evidencia que no está.

**Soltar está detrás de un paso extra.** El botón dice "No puedo con esta" y
recién ahí aparece el campo del motivo. Si estuviera al lado de "Cerrar", se
tocaría por error y el historial se llenaría de motivos vacíos.

**El tope es duro para tomar y blando para asignar.** `claim_task` rebota con
`at_limit`; `assign_task` entra igual y devuelve `over_limit` con los números.
Tomar es una decisión de la persona y el sistema puede frenarla; asignar es una
orden, y el sistema no le discute una orden al supervisor: le muestra el costo
antes y se lo confirma después. La misma asimetría vale para la presencia: se
puede asignar a alguien fuera de turno, y la app lo dice.

**La carga del equipo se cuenta, no se guarda.** `team_load()` deriva el número
de tareas activas de cada persona con un `left join` agregado. No hay contador
en `profiles`: sería una segunda fuente de verdad. El índice parcial
`tasks_active_by_assignee_idx` hace que contar salga gratis con decenas de
personas.

**La barra de carga sabe dibujar más tareas que el tope.** Como asignar puede
pasarse, alguien con tope 3 puede tener 4. Los segmentos por encima del tope van
en rojo. Si la barra se recortara al tope, el panel escondería justo el caso que
hay que mirar.

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

## Defectos encontrados en el QA y ya corregidos

Un QA de las cuatro fases juntas encontró cuatro cosas que las pruebas por fase
no veían. Las cuatro están arregladas y tienen prueba de regresión en
`06_qa_regression.sql`.

1. **Un correo con una sola letra antes de la arroba rompía el alta de usuario
   entera.** `profiles.full_name` exige 2 caracteres y el trigger derivaba el
   nombre de la parte local del correo sin mirar el largo: `a@empresa.cl`
   producía `'a'`, violaba el CHECK, y como el trigger es AFTER INSERT la
   excepción hacía fallar el INSERT en `auth.users`. El error no mencionaba el
   nombre por ningún lado.

2. **La evidencia se heredaba entre asignaciones.** Alguien tomaba una tarea que
   pide evidencia, subía la foto y la soltaba; el siguiente la tomaba y la
   cerraba sin subir nada, porque el chequeo solo miraba si la TAREA tenía
   alguna evidencia. Ahora cuenta solo lo cargado desde que empezó la asignación
   actual. La anterior no se borra y se muestra marcada "de un intento
   anterior".

3. **Quien subía evidencia dejaba de verla al soltar la tarea.** El permiso
   salía solo de ser el asignado actual, y al soltar `assignee_id` queda en
   null.

4. **Una sesión válida sin perfil dejaba la app en un bucle de
   redirecciones.** El DAL mandaba a `/login`, el proxy veía la sesión y
   rebotaba a `/mis-tareas`, que volvía a `/login`. Pasaba de verdad si la
   cuenta se creaba antes de aplicar las migraciones. Ahora `ensure_profile()`
   repara el perfil solo, y si aun así no se puede, `/auth/salir` corta la
   sesión en vez de girar en el vacío.

## Lo que NO está hecho

**Nada se probó contra un Supabase real.** Toda la lógica vive en Postgres y
está probada contra Postgres 16, incluidas las políticas de Storage sobre un
`storage.objects` emulado. Lo que no se pudo verificar sin un proyecto real es
la subida de archivos de punta a punta: el navegador hablando con Storage. Es la
primera cosa que hay que probar a mano.

**El aviso llega solo hasta la app, no hasta el teléfono.** El barrido genera el
aviso sin que nadie toque nada, y el contador aparece en la navegación. Pero si
el supervisor no abre la aplicación, no se entera. Un correo diario de resumen
es el siguiente paso natural y entra justo en el cron gratis de Vercel, que
corre una vez por día. Necesita una cuenta de envío de correo, así que es una
decisión tuya, no mía.

**No se pueden cancelar tareas desde la aplicación.** El estado `cancelled`
existe en el modelo y el supervisor puede editar tareas, pero no hay pantalla
para cancelar. Nadie lo pidió todavía.

**Las habilidades siguen fuera.** Fue una decisión explícita al empezar: una
cola única funciona, y las etiquetas se agregan después sin romper nada.

**No hay modo oscuro.** La paleta está definida para luz alta, que es la
condición de uso esperada.

**Tres cosas están escritas pero no probadas contra Supabase**: la subida de
archivos, la conexión de tiempo real y el envío del correo. Las tres tienen su
propia sección en [`docs/prueba-manual.md`](docs/prueba-manual.md). Las tres
degradan sin romper nada: sin Storage no se cierra lo que pide evidencia, sin
tiempo real la lista se refresca cada 30 segundos, y sin correo el resumen
queda en los registros de Vercel.

**No hay paginación de verdad en la cola**, hay un tope de 100 filas con el
total a la vista y un buscador. Para treinta personas alcanza; para tres mil
tareas abiertas, no.

**No hay notificaciones push.** El correo diario es lo más lejos que llega un
aviso hoy.
