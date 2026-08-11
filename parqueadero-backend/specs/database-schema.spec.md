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
- **Dinero: `*_cents BIGINT`** (INT desborda a $21M COP — bajo para totales acumulados; BIGINT es seguro y es la convención del skill `supabase-expert`).

## Orden de creación (dependencias FK)

Las tablas se crean en este orden para resolver foreign keys forward:
`users → customers → vehicles → tariffs → monthly_plans → cashier_shifts → parking_sessions → invoices → invoice_lines → payments`.

La FK circular `invoices.payment_id ↔ payments.invoice_id` se añade vía `ALTER TABLE ADD CONSTRAINT` después de crear ambas tablas.

## Tablas Principales

### 1. `users` (mirror de `auth.users`)
```sql
id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
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

**Importante:** `users.id = auth.users.id`. Esto permite que `auth.uid() = users.id` directamente en RLS sin lookup adicional. Cuando un usuario se elimina de `auth.users`, su registro en `public.users` cascada (ON DELETE CASCADE).

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
responsabilidades_fiscales TEXT[] -- Histórico (sin uso activo; FE descartada el 2026-05-20)
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
unit TEXT NOT NULL CHECK (unit IN ('minuto', 'hora', 'fraccion', 'dia', 'mensualidad', 'quincena'))
  -- Rotación (minuto/hora/fraccion/dia): el `unit` deja de gobernar el cobro
  -- (queda como etiqueta); manda el tiered pricing.
  -- Planes prepagados (`mensualidad` 30 días, `quincena` 15 días, esta última
  -- desde 00041): manda `value_cents` = precio del periodo completo.
value_cents BIGINT NOT NULL CHECK (value_cents > 0)
  -- DEPRECADO para rotación (lo reemplazan los 3 cents por tier).
  -- Vigente para los planes = precio del periodo completo.
grace_minutes INTEGER NOT NULL DEFAULT 0
daily_cap_cents BIGINT NOT NULL CHECK (daily_cap_cents > 0)
  -- DEPRECADO para parking. Se mantiene como espejo de plena_cents para back-compat.

-- NUEVOS (tiered pricing, migration 00021):
per_minute_cents BIGINT
  -- Valor por minuto. NOT NULL salvo en unidades de plan.
per_hour_cents BIGINT
  -- Valor por hora completa (se cobra ceil(min/60)). NOT NULL salvo en planes.
plena_cents BIGINT
  -- Tope absoluto por sesión (día completo). NOT NULL salvo en planes.

schedule_json JSONB NOT NULL DEFAULT '{"lunes": "07:00-22:00"}'
valid_from DATE
valid_to DATE
is_active BOOLEAN NOT NULL DEFAULT TRUE
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
_deleted BOOLEAN NOT NULL DEFAULT FALSE

CONSTRAINTS:
  -- `PLANES` = unit IN ('mensualidad','quincena'). Quedan exentas de todo lo
  -- que es propio del cobro por tiempo. Ajustado en 00042: antes la exención
  -- era solo para 'mensualidad' y la quincena no se podía insertar.
  - CHECK: unit IN PLANES OR (per_minute_cents IS NOT NULL AND per_hour_cents IS NOT NULL AND plena_cents IS NOT NULL)
  - CHECK: unit IN PLANES OR (per_minute_cents > 0 AND per_hour_cents > 0 AND plena_cents > 0)
  - CHECK: unit IN PLANES OR per_hour_cents <= per_minute_cents * 60
    -- la hora no puede ser más cara que 60 minutos sueltos (cliente-friendly)
  - CHECK: unit IN PLANES OR plena_cents <= per_hour_cents * 24
    -- la plena no puede superar 24h de la tarifa hora

INDEXES:
  - INDEX(is_active)
  - INDEX(vehicle_type)
  - UNIQUE(vehicle_type) WHERE is_active=true AND _deleted=false AND unit NOT IN PLANES
    -- una sola tarifa de rotación activa por tipo de vehículo
  - UNIQUE(vehicle_type, unit) WHERE is_active=true AND _deleted=false AND unit IN PLANES
    -- un solo precio activo por plan y tipo (00043). Mensualidad y quincena
    -- conviven para el mismo vehículo; dos mensualidades no.
```

**Semántica de cobro**: ver `specs/tariffs-pricing.spec.md`. El cliente paga el **MIN** de tres cálculos (minuto / hora redondeada / plena), nunca más que `plena_cents`.

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
amount_due_cents BIGINT DEFAULT 0
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
amount_cents BIGINT NOT NULL CHECK (amount_cents > 0)
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

CONSTRAINTS:
  - CHECK (end_date >= start_date)
  - EXCLUDE USING gist (vehicle_plate WITH =,
                        daterange(start_date, end_date, '[]') WITH &&)
      WHERE (_deleted = false AND status IN ('active','expiring'))
    -- monthly_plans_no_overlap (00040). Materializa "una placa = una
    -- mensualidad vigente". Un UNIQUE no sirve: lo que no puede repetirse
    -- es el SOLAPAMIENTO de fechas, y renovar por anticipado con rangos
    -- consecutivos tiene que seguir siendo posible. Requiere btree_gist.
