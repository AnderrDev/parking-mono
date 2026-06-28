-- 00028 — Anulación operativa de pagos/sesiones del turno.
--
-- Caso de uso: el cajero se equivoca en una salida o pago. La anulación debe
-- sacar el pago del cuadre y, si viene de parqueadero, marcar la sesión como
-- cancelada para que el historial sea coherente.

CREATE OR REPLACE FUNCTION public.void_shift_payment(
  p_payment_id UUID,
  p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_session parking_sessions%ROWTYPE;
  v_role TEXT;
  v_reason TEXT := NULLIF(btrim(p_reason), '');
BEGIN
  IF v_reason IS NULL OR length(v_reason) < 10 THEN
    RAISE EXCEPTION 'void_reason_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT role INTO v_role
  FROM public.users
  WHERE id = auth.uid()
    AND is_active = true;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'user_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
    AND _deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_payment.status = 'refunded' THEN
    RETURN jsonb_build_object(
      'payment', to_jsonb(v_payment),
      'session', NULL,
      'idempotent', true
    );
  END IF;

  IF v_role = 'operador' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.cashier_shifts cs
      WHERE cs.id = v_payment.cashier_shift_id
        AND cs.user_id = auth.uid()
        AND cs.status = 'open'
    ) THEN
      RAISE EXCEPTION 'payment_not_in_open_shift' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'user_not_allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.payments
  SET status = 'refunded',
      justification = concat_ws(
        E'\n',
        NULLIF(justification, ''),
        'ANULADO: ' || v_reason
      ),
      updated_at = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  IF v_payment.session_id IS NOT NULL THEN
    UPDATE public.parking_sessions
    SET status = 'cancelled',
        updated_at = now()
    WHERE id = v_payment.session_id
      AND _deleted = false
    RETURNING * INTO v_session;
  END IF;

  INSERT INTO public.audit_log (
    user_id, action, entity_type, entity_id, before_json, after_json
  )
  VALUES (
    auth.uid(),
    'UPDATE',
    'payments',
    p_payment_id,
    jsonb_build_object('status', 'completed'),
    jsonb_build_object(
      'status', 'refunded',
      'reason', v_reason,
      'session_id', v_payment.session_id
    )
  );

  RETURN jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'session', CASE WHEN v_session.id IS NULL THEN NULL ELSE to_jsonb(v_session) END,
    'idempotent', false
  );
END
$$;

COMMENT ON FUNCTION public.void_shift_payment IS
  'Anula un pago del turno abierto del operador o cualquier pago para admin. Marca pago refunded y sesión asociada cancelled.';

REVOKE ALL ON FUNCTION public.void_shift_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_shift_payment TO authenticated;
