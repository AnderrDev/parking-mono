-- 00027_session_tariff_snapshot.sql
--
-- Snapshot inline de la tarifa al ingreso de cada sesión de parking.
-- Antes (pre-2026-05-25): `parking_sessions.tariff_id` apuntaba a la fila
-- de tariffs, pero esa fila puede editarse después → el historial mostraría
-- valores actuales, no los que se aplicaron al cobrar. El cobro real
-- (`amount_due_cents` + `payments.amount_cents`) ya está congelado, pero
-- el desglose visible mentiría.
--
-- Solución estándar de POS/facturación: congelar los 4 valores de tarifa
-- al momento de crear la sesión. Estas columnas son inmutables una vez
-- escritas (no hay UPDATE trigger porque la lógica vive en el cliente
-- — solo se setean en el INSERT inicial).
--
-- Las columnas quedan NULL para:
--   - sesiones mensuales (monthly_plan_id != null) — el plan cubre el cobro.
--   - sesiones legacy creadas antes de este fix. La UI cae al fallback de
--     tarifa activa por vehicle_type (snapshot < snapshot_id < activa_por_tipo).

ALTER TABLE parking_sessions
  ADD COLUMN tariff_snapshot_name              TEXT,
  ADD COLUMN tariff_snapshot_per_minute_cents  BIGINT,
  ADD COLUMN tariff_snapshot_per_hour_cents    BIGINT,
  ADD COLUMN tariff_snapshot_plena_cents       BIGINT;

COMMENT ON COLUMN parking_sessions.tariff_snapshot_name IS
  'Snapshot del nombre de la tarifa al momento del ingreso. Inmutable post-INSERT.';
COMMENT ON COLUMN parking_sessions.tariff_snapshot_per_minute_cents IS
  'Snapshot de per_minute_cents al ingreso. Inmutable.';
COMMENT ON COLUMN parking_sessions.tariff_snapshot_per_hour_cents IS
  'Snapshot de per_hour_cents al ingreso. Inmutable.';
COMMENT ON COLUMN parking_sessions.tariff_snapshot_plena_cents IS
  'Snapshot de plena_cents al ingreso. Inmutable.';
