-- ──────────────────────────────────────────────────────────────────────────
-- 00023 — Índices que cubren foreign keys sin cobertura.
--
-- Detectado por advisor de Supabase. Las FK sin índice fuerzan a Postgres
-- a hacer seq scan en la tabla referenciada cuando se elimina/actualiza
-- la fila padre, y degradan joins.
--
-- Cuatro FKs sin cobertura:
--   1. parking_sessions.tariff_id     → tariffs(id)     (usado en cobro)
--   2. parking_sessions.monthly_plan_id → monthly_plans(id) (usado en chequeo gratis)
--   3. invoices.payment_id            → payments(id)    (lookup ticket→pago)
--   4. app_settings.updated_by        → auth.users(id)  (audit)
--
-- Todos los índices son parciales (`WHERE col IS NOT NULL`) porque las FK
-- son nullable y la mayoría de filas tendrá NULL.
-- ──────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sessions_tariff
  ON public.parking_sessions (tariff_id)
  WHERE tariff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_monthly_plan
  ON public.parking_sessions (monthly_plan_id)
  WHERE monthly_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_payment
  ON public.invoices (payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_settings_updated_by
  ON public.app_settings (updated_by)
  WHERE updated_by IS NOT NULL;
