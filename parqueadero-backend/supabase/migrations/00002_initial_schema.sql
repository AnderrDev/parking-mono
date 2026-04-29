-- Migration 00002: schema inicial (10 tablas operativas)
-- Spec: specs/database-schema.spec.md
-- Orden de creación: users → customers → vehicles → tariffs → monthly_plans →
--                    cashier_shifts → parking_sessions → invoices → invoice_lines → payments
-- FK circular invoices.payment_id ↔ payments.invoice_id se resuelve vía ALTER al final.

BEGIN;

-- =============================================
-- 1. users (mirror de auth.users)
-- =============================================
CREATE TABLE users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'operador', 'contador')),
  nombre      TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  _deleted    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_users_active ON users (is_active) WHERE _deleted = FALSE;

COMMENT ON TABLE users IS 'Mirror de auth.users con role app y datos de perfil. id = auth.uid().';

-- =============================================
-- 2. customers
-- =============================================
CREATE TABLE customers (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type                    TEXT NOT NULL CHECK (doc_type IN ('cedula', 'nit', 'pasaporte')),
  doc_number                  TEXT NOT NULL,
  dv                          SMALLINT,
  name                        TEXT NOT NULL,
  email                       TEXT UNIQUE,
  phone                       TEXT,
  address                     TEXT,
  municipio                   TEXT,
  departamento                TEXT,
  responsabilidades_fiscales  TEXT[],
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  _deleted                    BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_customers_doc UNIQUE (doc_type, doc_number)
);

CREATE INDEX idx_customers_email ON customers (email) WHERE email IS NOT NULL;

-- =============================================
-- 3. vehicles
-- =============================================
CREATE TABLE vehicles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate              TEXT UNIQUE NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('carro', 'moto', 'bicicleta', 'otro')),
  color              TEXT,
  brand              TEXT,
  owner_customer_id  UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  _deleted           BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_vehicles_owner ON vehicles (owner_customer_id);

-- =============================================
-- 4. tariffs
-- =============================================
CREATE TABLE tariffs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  vehicle_type     TEXT NOT NULL CHECK (vehicle_type IN ('carro', 'moto', 'bicicleta', 'otro')),
  unit             TEXT NOT NULL CHECK (unit IN ('minuto', 'hora', 'fraccion', 'dia')),
  value_cents      BIGINT NOT NULL CHECK (value_cents > 0),
  grace_minutes    INTEGER NOT NULL DEFAULT 0 CHECK (grace_minutes >= 0),
  daily_cap_cents  BIGINT NOT NULL CHECK (daily_cap_cents > 0),
  schedule_json    JSONB NOT NULL DEFAULT '{"lunes-domingo": "00:00-23:59"}'::jsonb,
  valid_from       DATE,
  valid_to         DATE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  _deleted         BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT chk_tariffs_validity CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE INDEX idx_tariffs_active ON tariffs (is_active, vehicle_type) WHERE _deleted = FALSE;

-- =============================================
-- 5. monthly_plans
-- =============================================
CREATE TABLE monthly_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  vehicle_plate     TEXT NOT NULL,
  plan_type         TEXT NOT NULL,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  amount_cents      BIGINT NOT NULL CHECK (amount_cents > 0),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired', 'cancelled')),
  auto_renew        BOOLEAN NOT NULL DEFAULT FALSE,
  payment_token_id  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  _deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT chk_monthly_plans_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_plans_plate      ON monthly_plans (vehicle_plate);
CREATE INDEX idx_plans_customer   ON monthly_plans (customer_id);
CREATE INDEX idx_plans_status     ON monthly_plans (status);
CREATE INDEX idx_plans_active_end ON monthly_plans (end_date)
  WHERE status = 'active' AND _deleted = FALSE;

-- =============================================
-- 6. cashier_shifts
-- =============================================
CREATE TABLE cashier_shifts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opened_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at               TIMESTAMPTZ,
  opening_balance_cents   BIGINT NOT NULL DEFAULT 0,
  closing_balance_cents   BIGINT DEFAULT 0,
  expected_balance_cents  BIGINT DEFAULT 0,
  difference_cents        BIGINT DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending_sync')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  _deleted                BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT chk_shifts_close CHECK (
    (status = 'closed' AND closed_at IS NOT NULL) OR (status <> 'closed')
  )
);

