-- 00018_realtime_publications.sql
-- Habilita Supabase Realtime para parking_sessions e invoices.
--
-- Contexto: las specs de Fase 11 (S6/S7) asumen que el frontend recibe
-- eventos Realtime para refrescar siigo_status sin polling. La spec
-- siigo-status-realtime.spec.md menciona observeInvoiceStatus(id) en el
-- datasource. Sin ALTER PUBLICATION explícito, los UPDATE no se emiten.
--
-- También parking_sessions: el operator-dashboard puede mostrar entradas
-- y salidas en vivo (otro operador del mismo turno).
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
  'Facturas (tickets POS + FE Siigo). dian_status derivado de siigo_status via trigger. Publicada en supabase_realtime para refresco de UI tras polling.';
