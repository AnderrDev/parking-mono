-- Migration 00010: tablas para retiros parciales de efectivo (HU-039)
-- y configuración del sistema (HU-066, HU-067, HU-068).
-- Fecha: 2026-04-30

-- ─────────────────────────────────────────────────────────────
-- 1. cash_withdrawals (retiros parciales durante un turno)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_withdrawals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id        UUID NOT NULL REFERENCES cashier_shifts(id) ON DELETE RESTRICT,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
  recipient       TEXT NOT NULL,
  justification   TEXT NOT NULL,
  withdrawn_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  _deleted        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_shift ON cash_withdrawals (shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_user  ON cash_withdrawals (user_id);

COMMENT ON TABLE cash_withdrawals IS 'Retiros parciales de efectivo durante un turno (HU-039). Reducen el efectivo esperado al cierre.';

-- RLS: el operador puede insertar/leer SOLO sus propios retiros del turno actual.
-- Admin/contador pueden leer todos.
ALTER TABLE cash_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_cash_withdrawals_select ON cash_withdrawals;
CREATE POLICY p_cash_withdrawals_select ON cash_withdrawals
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (auth.jwt() ->> 'user_role') IN ('admin', 'contador')
  );

DROP POLICY IF EXISTS p_cash_withdrawals_insert ON cash_withdrawals;
CREATE POLICY p_cash_withdrawals_insert ON cash_withdrawals
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM cashier_shifts s
      WHERE s.id = shift_id
        AND s.user_id = auth.uid()
        AND s.status = 'open'
        AND s._deleted = FALSE
    )
  );

DROP POLICY IF EXISTS p_cash_withdrawals_update ON cash_withdrawals;
CREATE POLICY p_cash_withdrawals_update ON cash_withdrawals
  FOR UPDATE
  USING ((auth.jwt() ->> 'user_role') = 'admin');

-- Audit: registrar inserts en audit_log
DROP TRIGGER IF EXISTS trg_cash_withdrawals_audit ON cash_withdrawals;
CREATE TRIGGER trg_cash_withdrawals_audit
  AFTER INSERT OR UPDATE ON cash_withdrawals
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

-- ─────────────────────────────────────────────────────────────
-- 2. app_settings (configuración del sistema)
--    HU-066 datos del parqueadero, HU-067 facturación, HU-068 operativos.
--    Modelo simple key/value JSONB. Solo admin escribe.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key          TEXT PRIMARY KEY,
  value        JSONB NOT NULL DEFAULT '{}'::jsonb,
  description  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE app_settings IS 'Configuración del sistema. Modelo key/value JSONB. Solo admin escribe.';

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_app_settings_select ON app_settings;
CREATE POLICY p_app_settings_select ON app_settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS p_app_settings_write ON app_settings;
CREATE POLICY p_app_settings_write ON app_settings
  FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

-- Audit: write_audit_log() asume NEW.id (UUID). app_settings usa key (TEXT)
-- como PK, así que el trigger genérico no aplica. Los cambios quedan
-- registrados via updated_by + updated_at (consultable desde la página
-- de auditoría con un join manual si fuera necesario).

-- Valores por defecto
INSERT INTO app_settings (key, value, description) VALUES
  (
    'parking_info',
    '{"name": "Parqueadero Demo", "nit": "", "dv": "", "address": "", "municipio": "", "departamento": "", "phone": "", "email": ""}'::jsonb,
    'Datos generales del parqueadero (HU-066)'
  ),
  (
    'invoicing_config',
    '{"prefix": "FAC", "resolution": "", "technical_key": "", "contingency_prefix": "FC", "software_id": "", "software_pin": ""}'::jsonb,
    'Parámetros de facturación electrónica DIAN (HU-067) — campos sensibles deberían cifrarse'
  ),
  (
    'operational_config',
    '{"cash_cap_cents": 50000000, "monthly_grace_days": 3, "max_courtesies_per_shift": 3, "admin_email": "", "enabled_payment_methods": ["efectivo","tarjeta_credito","tarjeta_debito","transferencia","nequi","daviplata"]}'::jsonb,
    'Parámetros operativos (HU-068)'
  )
ON CONFLICT (key) DO NOTHING;
