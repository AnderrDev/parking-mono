-- ──────────────────────────────────────────────────────────────────────────
-- 00024 — RPC atómica: cerrar sesión + registrar pago en una transacción.
--
-- Problema anterior: el web hacía UPDATE parking_sessions + INSERT payments
-- en dos roundtrips. Si el segundo fallaba, la sesión quedaba marcada como
-- `completed` sin payment asociado — discrepancia imposible de detectar
-- desde el cliente.
--
-- Esta RPC corre los dos en una sola tx. SECURITY INVOKER: respeta RLS,
-- así que un operador solo puede cerrar sesiones/insertar pagos en su turno.
--
-- Idempotencia: cliente puede pasar `p_client_op_id_session` y `p_client_op_id_payment`
-- (UUIDs únicos por operación). Si el INSERT duplica, retorna la fila previa
-- en lugar de fallar.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.register_vehicle_exit_with_payment(
  p_session_id           UUID,
  p_amount_cents         BIGINT,
  p_method               TEXT,
  p_shift_id             UUID,
  p_justification        TEXT DEFAULT NULL,
  p_client_op_id_session UUID DEFAULT NULL,
  p_client_op_id_payment UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_session     parking_sessions%ROWTYPE;
  v_payment     payments%ROWTYPE;
BEGIN
  -- 1) Validar sesión activa
  SELECT * INTO v_session
  FROM parking_sessions
  WHERE id = p_session_id
    AND _deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION 'session_not_active' USING ERRCODE = 'P0001';
  END IF;

  -- 2) UPDATE sesión → completed
  UPDATE parking_sessions
  SET status            = 'completed',
      exit_at           = now(),
      exit_user_id      = auth.uid(),
      amount_due_cents  = p_amount_cents,
      updated_at        = now(),
      client_op_id      = COALESCE(client_op_id, p_client_op_id_session)
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  -- 3) INSERT payment (idempotente vía client_op_id si se pasa)
  IF p_client_op_id_payment IS NOT NULL THEN
    -- ¿Ya existe?
    SELECT * INTO v_payment
    FROM payments
    WHERE client_op_id = p_client_op_id_payment;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'session', to_jsonb(v_session),
        'payment', to_jsonb(v_payment),
        'idempotent', true
      );
    END IF;
  END IF;

  INSERT INTO payments (
    session_id, cashier_shift_id, method, amount_cents,
    justification, status, paid_at, client_op_id
  )
  VALUES (
    p_session_id, p_shift_id, p_method, p_amount_cents,
    p_justification, 'completed', now(), p_client_op_id_payment
  )
  RETURNING * INTO v_payment;

  RETURN jsonb_build_object(
    'session', to_jsonb(v_session),
    'payment', to_jsonb(v_payment),
    'idempotent', false
  );
END
$$;

COMMENT ON FUNCTION public.register_vehicle_exit_with_payment IS
  'Cierra sesión de parking + registra payment en una sola tx. SECURITY INVOKER (respeta RLS).';

-- Solo authenticated puede llamarla
REVOKE ALL ON FUNCTION public.register_vehicle_exit_with_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_vehicle_exit_with_payment
  TO authenticated;
