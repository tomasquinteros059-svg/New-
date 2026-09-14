# Prueba manual contra el Supabase real

Todo lo que se pudo automatizar está en `npm test`. Esta lista cubre lo que
**no se puede probar sin un proyecto de Supabase de verdad**: el navegador
hablando con Storage, el canal de tiempo real, y el correo saliendo.

Hacela una vez, después de los pasos de instalación del README. Tarda unos
veinte minutos y es la diferencia entre "compila" y "anda".

---

## Antes de empezar

- Dos cuentas creadas: una supervisora y una trabajadora.
- Dos dispositivos, o un teléfono y un navegador en modo incógnito.
- Los siete pasos del README hechos, incluido el de `pg_cron`.

---

## 1 · Entrar (2 min)

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 1.1 | Pedir el enlace con un correo **que no tiene cuenta** | Dice que no tiene cuenta y que se la pida al supervisor. No manda nada |
| 1.2 | Pedir el enlace con tu correo | Llega el correo. El enlace abre la app ya adentro |
| 1.3 | Abrir un enlace ya usado, o esperar más de una hora | Vuelve al login diciendo que venció |
| 1.4 | Entrar con la cuenta trabajadora | La navegación muestra **dos** destinos, no cuatro |

> Si acá aparece una pantalla de error de redirecciones, la cuenta se creó antes
> de aplicar las migraciones. La app debería autocurarse sola; si no, pedí el
> enlace de nuevo.

## 2 · Tiempo real — es lo más importante de esta lista (5 min)

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 2.1 | Abrir **Disponibles** en los dos dispositivos, uno al lado del otro | Los dos ven la misma cola |
| 2.2 | Desde el supervisor, crear una tarea | Aparece en el otro dispositivo **sin tocar nada**, en menos de un segundo |
| 2.3 | Desde el trabajador, tomarla | Le desaparece de la cola al supervisor, solo |
| 2.4 | Crear seis tareas seguidas, rápido | La lista se actualiza una vez, no seis veces parpadeando |

**Si 2.2 no pasa**, el tiempo real no está conectando. No es grave: hay un
respaldo que refresca cada 30 segundos. Esperá medio minuto — si ahí aparece,
el respaldo está haciendo su trabajo y lo que falla es el canal. Revisá que
Realtime esté habilitado en el proyecto y que `tasks` esté en la publicación:

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

## 3 · La carrera por la misma tarea (3 min)

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 3.1 | Abrir **la misma tarea** en los dos dispositivos | Los dos ven el botón "Tomar esta tarea" |
| 3.2 | Tocar "Tomar" en los dos, lo más simultáneo posible | Uno entra. El otro vuelve a la cola diciendo que **la tomó otra persona** |
| 3.3 | Repetirlo pero cancelando la tarea desde el supervisor en el medio | El mensaje dice **cancelada**, no "la tomó otra persona" |

## 4 · Evidencia — la otra pieza sin probar (5 min)

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 4.1 | Crear una tarea con **Pedir evidencia** activado, y tomarla | En el detalle aparece el botón "Sacar foto o elegir archivo" |
| 4.2 | Intentar cerrarla sin subir nada | No deja. Dice que hay que subir una foto o un archivo |
| 4.3 | Sacar una foto con el teléfono | Sube y aparece la miniatura |
| 4.4 | Cerrarla con nota | Cierra. La foto sigue visible en la tarea cerrada |
| 4.5 | Desde el otro trabajador, abrir esa tarea | No la ve: no es suya |
| 4.6 | Intentar subir un archivo de más de 25 MB | Lo rechaza antes de subir |

> **Lo que hay que mirar con atención en 4.3**: una foto de iPhone puede venir en
> formato HEIC. El bucket lo acepta, pero el navegador puede no mostrar la
> miniatura. Si pasa, la evidencia igual quedó guardada.

## 5 · Soltar, reasignar y rescatar (5 min)

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 5.1 | Desde el trabajador, "No puedo con esta" y soltar con motivo | Vuelve a la cola. Aparece en **Control → Soltadas recientes** con el motivo |
| 5.2 | Desde el supervisor, en una tarea activa: "Pasarle esta tarea a otro" | Se la pasa sin volver a la cola. **No** aparece en Soltadas |
| 5.3 | En **Ajustes**, bajar X a 1 hora | Guarda |
| 5.4 | Esperar a que corra el barrido (hasta 15 min) | Aparece el contador en **Control** y la tarea sale marcada "Estancada", primera en la cola |
| 5.5 | Volver a subir X a 12 y esperar otro barrido | El aviso desaparece solo |

Para no esperar el barrido, en Control está el botón **Revisar ahora**. Si los
avisos *solo* aparecen con ese botón, `pg_cron` no está andando:

```sql
select jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details
order by start_time desc limit 5;
```

## 6 · Resumen diario por correo (opcional, 3 min)

Solo si cargaste `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` y las de Resend.

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 6.1 | `curl -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/cron/resumen` | Devuelve JSON con `ok: true` y el resumen |
| 6.2 | Mismo pedido **sin** el encabezado | Devuelve 401 |
| 6.3 | Revisar la casilla de `RESUMEN_TO` | Llegó el correo con el asunto "Relevo · <fecha>" |

Si `envio.motivo` dice `sin-configurar`, falta alguna de las tres variables de
Resend. El resumen igual sale en la respuesta y en los registros de Vercel.

## 7 · Que nadie vea lo que no le toca (3 min)

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 7.1 | Desde el trabajador, escribir a mano `/equipo` en la barra de direcciones | Rebota a Mis tareas |
| 7.2 | Lo mismo con `/ajustes` y `/control` | Rebotan igual |
| 7.3 | Copiar el enlace de una tarea activa de otra persona y abrirlo desde el trabajador | Dice que la tarea ya no está |

El punto 7.3 es el más importante de todos: **no se defiende con la interfaz,
se defiende con Row Level Security**. Si ahí se ve la tarea, hay un problema
serio y conviene frenar.

---

## Si algo falla

Anotá el número del paso, qué esperabas y qué pasó. Los errores del lado de la
base de datos salen en Supabase → Logs; los del lado de la aplicación, en Vercel
→ Logs.
