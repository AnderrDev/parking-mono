-- Migration 00014: pg_cron + pg_net para invocar la EF siigo-poll-status cada 30s.
-- Spec: specs/edge-functions/siigo-poll-status.spec.md §"Cron job"
--
-- ⚠️ Setup post-deploy (manual, una vez por entorno — NO commit):
--   ALTER DATABASE postgres SET app.siigo_poll_url = 'https://<ref>.supabase.co/functions/v1/siigo-poll-status';
--   ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';
--   ALTER DATABASE postgres SET app.siigo_poll_max_retries = '30';
--
-- En desarrollo local (supabase start), las URLs y la key apuntan al runtime
-- local; el job se programa pero solo dispara si el `app.siigo_poll_url`
-- existe. Si no se setea, el cron lanza una excepción no-fatal cada tick que
-- queda en cron.job_run_details — es esperado en local sin Siigo configurado.
--
-- ⚠️ Si pg_cron no está disponible en el plan Supabase contratado, este
-- archivo igual aplica las extensiones (no-op) pero el cron.schedule fallará
-- con error claro. Fallback: configurar el job desde Supabase Dashboard →
-- Cron Jobs (mismo URL, misma frecuencia).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Si ya existe (re-aplicación local), des-programar antes de re-programar.
DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'siigo-poll-every-30s';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END
$$;

SELECT cron.schedule(
  'siigo-poll-every-30s',
  '30 seconds',
  $$
    SELECT net.http_post(
      url := current_setting('app.siigo_poll_url', true),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    )
    WHERE current_setting('app.siigo_poll_url', true) IS NOT NULL
      AND current_setting('app.siigo_poll_url', true) <> '';
  $$
);

COMMIT;
