# Spec: Database Schema — PostgreSQL (Supabase)

## Propósito
Definición completa de todas las tablas, relaciones, constraints, índices y tipos de datos.

## Convención de Naming

- Tablas: snake_case, plural
- Columnas: snake_case
- Foreign keys: {tabla_singular}_id
- Timestamps: created_at, updated_at (TIMESTAMPTZ, default now())
- Logical delete: _deleted BOOLEAN NOT NULL DEFAULT FALSE
- Soft sync flag: _sync_status TEXT DEFAULT 'synced' (para PowerSync)

## Tablas Principales

### 1. `users`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
email TEXT UNIQUE NOT NULL
role TEXT NOT NULL CHECK (role IN ('admin', 'operador', 'contador'))
nombre TEXT NOT NULL
is_active BOOLEAN NOT NULL DEFAULT TRUE
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
_deleted BOOLEAN NOT NULL DEFAULT FALSE

INDEXES:
  - UNIQUE(email)
  - INDEX(is_active)
```

### 2. `vehicles`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
plate TEXT UNIQUE NOT NULL
type TEXT NOT NULL CHECK (type IN ('carro', 'moto', 'bicicleta', 'otro'))
color TEXT
brand TEXT
owner_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
_deleted BOOLEAN NOT NULL DEFAULT FALSE

INDEXES:
  - UNIQUE(plate)
  - INDEX(owner_customer_id)
```

### 3. `customers`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
doc_type TEXT NOT NULL CHECK (doc_type IN ('cedula', 'nit', 'pasaporte'))
doc_number TEXT NOT NULL
dv SMALLINT
name TEXT NOT NULL
email TEXT UNIQUE
phone TEXT
address TEXT
municipio TEXT
departamento TEXT
responsabilidades_fiscales TEXT[] -- Para factura DIAN
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
_deleted BOOLEAN NOT NULL DEFAULT FALSE

INDEXES:
  - UNIQUE(doc_type, doc_number)
  - INDEX(email)
```

### 4. `tariffs`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
name TEXT NOT NULL
vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('carro', 'moto', 'bicicleta', 'otro'))
unit TEXT NOT NULL CHECK (unit IN ('minuto', 'hora', 'fraccion', 'dia'))
value_cents INTEGER NOT NULL CHECK (value_cents > 0)
grace_minutes INTEGER NOT NULL DEFAULT 0
daily_cap_cents INTEGER NOT NULL CHECK (daily_cap_cents > 0)
schedule_json JSONB NOT NULL DEFAULT '{"lunes": "07:00-22:00"}'
valid_from DATE
valid_to DATE
is_active BOOLEAN NOT NULL DEFAULT TRUE
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
_deleted BOOLEAN NOT NULL DEFAULT FALSE

INDEXES:
  - INDEX(is_active)
  - INDEX(vehicle_type)
```

### 5. `parking_sessions`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
vehicle_plate TEXT NOT NULL
vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('carro', 'moto', 'bicicleta', 'otro'))
entry_at TIMESTAMPTZ NOT NULL
exit_at TIMESTAMPTZ
status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled'))
tariff_id UUID REFERENCES tariffs(id)
monthly_plan_id UUID REFERENCES monthly_plans(id) ON DELETE SET NULL
amount_due_cents INTEGER DEFAULT 0
entry_user_id UUID NOT NULL REFERENCES users(id)
exit_user_id UUID REFERENCES users(id)
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
_deleted BOOLEAN NOT NULL DEFAULT FALSE

INDEXES:
  - INDEX(vehicle_plate)
  - UNIQUE(vehicle_plate) WHERE status='active' AND _deleted=FALSE
  - INDEX(entry_at DESC)
  - INDEX(status)
  - INDEX(entry_user_id)
```

### 6. `monthly_plans`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
customer_id UUID NOT NULL REFERENCES customers(id)
vehicle_plate TEXT NOT NULL
plan_type TEXT NOT NULL  -- 'basico', 'premium', 'ilimitado'
start_date DATE NOT NULL
end_date DATE NOT NULL
amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired', 'cancelled'))
auto_renew BOOLEAN NOT NULL DEFAULT FALSE
payment_token_id TEXT -- Para renovación automática
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
_deleted BOOLEAN NOT NULL DEFAULT FALSE

INDEXES:
  - INDEX(vehicle_plate)
  - INDEX(customer_id)
  - INDEX(status)
  - INDEX(end_date) WHERE status='active'
```

