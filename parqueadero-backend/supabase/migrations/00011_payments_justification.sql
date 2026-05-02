-- Migration 00011: agregar `justification` a `payments`.
-- Fecha: 2026-05-01
--
-- Motivo: el use case `parking/register-vehicle-exit` (regla 7) exige una
-- justificación cuando el método de pago es `cortesia`, `error` o `mensual`.
-- La justificación se persiste en el registro de pago para auditoría.
-- Antes de esta migración el cliente intentaba escribir la columna y
-- PostgREST respondía 400 (PGRST204) porque no existía en el esquema.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS justification TEXT;

COMMENT ON COLUMN payments.justification IS
  'Razón obligatoria cuando method IN (cortesia, error, mensual). NULL para pagos con cobro.';

-- Recargar el cache de PostgREST para que la columna sea visible de inmediato.
NOTIFY pgrst, 'reload schema';
