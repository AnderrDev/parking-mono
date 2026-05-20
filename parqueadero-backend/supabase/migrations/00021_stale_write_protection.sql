-- ──────────────────────────────────────────────────────────────────────────
-- 00021 — Stale-write protection (Fase 8 Sprint 3)
--
-- Rechaza UPDATEs cuyo `updated_at` cliente sea anterior al server (race
-- entre dos pestañas/dispositivos editando el mismo row offline). El
-- cliente lo mapea a `kind='409'` y abre el conflicts-dialog.
--
-- Aplica a las 3 tablas mutables actualizables: parking_sessions, payments,
-- cashier_shifts. `cash_withdrawals` es INSERT-only → sin trigger.
--
-- Orden: el prefijo `aaa_` garantiza ejecución antes del trigger
-- `trg_*_updated_at` (instalado en 00004) que reescribe updated_at = now().
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION check_stale_write()
RETURNS TRIGGER AS $$
BEGIN
  -- Si alguna de las dos versiones no trae updated_at, no podemos comparar:
  -- dejamos pasar (defensivo, no debería suceder porque la columna es NOT NULL).
  IF OLD.updated_at IS NULL OR NEW.updated_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'STALE_WRITE: client updated_at=% < server updated_at=%',
      NEW.updated_at, OLD.updated_at
      USING ERRCODE = 'P0409',
            HINT    = 'reload row and retry';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_stale_write IS
  'Fase 8 Sprint 3 — rechaza UPDATE con updated_at desfasado (P0409).';

CREATE TRIGGER aaa_check_stale_write_parking_sessions
  BEFORE UPDATE ON parking_sessions
  FOR EACH ROW EXECUTE FUNCTION check_stale_write();

CREATE TRIGGER aaa_check_stale_write_payments
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION check_stale_write();

CREATE TRIGGER aaa_check_stale_write_cashier_shifts
  BEFORE UPDATE ON cashier_shifts
  FOR EACH ROW EXECUTE FUNCTION check_stale_write();

COMMIT;