### 7. `invoices`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
number TEXT UNIQUE NOT NULL
cufe TEXT UNIQUE
tipo_documento TEXT NOT NULL CHECK (tipo_documento IN ('01', '02', '91'))  -- 01: factura, 02: nota crédito, 91: nota débito
customer_id UUID NOT NULL REFERENCES customers(id)
subtotal_cents INTEGER NOT NULL DEFAULT 0
tax_cents INTEGER NOT NULL DEFAULT 0
total_cents INTEGER NOT NULL DEFAULT 0
dian_status TEXT NOT NULL DEFAULT 'pending' CHECK (dian_status IN ('pending', 'sent', 'accepted', 'rejected', 'contingency'))
dian_cufe TEXT
dian_xml_url TEXT
dian_pdf_url TEXT
issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
payment_id UUID REFERENCES payments(id)
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
_deleted BOOLEAN NOT NULL DEFAULT FALSE

INDEXES:
  - UNIQUE(number)
  - INDEX(customer_id)
  - INDEX(dian_status)
  - INDEX(issued_at DESC)
```

### 8. `invoice_lines`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE
description TEXT NOT NULL
quantity INTEGER NOT NULL CHECK (quantity > 0)
unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
tax_percent DECIMAL(5,2) NOT NULL DEFAULT 19.00  -- IVA por defecto 19%
subtotal_cents INTEGER NOT NULL
tax_cents INTEGER NOT NULL
total_cents INTEGER NOT NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

INDEXES:
  - INDEX(invoice_id)
```

### 9. `payments`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL
method TEXT NOT NULL CHECK (method IN ('efectivo', 'tarjeta_credito', 'tarjeta_debito', 'transferencia', 'nequi', 'daviplata', 'cortesia', 'error', 'mensual'))
gateway_ref TEXT
amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0)
status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded'))
paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
cashier_shift_id UUID NOT NULL REFERENCES cashier_shifts(id)
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
_deleted BOOLEAN NOT NULL DEFAULT FALSE

INDEXES:
  - INDEX(invoice_id)
  - INDEX(status)
  - INDEX(cashier_shift_id)
```

### 10. `cashier_shifts`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id UUID NOT NULL REFERENCES users(id)
opened_at TIMESTAMPTZ NOT NULL DEFAULT now()
closed_at TIMESTAMPTZ
opening_balance_cents INTEGER NOT NULL DEFAULT 0
closing_balance_cents INTEGER DEFAULT 0
expected_balance_cents INTEGER DEFAULT 0
difference_cents INTEGER DEFAULT 0
status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending_sync'))
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
_deleted BOOLEAN NOT NULL DEFAULT FALSE

INDEXES:
  - INDEX(user_id)
  - INDEX(status)
  - INDEX(opened_at DESC)
```

### 11. `audit_log` (APPEND-ONLY)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id UUID REFERENCES users(id)
action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'VIEW'))
entity_type TEXT NOT NULL
entity_id UUID NOT NULL
before_json JSONB
after_json JSONB
created_at TIMESTAMPTZ NOT NULL DEFAULT now()

INDEXES:
  - INDEX(entity_type, entity_id)
  - INDEX(user_id)
  - INDEX(created_at DESC)

CONSTRAINT: NO UPDATE, NO DELETE
```

## Vistas (Opcional)

```sql
-- Vista para sesiones activas con info enriquecida
CREATE VIEW vw_active_sessions_with_info AS
SELECT
  ps.id, ps.vehicle_plate, ps.vehicle_type, ps.entry_at,
  (NOW() - ps.entry_at)::INTERVAL MINUTE AS duration_minutes,
  ps.status, ps.monthly_plan_id,
  u.nombre as entry_user_name,
  mp.status as monthly_plan_status,
  mp.end_date as plan_end_date
FROM parking_sessions ps
LEFT JOIN users u ON ps.entry_user_id = u.id
LEFT JOIN monthly_plans mp ON ps.monthly_plan_id = mp.id
WHERE ps.status = 'active' AND ps._deleted = FALSE
ORDER BY ps.entry_at DESC;
```

## Secuencias

```sql
-- Numeración de facturas (secuencia global)
CREATE SEQUENCE invoice_number_seq START 1;

-- Función trigger para auto-incrementar
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.number := 'FAC-' || to_char(now(), 'YYYY-MM-DD') || '-' || nextval('invoice_number_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_invoice_number
BEFORE INSERT ON invoices
FOR EACH ROW
EXECUTE FUNCTION set_invoice_number();
```

---
Status: Pendiente de Implementación
