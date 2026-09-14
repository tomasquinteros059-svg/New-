-- =============================================================================
-- Programar el barrido de rescate
--
-- ESTO SE EJECUTA UNA SOLA VEZ, A MANO, en el SQL Editor de Supabase.
-- No va con las migraciones porque `create extension pg_cron` necesita
-- permisos que un Postgres local no tiene, y rompería `npm run test:db`.
--
-- Por qué pg_cron y no el cron de Vercel:
--   * El plan Hobby de Vercel corre cron UNA VEZ POR DÍA. Cualquier expresión
--     más frecuente falla en el deploy, no en ejecución. Con umbrales medidos
--     en horas, un barrido diario llega tarde casi siempre.
--   * pg_cron corre dentro de la base de datos: sin HTTP, sin la service_role
--     key dando vueltas por variables de entorno, y sin ese límite.
-- =============================================================================

create extension if not exists pg_cron with schema extensions;

-- Cada 15 minutos. El barrido es idempotente y barato: dos INSERT con
-- ON CONFLICT DO NOTHING y un DELETE, todos sobre índices.
select cron.schedule(
  'rescate-tareas-estancadas',
  '*/15 * * * *',
  $$ select public.sweep_stale_tasks(); $$
);

-- Para ver que quedó programado:
--   select jobid, jobname, schedule, active from cron.job;
--
-- Para ver las últimas corridas:
--   select jobid, status, return_message, start_time
--   from cron.job_run_details
--   order by start_time desc
--   limit 20;
--
-- Para cambiar la frecuencia:
--   select cron.alter_job(
--     (select jobid from cron.job where jobname = 'rescate-tareas-estancadas'),
--     schedule => '*/5 * * * *'
--   );
--
-- Para apagarlo:
--   select cron.unschedule('rescate-tareas-estancadas');
--
-- OJO: los umbrales X e Y NO se tocan acá. Viven en la tabla app_settings y los
-- cambia el supervisor. Esto solo decide cada cuánto se mira.
