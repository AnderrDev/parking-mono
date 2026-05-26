-- 00018_realtime_publications.sql
-- Habilita Supabase Realtime para parking_sessions e invoices.
--
-- parking_sessions: operator-dashboard muestra entradas/salidas en vivo
-- (otro operador del mismo turno).
-- invoices: dashboard / listado refresca cuando se emite un ticket interno.
--
-- REPLICA IDENTITY FULL: necesario para que Realtime emita la fila completa
-- (no solo PK) cuando hay UPDATE — útil para diff en cliente y RLS row-level.
--
-- Idempotente: ADD TABLE falla silencioso si ya está; usamos DO bloque para
-- ignorar duplicado.

ALTER TABLE parking_sessions REPLICA IDENTITY FULL;
ALTER TABLE invoices         REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE parking_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE parking_sessions IS
  'Sesiones de parqueo. RLS por user_id/turno. Publicada en supabase_realtime para dashboard live.';

COMMENT ON TABLE invoices IS
  'Tickets POS internos numerados. Publicada en supabase_realtime para refresco de UI.';
