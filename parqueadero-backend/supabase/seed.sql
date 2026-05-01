-- seed.sql — Datos de prueba para dev local. NO usar en producción.
-- Confirmado por usuario: admin@parqueadero.local / admin12345.

-- ============================================================================
-- 1. Admin user (auth.users + public.users)
-- ============================================================================
DO $$
DECLARE
  admin_uid UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  -- auth.users entry
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new, phone_change_token,
    email_change
  )
  VALUES (
    admin_uid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'admin@parqueadero.local',
    crypt('admin12345', gen_salt('bf')),
    now(), now(), now(),
    -- raw_app_meta_data: incluye role para que el JWT hook de Fase 3 lo lea.
    '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
    '{"nombre":"Admin Dev"}'::jsonb,
    FALSE, FALSE,
    '', '', '', '',
    ''
  )
  ON CONFLICT (id) DO NOTHING;

  -- Mirror en public.users
  INSERT INTO public.users (id, email, role, nombre, is_active)
  VALUES (admin_uid, 'admin@parqueadero.local', 'admin', 'Admin Dev', TRUE)
  ON CONFLICT (id) DO UPDATE
    SET role      = EXCLUDED.role,
        nombre    = EXCLUDED.nombre,
        is_active = EXCLUDED.is_active;
END
$$;

-- ============================================================================
-- 2. Tarifas default
-- ============================================================================
INSERT INTO tariffs (name, vehicle_type, unit, value_cents, grace_minutes, daily_cap_cents)
VALUES
  ('Carro por hora',     'carro',     'hora', 500000, 10, 3000000),
  ('Moto por hora',      'moto',      'hora', 250000, 10, 1500000),
  ('Bicicleta por día',  'bicicleta', 'dia',  100000,  0,  100000)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. Cliente demo + plan mensual ejemplo
-- ============================================================================
DO $$
DECLARE
  customer_uid UUID;
  existing_id  UUID;
BEGIN
  SELECT id INTO existing_id
  FROM customers
  WHERE doc_type = 'cedula' AND doc_number = '1000000001';

  IF existing_id IS NULL THEN
    INSERT INTO customers (doc_type, doc_number, dv, name, email, phone, municipio, departamento)
    VALUES ('cedula', '1000000001', NULL, 'Cliente Demo', 'demo@ejemplo.local', '3001234567', 'Bogotá', 'Cundinamarca')
    RETURNING id INTO customer_uid;

    INSERT INTO monthly_plans (customer_id, vehicle_plate, plan_type, start_date, end_date, amount_cents, status)
    VALUES (
      customer_uid,
      'ABC123',
      'basico',
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '30 days',
      15000000,
      'active'
    );
  END IF;
END
$$;

-- ============================================================================
-- 4. Demo data para reportes — 7 días de turnos cerrados con sesiones+pagos
-- Salta si ya existen turnos cerrados (idempotente).
-- ============================================================================
DO $$
DECLARE
  admin_uid       UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
  carro_tariff_id UUID;
  moto_tariff_id  UUID;
  shift_id        UUID;
  session_id      UUID;
  day_offset      INT;
  i               INT;
  plate           TEXT;
  vtype           TEXT;
  tariff_id       UUID;
  amount          BIGINT;
  pay_method      TEXT;
  shift_open      TIMESTAMPTZ;
  shift_close     TIMESTAMPTZ;
  entry_time      TIMESTAMPTZ;
  exit_time       TIMESTAMPTZ;
  total_for_shift BIGINT;
BEGIN
  -- Skip if we already have a closed shift owned by admin (idempotente)
  IF EXISTS (
    SELECT 1 FROM cashier_shifts
    WHERE user_id = admin_uid AND status = 'closed' AND _deleted = FALSE
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO carro_tariff_id FROM tariffs WHERE name = 'Carro por hora' LIMIT 1;
  SELECT id INTO moto_tariff_id  FROM tariffs WHERE name = 'Moto por hora'  LIMIT 1;

  -- Generar 7 días de turnos (offset 6 días atrás → ayer)
  FOR day_offset IN REVERSE 6..0 LOOP
    shift_open  := (CURRENT_DATE - day_offset)::timestamptz + INTERVAL '7 hours';
    shift_close := shift_open + INTERVAL '10 hours';

    INSERT INTO cashier_shifts (
      user_id, opened_at, closed_at, opening_balance_cents,
      closing_balance_cents, expected_balance_cents, difference_cents, status
    )
    VALUES (
      admin_uid, shift_open, shift_close, 5000000,
      0, 0, 0, 'closed'
    )
    RETURNING id INTO shift_id;

    total_for_shift := 0;

    -- 5 sesiones cerradas por turno
    FOR i IN 1..5 LOOP
      -- Mezcla de carros/motos para que los reportes muestren ambos tipos
      IF i % 2 = 0 THEN
        vtype := 'moto';
        tariff_id := moto_tariff_id;
        amount := 250000 + (i * 30000);
      ELSE
        vtype := 'carro';
        tariff_id := carro_tariff_id;
        amount := 500000 + (i * 100000);
      END IF;

      plate := 'D' || LPAD(((day_offset * 10 + i)::TEXT), 2, '0') || CHR(64 + i) || LPAD(i::TEXT, 2, '0');
      entry_time := shift_open + (i * INTERVAL '90 minutes');
      exit_time  := entry_time + INTERVAL '2 hours';

      INSERT INTO parking_sessions (
        vehicle_plate, vehicle_type, entry_at, exit_at, status, tariff_id,
        amount_due_cents, entry_user_id, exit_user_id
      )
      VALUES (
        plate, vtype, entry_time, exit_time, 'completed', tariff_id,
        amount, admin_uid, admin_uid
      )
      RETURNING id INTO session_id;

      -- Variar método de pago para que el reporte tenga splits
      IF i = 1 THEN pay_method := 'tarjeta_credito';
      ELSIF i = 2 THEN pay_method := 'efectivo';
      ELSIF i = 3 THEN pay_method := 'nequi';
      ELSIF i = 4 THEN pay_method := 'efectivo';
      ELSE pay_method := 'transferencia';
      END IF;

      INSERT INTO payments (
        method, amount_cents, status, paid_at, cashier_shift_id, session_id
      )
      VALUES (
        pay_method, amount, 'completed', exit_time, shift_id, session_id
      );

      IF pay_method = 'efectivo' THEN
        total_for_shift := total_for_shift + amount;
      END IF;
    END LOOP;

    -- Cerrar turno con el cuadre real (efectivo apertura + efectivo recibido)
    UPDATE cashier_shifts
    SET expected_balance_cents = 5000000 + total_for_shift,
        closing_balance_cents  = 5000000 + total_for_shift,
        difference_cents       = 0
    WHERE id = shift_id;
  END LOOP;
END
$$;
