-- Migration 00032: correcciones operativas por cualquier usuario autenticado.
--
-- Permite corregir errores comunes mientras la operación sigue abierta:
-- - Tipo de vehículo de una sesión activa.
-- - Saldo inicial de la caja abierta.
--
-- Se expone vía RPC SECURITY DEFINER para no entregar UPDATE amplio sobre
-- parking_sessions, vehicles o cashier_shifts.

BEGIN;

DROP POLICY IF EXISTS sessions_authenticated_read_active ON public.parking_sessions;
CREATE POLICY sessions_authenticated_read_active ON public.parking_sessions
  FOR SELECT
  USING (
    (auth.jwt() ->> 'user_role') IN ('admin', 'operador', 'contador')
    AND status = 'active'
    AND _deleted = FALSE
  );

CREATE OR REPLACE FUNCTION public.correct_active_session_vehicle_type(
  p_session_id UUID,
  p_vehicle_type TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := (auth.jwt() ->> 'user_role');
  v_session public.parking_sessions%ROWTYPE;
  v_tariff public.tariffs%ROWTYPE;
BEGIN
  IF v_role NOT IN ('admin', 'operador', 'contador') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_vehicle_type NOT IN ('carro', 'moto', 'bicicleta', 'otro') THEN
    RAISE EXCEPTION 'invalid_vehicle_type' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session
  FROM public.parking_sessions
  WHERE id = p_session_id
    AND status = 'active'
    AND _deleted = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.monthly_plan_id IS NULL THEN
    SELECT * INTO v_tariff
    FROM public.tariffs
    WHERE vehicle_type = p_vehicle_type
      AND is_active = TRUE
      AND unit <> 'mensualidad'
      AND _deleted = FALSE
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'active_tariff_not_found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.parking_sessions
    SET vehicle_type = p_vehicle_type,
        tariff_id = v_tariff.id,
        tariff_snapshot_name = v_tariff.name,
        tariff_snapshot_per_minute_cents = v_tariff.per_minute_cents,
        tariff_snapshot_per_hour_cents = v_tariff.per_hour_cents,
        tariff_snapshot_plena_cents = v_tariff.plena_cents,
        updated_at = now()
    WHERE id = p_session_id
    RETURNING * INTO v_session;
  ELSE
    UPDATE public.parking_sessions
    SET vehicle_type = p_vehicle_type,
        updated_at = now()
    WHERE id = p_session_id
    RETURNING * INTO v_session;
  END IF;

  UPDATE public.vehicles
  SET type = p_vehicle_type,
      updated_at = now()
  WHERE plate = v_session.vehicle_plate
    AND _deleted = FALSE;

  RETURN to_jsonb(v_session);
END
$$;

CREATE OR REPLACE FUNCTION public.correct_open_cashier_shift_opening_balance(
  p_shift_id UUID,
  p_opening_balance_cents BIGINT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := (auth.jwt() ->> 'user_role');
  v_shift public.cashier_shifts%ROWTYPE;
BEGIN
  IF v_role NOT IN ('admin', 'operador', 'contador') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_opening_balance_cents < 0 THEN
    RAISE EXCEPTION 'invalid_opening_balance' USING ERRCODE = '22023';
  END IF;

  UPDATE public.cashier_shifts
  SET opening_balance_cents = p_opening_balance_cents,
      updated_at = now()
  WHERE id = p_shift_id
    AND status = 'open'
    AND _deleted = FALSE
  RETURNING * INTO v_shift;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open_shift_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN to_jsonb(v_shift);
END
$$;

CREATE OR REPLACE FUNCTION public.correct_shift_payment_method(
  p_payment_id UUID,
  p_method TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := (auth.jwt() ->> 'user_role');
  v_payment public.payments%ROWTYPE;
BEGIN
  IF v_role NOT IN ('admin', 'operador', 'contador') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_method NOT IN ('efectivo', 'tarjeta_credito', 'tarjeta_debito', 'transferencia', 'nequi', 'daviplata') THEN
    RAISE EXCEPTION 'invalid_payment_method' USING ERRCODE = '22023';
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
  SET method = p_method,
      updated_at = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  RETURN to_jsonb(v_payment);
END
$$;

REVOKE ALL ON FUNCTION public.correct_active_session_vehicle_type(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_active_session_vehicle_type(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.correct_open_cashier_shift_opening_balance(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_open_cashier_shift_opening_balance(UUID, BIGINT) TO authenticated;

REVOKE ALL ON FUNCTION public.correct_shift_payment_method(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_shift_payment_method(UUID, TEXT) TO authenticated;

COMMIT;
