-- ──────────────────────────────────────────────────────────────────────────
-- 00044 — Anular y cancelar una mensualidad cierran el círculo.
--
-- Hallazgo de la auditoría 2026-08-11. Plan e ingreso se creaban juntos
-- (00040) pero se deshacían por separado, y en ambos sentidos quedaba a
-- medias:
--
--   · Anular el pago (`void_shift_payment`) sacaba la plata del cuadre pero
--     NO tocaba el plan: la placa conservaba su mensualidad vigente y seguía
--     entrando y saliendo gratis 30 días sin haber pagado.
--   · Cancelar el plan hacía soft-delete y NO tocaba el pago: el ingreso
--     seguía contando en la caja aunque el servicio ya no se preste.
--
-- Se resuelven los dos sentidos:
--
--   1. `void_shift_payment` ahora cancela también el plan asociado, que se
--      identifica por `gateway_ref = 'monthly_plan:<id>'` (no hay FK entre
--      `payments` y `monthly_plans`).
--   2. `cancel_monthly_plan` es nueva y hace lo simétrico.
--
-- Regla para la plata al cancelar, que es la parte delicada: el pago se
-- anula SOLO si el turno donde entró sigue abierto. Si ese turno ya se
-- cerró, el cuadre de ese día ya se firmó y contaba ese ingreso; tocarlo
-- retroactivamente descuadraría un cierre pasado. En ese caso el plan se
-- cancela igual y la función avisa con `payment_kept_closed_shift` para que
-- la UI le diga a quien opera que la devolución hay que hacerla aparte.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- =========================================================================
-- 1) Anular el pago de una mensualidad cancela el plan
-- =========================================================================
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
  v_plan    monthly_plans%ROWTYPE;
  v_plan_id UUID;
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
      'plan', NULL,
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

  -- Si el pago era la venta de una mensualidad, el plan cae con él: sin
  -- pago no hay plan, o la placa parquearía gratis sin haber pagado.
  v_plan_id := NULLIF(split_part(coalesce(v_payment.gateway_ref, ''), 'monthly_plan:', 2), '')::uuid;
  IF v_plan_id IS NOT NULL THEN
    UPDATE public.monthly_plans
    SET status = 'cancelled',
        _deleted = true,
        updated_at = now()
    WHERE id = v_plan_id
      AND _deleted = false
    RETURNING * INTO v_plan;
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
      'session_id', v_payment.session_id,
      'monthly_plan_id', v_plan_id
    )
  );

  RETURN jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'session', to_jsonb(v_session),
    'plan', to_jsonb(v_plan),
    'idempotent', false
  );
END
$$;

-- =========================================================================
-- 2) Cancelar el plan anula su ingreso (si el turno sigue abierto)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.cancel_monthly_plan(
  p_plan_id UUID,
  p_reason  TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan     monthly_plans%ROWTYPE;
  v_payment  payments%ROWTYPE;
  v_role     TEXT;
  v_reason   TEXT := coalesce(NULLIF(btrim(p_reason), ''), 'Plan mensual cancelado');
  v_refunded BOOLEAN := false;
  v_kept     BOOLEAN := false;
BEGIN
  SELECT role INTO v_role
  FROM public.users
  WHERE id = auth.uid() AND is_active = true;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'operador') THEN
    RAISE EXCEPTION 'user_not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_plan
  FROM public.monthly_plans
  WHERE id = p_plan_id AND _deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_plan.status IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION 'plan_not_cancellable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.monthly_plans
  SET status = 'cancelled', _deleted = true, updated_at = now()
  WHERE id = p_plan_id
  RETURNING * INTO v_plan;

  -- El ingreso de la venta, si sigue vivo.
  SELECT * INTO v_payment
  FROM public.payments
  WHERE gateway_ref = 'monthly_plan:' || p_plan_id
    AND _deleted = false
    AND status = 'completed'
  FOR UPDATE;

  IF FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.cashier_shifts cs
      WHERE cs.id = v_payment.cashier_shift_id AND cs.status = 'open'
    ) THEN
      UPDATE public.payments
      SET status = 'refunded',
          justification = concat_ws(E'\n', NULLIF(justification, ''), 'ANULADO: ' || v_reason),
          updated_at = now()
      WHERE id = v_payment.id
      RETURNING * INTO v_payment;
      v_refunded := true;
    ELSE
      -- Turno ya cerrado: no se toca un cuadre firmado.
      v_kept := true;
    END IF;
  END IF;

  INSERT INTO public.audit_log (
    user_id, action, entity_type, entity_id, before_json, after_json
  )
  VALUES (
    auth.uid(), 'UPDATE', 'monthly_plans', p_plan_id,
    jsonb_build_object('status', 'active'),
    jsonb_build_object(
      'status', 'cancelled',
      'reason', v_reason,
      'payment_refunded', v_refunded,
      'payment_kept_closed_shift', v_kept
    )
  );

  RETURN jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'payment_refunded', v_refunded,
    'payment_kept_closed_shift', v_kept
  );
END
$$;

COMMENT ON FUNCTION public.cancel_monthly_plan IS
  'Cancela un plan mensual y anula su ingreso si el turno donde entró sigue abierto. Si el turno ya cerró devuelve payment_kept_closed_shift=true y la devolución se maneja aparte.';

REVOKE ALL ON FUNCTION public.cancel_monthly_plan FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_monthly_plan TO authenticated;

COMMIT;
