-- ──────────────────────────────────────────────────────────────────────────
-- 00040 — Integridad del ciclo de vida de las mensualidades.
--
-- Auditoría 2026-08-11. Tres agujeros que se tapan juntos porque dependen
-- entre sí:
--
--   1. NO había unicidad en BD. "Una placa = una mensualidad vigente" vivía
--      solo en el navegador (`hasActivePlanForPlate`), que consulta y luego
--      inserta: dos ventas simultáneas de la misma placa pasaban ambas.
--      `idx_plans_active_end` es un índice común, no único.
--   2. La venta NO era atómica. El front insertaba el plan y después el
--      payment; si el segundo fallaba, el plan quedaba vendido y la plata
--      nunca entraba a caja. La RPC de 00025 se creó justo para esto y
--      nunca se cableó (y le faltaba el `gateway_ref` que liga pago y plan).
--   3. NADIE marcaba los planes vencidos. Sin un `status='expired'`, un plan
--      viejo bloqueaba la renovación de esa placa para siempre.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- =========================================================================
-- 1) Unicidad real: no dos planes vigentes solapados para la misma placa
-- =========================================================================
-- Un UNIQUE no alcanza: lo que no puede repetirse no es la placa sino el
-- SOLAPAMIENTO de rangos de fechas. Renovar por anticipado (plan de sep
-- vendido en ago, consecutivo y sin solaparse) tiene que seguir siendo
-- posible. Eso es exactamente lo que expresa un EXCLUDE con rangos.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.monthly_plans
  DROP CONSTRAINT IF EXISTS monthly_plans_no_overlap;

ALTER TABLE public.monthly_plans
  ADD CONSTRAINT monthly_plans_no_overlap
  EXCLUDE USING gist (
    vehicle_plate WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (_deleted = false AND status IN ('active', 'expiring'));

COMMENT ON CONSTRAINT monthly_plans_no_overlap ON public.monthly_plans IS
  'Regla de negocio: una placa no puede tener dos mensualidades vigentes con fechas solapadas. Ambos extremos inclusivos.';

-- =========================================================================
-- 2) Venta atómica: plan + payment en una sola transacción
-- =========================================================================
-- Se reemplaza la versión de 00025. Cambios respecto a aquella:
--   · El payment lleva `gateway_ref = 'monthly_plan:<id>'`, que es el único
--     vínculo entre el ingreso y el plan (`payments` no tiene FK al plan).
--   · `status` inicial calculado: 'expiring' si vence dentro de 5 días.
--   · Valida que el turno de caja exista y esté abierto antes de cobrar.
--   · Idempotencia por `client_op_id` del payment: reintentar la misma
--     operación devuelve lo ya creado en vez de duplicar el cobro.
--   · Se quita `p_client_op_id_plan`: su "clave natural" de idempotencia
--     era frágil y ahora el EXCLUDE del punto 1 es la garantía dura.
-- SECURITY INVOKER a propósito: las policies de RLS deben seguir aplicando
-- (el operador puede vender desde 00038; un contador no).
DROP FUNCTION IF EXISTS public.create_monthly_plan_with_payment(
  UUID, TEXT, TEXT, DATE, DATE, BIGINT, UUID, TEXT, BOOLEAN, UUID, UUID
);

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
  p_client_op_id_payment UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_plan    monthly_plans%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_plate   TEXT := upper(trim(p_vehicle_plate));
  v_today   DATE := (now() AT TIME ZONE 'America/Bogota')::date;
  v_status  TEXT;
