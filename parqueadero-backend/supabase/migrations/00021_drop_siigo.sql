-- 00021_drop_siigo.sql
-- Limpieza del módulo Siigo (decisión 2026-05-15: negocio será POS normal,
-- sin facturación electrónica). Esta migración elimina tablas, índices,
-- policies, triggers, secuencias y la función pg_cron asociada.
--
-- ⚠️ NO APLICAR todavía sin confirmar. Generada como referencia para una
-- futura sesión de limpieza. El cron job `siigo-poll-every-30s` ya fue
-- eliminado del remoto vía `SELECT cron.unschedule(...)` el 2026-05-15.
--
-- Para aplicar: `supabase db push --linked` con OK explícito.

BEGIN;

-- 1) Desprogramar el cron por si quedó algún rastro.
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'siigo-poll-every-30s';
  IF FOUND THEN
    PERFORM cron.unschedule(jid);
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- pg_cron no instalado; nada que hacer.
  NULL;
END $$;

-- 2) Eliminar tablas Siigo. Las RLS policies, triggers e índices se eliminan
--    en cascada con la tabla.
DROP TABLE IF EXISTS public.siigo_invoice_attempts CASCADE;
DROP TABLE IF EXISTS public.siigo_auth_tokens CASCADE;

-- 3) Si quedó alguna función helper específica de Siigo, dropearla.
--    (Las funciones genéricas como custom_access_token_hook permanecen.)
DROP FUNCTION IF EXISTS public.siigo_record_attempt(uuid, text, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.siigo_get_active_token() CASCADE;

-- 4) Columnas en invoices que referencian Siigo (si existen).
--    Estas columnas pueden estar en uso por reportes; preservar si dudas.
ALTER TABLE public.invoices DROP COLUMN IF EXISTS siigo_invoice_id;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS siigo_cufe;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS siigo_status;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS siigo_last_attempt_at;

COMMIT;
