-- 00020_outbox_idempotency.sql
-- Fase 8 - Sprint 2: idempotencia para outbox cliente.
--
-- Añade client_op_id UUID UNIQUE (parcial) en las 4 tablas mutables offline.
-- El cliente genera el UUID v4 al encolar y lo viaja en cada reintento; si el
-- row ya existe, el INSERT remoto produce un 23505 que el drain reconoce como
-- SUCCESS idempotente (no como conflicto real).
--
-- También extiende la publicación supabase_realtime para que el orquestador
-- reciba deltas de payments / cashier_shifts / cash_withdrawals (parking_sessions
-- e invoices ya estaban en 00018; tariffs/monthly_plans/customers/vehicles/
-- app_settings en 00019).
--
-- _sync_status: parking_sessions y payments ya lo tenían en 00002. Se añade en
-- cashier_shifts y cash_withdrawals por consistencia (defensivo, no usado en
-- server-side logic).

BEGIN;

-- 1) client_op_id UUID NULLABLE — filas existentes (Sprint 0/1) quedan NULL.
ALTER TABLE parking_sessions  ADD COLUMN IF NOT EXISTS client_op_id UUID;
ALTER TABLE payments          ADD COLUMN IF NOT EXISTS client_op_id UUID;
ALTER TABLE cashier_shifts    ADD COLUMN IF NOT EXISTS client_op_id UUID;
ALTER TABLE cash_withdrawals  ADD COLUMN IF NOT EXISTS client_op_id UUID;

-- UNIQUE PARCIAL: solo aplica cuando client_op_id IS NOT NULL. Permite que las
-- filas históricas queden NULL sin colisionar; las nuevas mutaciones offline
-- siempre lo mandan.
CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_sessions_client_op_id
  ON parking_sessions (client_op_id) WHERE client_op_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_client_op_id
  ON payments (client_op_id) WHERE client_op_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cashier_shifts_client_op_id
  ON cashier_shifts (client_op_id) WHERE client_op_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_withdrawals_client_op_id
  ON cash_withdrawals (client_op_id) WHERE client_op_id IS NOT NULL;

-- 2) _sync_status en cashier_shifts y cash_withdrawals (parking_sessions y
--    payments ya lo tenían en 00002).
ALTER TABLE cashier_shifts
  ADD COLUMN IF NOT EXISTS _sync_status TEXT NOT NULL DEFAULT 'synced'
  CHECK (_sync_status IN ('synced', 'pending', 'conflict'));
ALTER TABLE cash_withdrawals
  ADD COLUMN IF NOT EXISTS _sync_status TEXT NOT NULL DEFAULT 'synced'
  CHECK (_sync_status IN ('synced', 'pending', 'conflict'));

-- 3) REPLICA IDENTITY FULL + publicación supabase_realtime para las 3 tablas
--    que faltan. parking_sessions ya estaba en 00018.
ALTER TABLE payments         REPLICA IDENTITY FULL;
ALTER TABLE cashier_shifts   REPLICA IDENTITY FULL;
ALTER TABLE cash_withdrawals REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE payments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cashier_shifts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cash_withdrawals;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN parking_sessions.client_op_id IS
  'UUID v4 generado por el cliente offline (Fase 8). Garantiza idempotencia: reintentos del mismo INSERT producen un 23505 sobre uq_*_client_op_id que el cliente trata como éxito.';
COMMENT ON COLUMN payments.client_op_id         IS 'Idem parking_sessions.client_op_id.';
COMMENT ON COLUMN cashier_shifts.client_op_id   IS 'Idem parking_sessions.client_op_id.';
COMMENT ON COLUMN cash_withdrawals.client_op_id IS 'Idem parking_sessions.client_op_id.';

COMMIT;
