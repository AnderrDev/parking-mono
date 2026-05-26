-- ──────────────────────────────────────────────────────────────────────────
-- 00025 — RPC atómica: crear plan mensual + registrar pago.
--
-- Problema anterior: el use case create-monthly-plan hacía 2 roundtrips:
-- INSERT monthly_plans + INSERT payments. Si el segundo fallaba, quedaba
-- un plan sin pago registrado en caja.
--
-- Esta función valida no-solapamiento de fechas para la misma placa antes
-- de insertar el plan, y luego inserta el payment. Todo en una sola tx.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_monthly_plan_with_payment(
  p_customer_id          UUID,
  p_vehicle_plate        TEXT,
  p_plan_type            TEXT,
  p_start_date           DATE,
  p_end_date             DATE,
  p_amount_cents         BIGINT,
  p_shift_id             UUID,
  p_payment_method       TEXT,
  p_auto_renew           BOOLEAN DEFAULT false,
  p_client_op_id_plan    UUID DEFAULT NULL,
  p_client_op_id_payment UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_plan     monthly_plans%ROWTYPE;
  v_payment  payments%ROWTYPE;
  v_plate    TEXT := upper(trim(p_vehicle_plate));
BEGIN
  -- 1) Validaciones básicas
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = 'P0001';
  END IF;

  IF p_plan_type NOT IN ('basico','premium','ilimitado') THEN
    RAISE EXCEPTION 'invalid_plan_type' USING ERRCODE = 'P0001';
  END IF;

  -- 2) No-solapamiento por placa
  IF EXISTS (
    SELECT 1 FROM monthly_plans
    WHERE vehicle_plate = v_plate
      AND _deleted = false
      AND status IN ('active','expiring')
      AND daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'plan_overlap' USING ERRCODE = 'P0001';
  END IF;

  -- 3) INSERT plan (idempotente vía client_op_id si se pasa)
  IF p_client_op_id_plan IS NOT NULL THEN
    -- Para monthly_plans NO hay columna client_op_id; usamos la combinación
    -- (customer_id, vehicle_plate, start_date, end_date) como clave natural
    -- de idempotencia. Si ya existe activo idéntico, lo retornamos.
    SELECT * INTO v_plan
    FROM monthly_plans
    WHERE customer_id = p_customer_id
      AND vehicle_plate = v_plate
      AND start_date = p_start_date
      AND end_date = p_end_date
      AND status IN ('active','expiring')
      AND _deleted = false
    LIMIT 1;
  END IF;

  IF NOT FOUND OR v_plan.id IS NULL THEN
    INSERT INTO monthly_plans (
      customer_id, vehicle_plate, plan_type,
      start_date, end_date, amount_cents,
      status, auto_renew
    )
    VALUES (
      p_customer_id, v_plate, p_plan_type,
      p_start_date, p_end_date, p_amount_cents,
      'active', p_auto_renew
    )
    RETURNING * INTO v_plan;
  END IF;

  -- 4) INSERT payment (idempotente vía client_op_id si se pasa)
  IF p_client_op_id_payment IS NOT NULL THEN
    SELECT * INTO v_payment
    FROM payments
    WHERE client_op_id = p_client_op_id_payment;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'plan', to_jsonb(v_plan),
        'payment', to_jsonb(v_payment),
        'idempotent', true
      );
    END IF;
  END IF;

  INSERT INTO payments (
    cashier_shift_id, method, amount_cents,
    status, paid_at, client_op_id
  )
  VALUES (
    p_shift_id, p_payment_method, p_amount_cents,
    'completed', now(), p_client_op_id_payment
  )
  RETURNING * INTO v_payment;

  RETURN jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'payment', to_jsonb(v_payment),
    'idempotent', false
  );
END
$$;

COMMENT ON FUNCTION public.create_monthly_plan_with_payment IS
  'Crea plan mensual + registra payment en una sola tx. Valida no-solapamiento por placa.';

REVOKE ALL ON FUNCTION public.create_monthly_plan_with_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_monthly_plan_with_payment
  TO authenticated;