CREATE INDEX idx_shifts_user   ON cashier_shifts (user_id);
CREATE INDEX idx_shifts_status ON cashier_shifts (status);
CREATE INDEX idx_shifts_opened ON cashier_shifts (opened_at DESC);
CREATE UNIQUE INDEX uq_shifts_open_per_user ON cashier_shifts (user_id)
  WHERE status = 'open' AND _deleted = FALSE;

-- =============================================
-- 7. parking_sessions
-- =============================================
CREATE TABLE parking_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_plate     TEXT NOT NULL,
  vehicle_type      TEXT NOT NULL CHECK (vehicle_type IN ('carro', 'moto', 'bicicleta', 'otro')),
  entry_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  exit_at           TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  tariff_id         UUID REFERENCES tariffs(id) ON DELETE RESTRICT,
  monthly_plan_id   UUID REFERENCES monthly_plans(id) ON DELETE SET NULL,
  amount_due_cents  BIGINT DEFAULT 0,
  entry_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  exit_user_id      UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  _deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  _sync_status      TEXT NOT NULL DEFAULT 'synced' CHECK (_sync_status IN ('synced', 'pending', 'conflict')),
  CONSTRAINT chk_sessions_exit_after_entry CHECK (exit_at IS NULL OR exit_at >= entry_at)
);

CREATE INDEX idx_sessions_plate       ON parking_sessions (vehicle_plate);
CREATE UNIQUE INDEX uq_sessions_active ON parking_sessions (vehicle_plate)
  WHERE status = 'active' AND _deleted = FALSE;
CREATE INDEX idx_sessions_entry_at    ON parking_sessions (entry_at DESC);
CREATE INDEX idx_sessions_status      ON parking_sessions (status);
CREATE INDEX idx_sessions_entry_user  ON parking_sessions (entry_user_id);
CREATE INDEX idx_sessions_entry_user_date ON parking_sessions (
  entry_user_id,
  (DATE(entry_at AT TIME ZONE 'America/Bogota'))
);

-- =============================================
-- 8. invoices (sin FK a payments aún — se añade vía ALTER al final)
-- =============================================
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number          TEXT UNIQUE NOT NULL,
  cufe            TEXT UNIQUE,
  tipo_documento  TEXT NOT NULL DEFAULT '01' CHECK (tipo_documento IN ('01', '02', '91')),
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  subtotal_cents  BIGINT NOT NULL DEFAULT 0,
  tax_cents       BIGINT NOT NULL DEFAULT 0,
  total_cents     BIGINT NOT NULL DEFAULT 0,
  dian_status     TEXT NOT NULL DEFAULT 'pending' CHECK (dian_status IN ('pending', 'sent', 'accepted', 'rejected', 'contingency')),
  dian_cufe       TEXT,
  dian_xml_url    TEXT,
  dian_pdf_url    TEXT,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_id      UUID,  -- FK añadida abajo (FK circular con payments)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  _deleted        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_invoices_customer    ON invoices (customer_id);
CREATE INDEX idx_invoices_dian_status ON invoices (dian_status);
CREATE INDEX idx_invoices_issued      ON invoices (issued_at DESC);

-- =============================================
-- 9. invoice_lines
-- =============================================
CREATE TABLE invoice_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description       TEXT NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents  BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  tax_percent       DECIMAL(5,2) NOT NULL DEFAULT 19.00,
  subtotal_cents    BIGINT NOT NULL,
  tax_cents         BIGINT NOT NULL,
  total_cents       BIGINT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines (invoice_id);

-- =============================================
-- 10. payments
-- =============================================
CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID REFERENCES invoices(id) ON DELETE SET NULL,
  method            TEXT NOT NULL CHECK (method IN ('efectivo', 'tarjeta_credito', 'tarjeta_debito', 'transferencia', 'nequi', 'daviplata', 'cortesia', 'error', 'mensual')),
  gateway_ref       TEXT,
  amount_cents      BIGINT NOT NULL CHECK (amount_cents >= 0),
  status            TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  paid_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  cashier_shift_id  UUID NOT NULL REFERENCES cashier_shifts(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  _deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  _sync_status      TEXT NOT NULL DEFAULT 'synced' CHECK (_sync_status IN ('synced', 'pending', 'conflict'))
);

CREATE INDEX idx_payments_invoice ON payments (invoice_id);
CREATE INDEX idx_payments_status  ON payments (status);
CREATE INDEX idx_payments_shift   ON payments (cashier_shift_id);

-- =============================================
-- FK circular: invoices.payment_id → payments(id)
-- =============================================
ALTER TABLE invoices
  ADD CONSTRAINT fk_invoices_payment
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;

COMMIT;
