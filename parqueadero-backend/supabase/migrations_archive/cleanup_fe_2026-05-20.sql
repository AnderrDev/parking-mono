-- cleanup_fe_2026-05-20.sql
-- Script de limpieza de Facturación Electrónica + Siigo en el remoto.
--
-- Aplicar UNA sola vez en el remoto productivo. Pasos:
--   1. DROPs físicos de tablas, columnas y funciones Siigo/DIAN.
--   2. Reset del historial supabase_migrations.schema_migrations
--      alineado con las 21 migrations renumeradas en local.
--
-- Aplicar con:
--   psql "$SUPABASE_DB_URL" -f cleanup_fe_2026-05-20.sql
-- o desde el Studio SQL editor.
--
-- ⚠️ DESTRUCTIVO. Pre-requisitos confirmados (2026-05-20):
--   • 0 facturas en producción.
--   • 0 Edge Functions desplegadas.
--   • Cron siigo-poll-every-30s ya desprogramado.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Drop tablas Siigo (RLS, policies, indexes caen en cascada)
-- ───────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.siigo_invoice_attempts CASCADE;
DROP TABLE IF EXISTS public.siigo_auth_tokens CASCADE;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Drop columnas Siigo + DIAN en invoices
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS siigo_id,
  DROP COLUMN IF EXISTS siigo_number,
  DROP COLUMN IF EXISTS siigo_status,
  DROP COLUMN IF EXISTS siigo_observations,
  DROP COLUMN IF EXISTS siigo_pdf_url,
  DROP COLUMN IF EXISTS siigo_xml_url,
  DROP COLUMN IF EXISTS siigo_qr_url,
  DROP COLUMN IF EXISTS siigo_cufe,
  DROP COLUMN IF EXISTS siigo_cude,
  DROP COLUMN IF EXISTS siigo_attempts,
  DROP COLUMN IF EXISTS siigo_last_attempt_at,
  DROP COLUMN IF EXISTS siigo_last_error,
  DROP COLUMN IF EXISTS dian_status,
  DROP COLUMN IF EXISTS dian_cufe,
  DROP COLUMN IF EXISTS dian_xml_url,
  DROP COLUMN IF EXISTS dian_pdf_url,
  DROP COLUMN IF EXISTS cufe;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Drop columnas Siigo en customers
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.customers
  DROP COLUMN IF EXISTS siigo_synced_at,
  DROP COLUMN IF EXISTS siigo_customer_id,
  DROP COLUMN IF EXISTS siigo_sync_error;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Drop funciones Siigo/DIAN helper
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.sync_dian_from_siigo() CASCADE;
DROP FUNCTION IF EXISTS public.siigo_attempts_prevent_mutation() CASCADE;
DROP FUNCTION IF EXISTS public.siigo_record_attempt(uuid, text, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.siigo_get_active_token() CASCADE;
DROP FUNCTION IF EXISTS public.get_invoices_for_polling(integer) CASCADE;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Reset historial schema_migrations alineado con las 21 renumeradas
--    en local (parqueadero-backend/supabase/migrations/).
-- ───────────────────────────────────────────────────────────────────────────
TRUNCATE supabase_migrations.schema_migrations;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('00001', 'extensions_and_helpers',     ARRAY[]::text[]),
  ('00002', 'initial_schema',             ARRAY[]::text[]),
  ('00003', 'rls_policies',               ARRAY[]::text[]),
  ('00004', 'triggers',                   ARRAY[]::text[]),
  ('00005', 'auth_jwt_hook',              ARRAY[]::text[]),
  ('00006', 'schema_additions',           ARRAY[]::text[]),
  ('00007', 'invoicing_sequence',         ARRAY[]::text[]),
  ('00008', 'fix_jwt_hook_permissions',   ARRAY[]::text[]),
  ('00009', 'user_role_claim',            ARRAY[]::text[]),
  ('00010', 'cash_withdrawals_and_settings', ARRAY[]::text[]),
  ('00011', 'payments_justification',     ARRAY[]::text[]),
  ('00012', 'audit_log_view',             ARRAY[]::text[]),
  ('00013', 'monthly_tariff_unit',        ARRAY[]::text[]),
  ('00014', 'tax_config_settings',        ARRAY[]::text[]),
  ('00015', 'realtime_publications',      ARRAY[]::text[]),
  ('00016', 'realtime_offline_mirror',    ARRAY[]::text[]),
  ('00017', 'outbox_idempotency',         ARRAY[]::text[]),
  ('00018', 'stale_write_protection',     ARRAY[]::text[]),
  ('00019', 'tariff_tiered_pricing',      ARRAY[]::text[]),
  ('00020', 'tariff_sync_legacy_columns', ARRAY[]::text[]),
  ('00021', 'tariff_tiered_not_null',     ARRAY[]::text[]);

-- ───────────────────────────────────────────────────────────────────────────
-- 6) Validación rápida (no falla si hay drift; solo informa).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name IN ('invoices','customers')
    AND (column_name LIKE 'siigo%' OR column_name LIKE 'dian%' OR column_name='cufe');
  RAISE NOTICE 'Columnas FE residuales en invoices/customers: %', remaining;
END $$;

COMMIT;

-- Después de aplicar este script, el remoto queda alineado con el árbol
-- local: 21 migrations consecutivas (00001–00021) sin rastros de FE/Siigo.