BEGIN
  -- Idempotencia: si el pago ya se registró, devolver lo existente.
  IF p_client_op_id_payment IS NOT NULL THEN
    SELECT * INTO v_payment FROM payments WHERE client_op_id = p_client_op_id_payment;
    IF FOUND THEN
      SELECT * INTO v_plan FROM monthly_plans
      WHERE id = NULLIF(split_part(coalesce(v_payment.gateway_ref, ''), 'monthly_plan:', 2), '')::uuid;
      RETURN jsonb_build_object(
        'plan', to_jsonb(v_plan), 'payment', to_jsonb(v_payment), 'idempotent', true
      );
    END IF;
  END IF;

  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = 'P0001';
  END IF;

  IF p_end_date < v_today THEN
    RAISE EXCEPTION 'plan_already_expired' USING ERRCODE = 'P0001';
  END IF;

  IF p_plan_type NOT IN ('basico','premium','ilimitado') THEN
    RAISE EXCEPTION 'invalid_plan_type' USING ERRCODE = 'P0001';
  END IF;

  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;

  -- El ingreso tiene que caer en un turno abierto o descuadra la caja.
  IF NOT EXISTS (
    SELECT 1 FROM cashier_shifts
    WHERE id = p_shift_id AND status = 'open' AND _deleted = false
  ) THEN
    RAISE EXCEPTION 'shift_not_open' USING ERRCODE = 'P0001';
  END IF;

  v_status := CASE WHEN (p_end_date - v_today) <= 5 THEN 'expiring' ELSE 'active' END;

  BEGIN
    INSERT INTO monthly_plans (
      customer_id, vehicle_plate, plan_type,
      start_date, end_date, amount_cents, status, auto_renew
    )
    VALUES (
      p_customer_id, v_plate, p_plan_type,
      p_start_date, p_end_date, p_amount_cents, v_status, p_auto_renew
    )
    RETURNING * INTO v_plan;
  EXCEPTION WHEN exclusion_violation THEN
    -- Lo lanza `monthly_plans_no_overlap`. Traducido para que el cliente
    -- muestre un mensaje de negocio y no un error de Postgres.
    RAISE EXCEPTION 'plan_overlap' USING ERRCODE = 'P0001';
  END;

  INSERT INTO payments (
    session_id, cashier_shift_id, method, amount_cents,
    status, paid_at, gateway_ref, client_op_id
  )
  VALUES (
    NULL, p_shift_id, p_payment_method, p_amount_cents,
    'completed', now(), 'monthly_plan:' || v_plan.id, p_client_op_id_payment
  )
  RETURNING * INTO v_payment;

  RETURN jsonb_build_object(
    'plan', to_jsonb(v_plan), 'payment', to_jsonb(v_payment), 'idempotent', false
  );
END
$fn$;

COMMENT ON FUNCTION public.create_monthly_plan_with_payment IS
  'Vende una mensualidad: inserta el plan y su ingreso en caja en una sola transacción. Traduce el choque del EXCLUDE a plan_overlap.';

REVOKE ALL ON FUNCTION public.create_monthly_plan_with_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_monthly_plan_with_payment TO authenticated;

-- =========================================================================
-- 3) Vencimiento automático
-- =========================================================================
CREATE OR REPLACE FUNCTION public.refresh_monthly_plan_statuses()
RETURNS TABLE (expirados INT, por_vencer INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'America/Bogota')::date;
  v_exp   INT;
  v_soon  INT;
BEGIN
  UPDATE monthly_plans
     SET status = 'expired', updated_at = now()
   WHERE _deleted = false
     AND status IN ('active', 'expiring')
     AND end_date < v_today;
  GET DIAGNOSTICS v_exp = ROW_COUNT;

  UPDATE monthly_plans
     SET status = 'expiring', updated_at = now()
   WHERE _deleted = false
     AND status = 'active'
     AND end_date BETWEEN v_today AND (v_today + 5);
  GET DIAGNOSTICS v_soon = ROW_COUNT;

  RETURN QUERY SELECT v_exp, v_soon;
END
$fn$;

COMMENT ON FUNCTION public.refresh_monthly_plan_statuses IS
  'Transiciona los estados de las mensualidades según la fecha civil de Colombia. La corre pg_cron a diario; es idempotente y se puede ejecutar a mano.';

REVOKE ALL ON FUNCTION public.refresh_monthly_plan_statuses FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_monthly_plan_statuses TO authenticated;

COMMIT;

-- pg_cron fuera de la transacción: `cron.schedule` hace su propio commit.
-- 05:10 UTC = 00:10 en Colombia, recién pasada la medianoche local.
SELECT cron.unschedule('refresh-monthly-plan-statuses')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-monthly-plan-statuses');

SELECT cron.schedule(
  'refresh-monthly-plan-statuses',
  '10 5 * * *',
  $job$SELECT public.refresh_monthly_plan_statuses()$job$
);
