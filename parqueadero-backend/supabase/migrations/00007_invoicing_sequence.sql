-- Migration 00007: secuencia de facturas + columnas adicionales invoicing
-- Fecha: 2026-04-29

-- ─────────────────────────────────────────────────────────────
-- 1. Columnas adicionales en invoices
-- ─────────────────────────────────────────────────────────────

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES parking_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_session ON invoices (session_id) WHERE _deleted = FALSE;

-- ─────────────────────────────────────────────────────────────
-- 2. Secuencia para numeración de facturas (server-side only)
-- ─────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS invoices_number_seq START 1 INCREMENT 1 NO CYCLE;

-- Función RPC para que la Edge Function obtenga el siguiente valor
CREATE OR REPLACE FUNCTION nextval_invoices()
  RETURNS BIGINT
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT nextval('invoices_number_seq');
$$;

REVOKE ALL ON FUNCTION nextval_invoices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nextval_invoices() TO service_role;
