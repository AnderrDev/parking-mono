-- Migration 00006: columnas faltantes + vistas de reportes
-- Fecha: 2026-04-29

-- ─────────────────────────────────────────────────────────────
-- 1. Columnas faltantes
-- ─────────────────────────────────────────────────────────────

ALTER TABLE cashier_shifts
  ADD COLUMN IF NOT EXISTS justification TEXT;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES parking_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_session ON payments (session_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Vista base de ingresos (nivel pago)
--    Usada por v_revenue_daily y el reporte de ingresos por período
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_revenue_daily AS
SELECT
  p.id                                                       AS payment_id,
  p.paid_at,
  DATE(p.paid_at AT TIME ZONE 'America/Bogota')              AS day,
  p.method,
  p.amount_cents,
  p.status,
  CASE WHEN p.method IN ('cortesia', 'error', 'mensual')
       THEN 0 ELSE p.amount_cents END                        AS revenue_cents,
  p.cashier_shift_id,
  cs.user_id                                                 AS operator_id,
  u.nombre                                                   AS operator_name,
  p.session_id,
  ps.vehicle_type
FROM payments p
JOIN cashier_shifts cs ON p.cashier_shift_id = cs.id
JOIN users u           ON cs.user_id = u.id
LEFT JOIN parking_sessions ps ON p.session_id = ps.id
WHERE p._deleted = FALSE
  AND p.status   = 'completed'
  AND cs._deleted = FALSE;

-- ─────────────────────────────────────────────────────────────
-- 3. Vista sesiones por tipo de vehículo
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_sessions_by_type AS
SELECT
  ps.id                                                                    AS session_id,
  ps.vehicle_type,
  ps.entry_at,
  ps.exit_at,
  EXTRACT(EPOCH FROM (ps.exit_at - ps.entry_at)) / 60                     AS duration_minutes,
  DATE(ps.entry_at AT TIME ZONE 'America/Bogota')                          AS day,
  p.cashier_shift_id,
  cs.user_id                                                               AS operator_id,
  u.nombre                                                                 AS operator_name,
  COALESCE(p.amount_cents, 0)                                              AS amount_cents,
  COALESCE(
    CASE WHEN p.method NOT IN ('cortesia', 'error', 'mensual')
         THEN p.amount_cents ELSE 0 END, 0
  )                                                                        AS revenue_cents,
  p.method                                                                 AS payment_method
FROM parking_sessions ps
LEFT JOIN payments p        ON p.session_id = ps.id
                           AND p.status = 'completed'
                           AND p._deleted = FALSE
LEFT JOIN cashier_shifts cs ON p.cashier_shift_id = cs.id
LEFT JOIN users u           ON cs.user_id = u.id
WHERE ps._deleted = FALSE
  AND ps.status  = 'completed';

-- ─────────────────────────────────────────────────────────────
-- 4. Vista rendimiento por operador (nivel turno)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_operator_performance AS
SELECT
  cs.id                                                                          AS shift_id,
  cs.user_id                                                                     AS operator_id,
  u.nombre                                                                       AS operator_name,
  cs.opened_at,
  cs.closed_at,
  cs.status                                                                      AS shift_status,
  cs.opening_balance_cents,
  cs.closing_balance_cents,
  cs.expected_balance_cents,
  cs.difference_cents,
  EXTRACT(EPOCH FROM (COALESCE(cs.closed_at, now()) - cs.opened_at)) / 3600     AS hours_worked,
  COUNT(DISTINCT ps.id)                                                          AS sessions_attended,
  COALESCE(
    SUM(p.amount_cents) FILTER (WHERE p.method NOT IN ('cortesia', 'error', 'mensual')), 0
  )                                                                              AS revenue_cents
FROM cashier_shifts cs
JOIN users u ON cs.user_id = u.id
LEFT JOIN payments p          ON p.cashier_shift_id  = cs.id
                             AND p.status = 'completed'
                             AND p._deleted = FALSE
LEFT JOIN parking_sessions ps ON ps.id = p.session_id AND ps._deleted = FALSE
WHERE cs._deleted = FALSE
GROUP BY
  cs.id, cs.user_id, u.nombre,
  cs.opened_at, cs.closed_at, cs.status,
  cs.opening_balance_cents, cs.closing_balance_cents,
  cs.expected_balance_cents, cs.difference_cents;