```

**Ciclo de vida del status.** `refresh_monthly_plan_statuses()` (00040) pasa
los planes a `expired` cuando `end_date < hoy` y a `expiring` cuando faltan
≤ 5 días, siempre contra la fecha civil de Colombia. La corre pg_cron con el
job `refresh-monthly-plan-statuses` a las 05:10 UTC (00:10 en Bogotá); es
idempotente y se puede ejecutar a mano. Ningún cliente escribe `expired`.

**Duración del plan.** No hay columna de duración: un plan de quincena y uno
mensual se distinguen únicamente por `end_date - start_date` (15 o 30 días).
El precio de cada duración vive en `tariffs` con `unit = 'quincena'` o
`'mensualidad'` — ver `tariffs-pricing.spec.md`.

**Venta.** `create_monthly_plan_with_payment()` (00040, SECURITY INVOKER)
inserta el plan y su `payments` en una sola transacción. El pago va con
`session_id = NULL` y `gateway_ref = 'monthly_plan:<id>'`, el único vínculo
entre ingreso y plan.

### 7. `invoices`

Ticket POS interno numerado. NO es factura electrónica DIAN — el proyecto
descartó la integración con FE/Siigo el 2026-05-20.

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
internal_number TEXT UNIQUE NOT NULL  -- Consecutivo operacional propio (FAC-YYYY-MM-DD-NNNN).
tipo_documento TEXT NOT NULL CHECK (tipo_documento IN ('01', '02', '91'))  -- 01: factura, 02: nota crédito, 91: nota débito
customer_id UUID NOT NULL REFERENCES customers(id)
subtotal_cents BIGINT NOT NULL DEFAULT 0
tax_cents BIGINT NOT NULL DEFAULT 0
total_cents BIGINT NOT NULL DEFAULT 0
requested_invoice BOOLEAN NOT NULL DEFAULT FALSE  -- TRUE = cliente pidió ticket impreso al salir

issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
payment_id UUID REFERENCES payments(id)
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
_deleted BOOLEAN NOT NULL DEFAULT FALSE

INDEXES:
  - UNIQUE(internal_number)
  - INDEX(customer_id)
  - INDEX(issued_at DESC)

REPLICATION:
  - REPLICA IDENTITY FULL                                     -- 00015
  - publicada en `supabase_realtime` para refresh in-app del listado de tickets
```

### 8. `invoice_lines`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE
description TEXT NOT NULL
quantity INTEGER NOT NULL CHECK (quantity > 0)
unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0)
tax_percent DECIMAL(5,2) NOT NULL DEFAULT 19.00  -- IVA por defecto 19%
subtotal_cents BIGINT NOT NULL
tax_cents BIGINT NOT NULL
total_cents BIGINT NOT NULL
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
amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0)
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
opening_balance_cents BIGINT NOT NULL DEFAULT 0
closing_balance_cents BIGINT DEFAULT 0
expected_balance_cents BIGINT DEFAULT 0
difference_cents BIGINT DEFAULT 0
justification TEXT                        -- motivo de la diferencia al cierre (00006)
cash_collected_cents BIGINT               -- Σ pagos 'efectivo' completed al cierre (00033)
digital_collected_cents BIGINT            -- Σ pagos digitales completed al cierre (00033)
digital_verified_cents BIGINT             -- total digital verificado por el operador; NULL = no verificado (00033)
totals_by_method JSONB                    -- snapshot [{method, count, amount_cents}] al cierre (00033)
status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending_sync'))
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
_deleted BOOLEAN NOT NULL DEFAULT FALSE

INDEXES:
  - INDEX(user_id)
  - INDEX(status)
  - INDEX(opened_at DESC)
```

**Desglose por método al cierre (00033):** las 4 columnas de desglose se llenan
solo al cerrar el turno (spec `parqueadero-web/specs/features/cashier/close-shift.spec.md`).
Métodos digitales: `transferencia`, `nequi`, `daviplata`, `tarjeta_credito`,
`tarjeta_debito`. Turnos cerrados antes de la migración quedan en `NULL`
(la UI muestra "—", no $0). `difference_cents` sigue siendo solo de efectivo;
la diferencia digital (`digital_verified_cents − digital_collected_cents`) se
calcula en cliente y no se persiste.

### 11. `audit_log` (APPEND-ONLY)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id UUID REFERENCES users(id) ON DELETE SET NULL
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

CONSTRAINT: NO UPDATE, NO DELETE — vía RLS (cliente) Y vía trigger BEFORE UPDATE/DELETE que `RAISE EXCEPTION`. La doble defensa es necesaria porque RLS NO aplica a `service_role`, así que un Edge Function podría borrar logs sin el trigger.
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

-- Función trigger: zero-padding 4 dígitos + timezone Bogotá + idempotente si number ya viene asignado
CREATE OR REPLACE FUNCTION assign_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.number IS NULL THEN
    NEW.number := 'FAC-'
      || TO_CHAR(now() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD')
      || '-'
      || LPAD(nextval('invoice_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_assign_number
BEFORE INSERT ON invoices
FOR EACH ROW
EXECUTE FUNCTION assign_invoice_number();
```

---
Status: Implementado en migrations 00001-00004 (Fase 1, 2026-04-28)
