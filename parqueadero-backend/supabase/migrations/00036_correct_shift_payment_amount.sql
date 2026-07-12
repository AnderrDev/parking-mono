-- Migration 00036: corrección de MONTO de un pago del turno abierto.
-- Fecha: 2026-07-11
-- Spec: parqueadero-web/specs/features/cashier/correct-shift-payment.spec.md
--
-- Gap detectado el 2026-07-11 (caso OCK216): el cobro real ($26.000) difería
-- del calculado por la app ($36.000) y no había forma de corregir el monto —
-- solo el método (00032) o anular (00028). Hubo que corregir por SQL directo.
--
-- Mismo patrón que correct_shift_payment_method: SECURITY DEFINER, editable
-- solo mientras la caja siga abierta, cualquier rol operativo, auditoría vía
-- triggers. A diferencia del método, exige motivo (>= 10 chars) porque altera
-- totales de caja, y sincroniza parking_sessions.amount_due_cents.

BEGIN;

CREATE OR REPLACE FUNCTION public.correct_shift_payment_amount(
  p_payment_id UUID,
  p_amount_cents BIGINT,
  p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := (auth.jwt() ->> 'user_role');
  v_reason TEXT := NULLIF(btrim(p_reason), '');
  v_payment public.payments%ROWTYPE;
BEGIN
  IF v_role NOT IN ('admin', 'operador', 'contador') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  IF v_reason IS NULL OR length(v_reason) < 10 THEN
    RAISE EXCEPTION 'correction_reason_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.* INTO v_payment
  FROM public.payments p
  JOIN public.cashier_shifts s ON s.id = p.cashier_shift_id
  WHERE p.id = p_payment_id
    AND p.status = 'completed'
    AND p.amount_cents > 0
    AND p._deleted = FALSE
    AND s.status = 'open'
    AND s._deleted = FALSE
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'editable_payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.payments
  SET amount_cents = p_amount_cents,
      justification = v_reason,
      updated_at = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  -- Coherencia sesión↔pago: el monto adeudado de la sesión refleja lo cobrado.
  IF v_payment.session_id IS NOT NULL THEN
    UPDATE public.parking_sessions
    SET amount_due_cents = p_amount_cents,
        updated_at = now()
    WHERE id = v_payment.session_id
      AND _deleted = FALSE;
  END IF;

  RETURN to_jsonb(v_payment);
END
$$;

COMMENT ON FUNCTION public.correct_shift_payment_amount IS
  'Corrige el monto de un pago completado del turno abierto (motivo obligatorio >= 10 chars) y sincroniza amount_due_cents de la sesión. SECURITY DEFINER; auditado por triggers.';

REVOKE ALL ON FUNCTION public.correct_shift_payment_amount(UUID, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_shift_payment_amount(UUID, BIGINT, TEXT) TO authenticated;

COMMIT;
