-- Migration 00033: desglose por método de pago en el cierre de caja
-- Fecha: 2026-07-08
-- Spec: parqueadero-web/specs/features/cashier/close-shift.spec.md
--
-- El cierre de turno solo cuadraba efectivo; el recaudo digital
-- (transferencia, nequi, daviplata, tarjetas) quedaba invisible tras el
-- cierre. Estas columnas persisten el snapshot del desglose para que el
-- historial y la auditoría distingan efectivo vs digital sin reconstruir
-- los pagos del turno.
--
-- Nullable a propósito: turnos cerrados antes de esta migración quedan en
-- NULL ("sin desglose"), distinto de $0. NULL en digital_verified_cents
-- significa "el operador no verificó las cuentas", no "verificó $0".

ALTER TABLE public.cashier_shifts
  ADD COLUMN IF NOT EXISTS cash_collected_cents BIGINT,
  ADD COLUMN IF NOT EXISTS digital_collected_cents BIGINT,
  ADD COLUMN IF NOT EXISTS digital_verified_cents BIGINT,
  ADD COLUMN IF NOT EXISTS totals_by_method JSONB;

COMMENT ON COLUMN public.cashier_shifts.cash_collected_cents IS
  'Σ pagos completed método efectivo al momento del cierre (centavos COP)';
COMMENT ON COLUMN public.cashier_shifts.digital_collected_cents IS
  'Σ pagos completed métodos digitales (transferencia/nequi/daviplata/tarjetas) al cierre';
COMMENT ON COLUMN public.cashier_shifts.digital_verified_cents IS
  'Total digital que el operador verificó en apps/cuentas al cierre; NULL = no verificado';
COMMENT ON COLUMN public.cashier_shifts.totals_by_method IS
  'Snapshot [{method, count, amount_cents}] de pagos completed al cierre';

-- Montos no negativos cuando existen (no aplica a NULL).
ALTER TABLE public.cashier_shifts
  ADD CONSTRAINT chk_shift_breakdown_non_negative CHECK (
    (cash_collected_cents IS NULL OR cash_collected_cents >= 0)
    AND (digital_collected_cents IS NULL OR digital_collected_cents >= 0)
    AND (digital_verified_cents IS NULL OR digital_verified_cents >= 0)
  );
