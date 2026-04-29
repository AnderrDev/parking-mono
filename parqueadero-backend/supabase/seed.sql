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
    is_super_admin, is_anonymous
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
    FALSE, FALSE
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
