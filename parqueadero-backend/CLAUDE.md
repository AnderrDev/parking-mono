# CLAUDE.md — Backend: Supabase (PostgreSQL + Edge Functions + RLS)

**Versión:** 1.0  
**Repo:** parqueadero-backend

---

## INTRO

Este repo contiene la capa de datos del parqueadero:
- Schema PostgreSQL completo con constraints, índices, RLS
- Edge Functions para lógica serverless (asignación de números, webhooks, crons)
- Políticas de seguridad (Row Level Security) por rol
- Seed data de prueba

**Metodología**: Spec-Driven. Antes de ejecutar migrations, verifica `specs/database-schema.spec.md` y `specs/rls-policies.spec.md`.

---

## 1. SCHEMA & RLS SPECS

Toda la estructura de BD está documentada en specs/:

- `specs/database-schema.spec.md` — Tablas, columnas, constraints, índices, tipos
- `specs/rls-policies.spec.md` — Qué puede hacer cada rol en cada tabla

**Regla de oro**: Si necesitas cambiar una tabla, PRIMERO actualiza la spec. Luego creas la migration.

---

## 2. ESTRUCTURA

```
supabase/
├── migrations/
│   ├── 00001_initial_schema.sql      ← Schema completo + RLS
│   ├── 00002_*.sql                   ← Cambios posteriores
│   └── ...
├── functions/
│   ├── request-invoice/
│   │   ├── index.ts                  ← Asigna número, llama dian-fe-service
│   │   └── test-request.ts
│   ├── process-payment/
│   │   ├── index.ts                  ← Webhook Wompi
│   │   └── test-request.ts
│   └── renew-monthly/
│       └── index.ts                  ← Cron: renovar mensualidades
├── [README.md](http://README.md)                       ← Documentación local
├── .env.example                      ← Variables de entorno
└── seed.sql                          ← Datos de prueba: tarifas, usuario admin
```

---

## 3. FLUJO DE MIGRACIÓN

1. **Actualizar spec en specs/**
   - Si es nueva tabla: agregar a `database-schema.spec.md`
   - Si es cambio: actualizar tablas afectadas

2. **Crear archivo migration**
   ```bash
   # Supabase crea automáticamente si usas CLI, o crear manual:
   supabase/migrations/00002_add_monthly_plans.sql
   ```

3. **Escribir SQL**
   - Seguir naming conventions (snake_case, plural)
   - Incluir índices y constraints
   - Incluir RLS si es tabla con datos sensibles

4. **Testing local**
   ```bash
   supabase start
   supabase db push  # Ejecuta migrations
   # Probar en `supabase/seed.sql`
   ```

5. **Desplegar**
   ```bash
   supabase db push --linked  # Producción
   ```

---

## 4. NAMING CONVENTIONS (IMPORTANTES)

| Concepto | Patrón | Ejemplo |
|---|---|---|
| Tabla | snake_case, plural | `parking_sessions`, `monthly_plans` |
| Columna | snake_case | `vehicle_plate`, `entry_at` |
| PK | id UUID | `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` |
| FK | {tabla_singular}_id | `customer_id` (FK a `customers`) |
| Timestamp | created_at, updated_at | `created_at TIMESTAMPTZ DEFAULT now()` |
| Soft delete | _deleted | `_deleted BOOLEAN NOT NULL DEFAULT FALSE` |
| Sync flag | _sync_status | `_sync_status TEXT DEFAULT 'synced'` |
| Índices | idx_{tabla}_{columnas} | `CREATE INDEX idx_sessions_plate ON parking_sessions(vehicle_plate)` |
| Unique | constrain_{tabla}_{columnas} | `CONSTRAINT uq_sessions_active UNIQUE(vehicle_plate) WHERE status='active'` |

---

## 5. TABLAS PRINCIPALES

### 5.1 `users`
- id, email (UNIQUE), role (admin|operador|contador), nombre, is_active
- Integrada con Supabase Auth
- Operador ve solo su registro; admin ve todo

### 5.2 `parking_sessions`
- id, vehicle_plate (FK a vehicles), vehicle_type, entry_at, exit_at, status
- UNIQUE(vehicle_plate) WHERE status='active' — una sesión activa por placa
- FK a tariffs, monthly_plans (opcional), users (entry_user_id, exit_user_id)

### 5.3 `monthly_plans`
- id, customer_id, vehicle_plate, plan_type, start_date, end_date, status
- Status: active, expiring, expired, cancelled
- INDEX en end_date WHERE status='active' para buscar próximos a vencer

### 5.4 `invoices`
- id, number (UNIQUE), cufe (UNIQUE), customer_id, total_cents, dian_status
- dian_status: pending, sent, accepted, rejected, contingency
- Trigger que asigna número secuencial

### 5.5 `payments`
- id, invoice_id, method (efectivo|tarjeta|nequi|etc), amount_cents, status
- Registro completo de cada pago, incluso los sin cobro (cortesía)

### 5.6 `cashier_shifts`
- id, user_id, opened_at, closed_at, status (open|closed|pending_sync)
- Solo un shift abierto por usuario a la vez (verificar en UseCase)

### 5.7 `audit_log` (APPEND-ONLY)
- id, user_id, action (INSERT|UPDATE|DELETE), entity_type, entity_id, before_json, after_json
- NO soporta UPDATE ni DELETE (es bitácora inmutable)
- Triggers en tablas sensibles registran cambios automáticamente

---

## 6. ROW LEVEL SECURITY (RLS)

**Cada tabla debe tener RLS habilitado y políticas claras.**

Ejemplo para `parking_sessions`:

```sql
-- Operador inserta su propia entrada
CREATE POLICY "operador_insert_entry" ON parking_sessions
FOR INSERT WITH CHECK (entry_user_id = auth.uid());

-- Operador ve sesiones de su turno
CREATE POLICY "operador_read_shift_sessions" ON parking_sessions
FOR SELECT USING (
  entry_user_id = auth.uid()
  AND DATE(entry_at) = CURRENT_DATE
);

-- Admin ve todo
CREATE POLICY "admin_all_sessions" ON parking_sessions
FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
```

**Regla crítica**: El cliente NO puede usar RLS directamente con Supabase. Las políticas protegen datos:
- Operario ve solo sus operaciones
- Admin ve todo
- Contador ve todo (lectura)
- Cliente externo: NO acceso directo a BD (solo via API)

---

## 7. EDGE FUNCTIONS

Supabase Edge Functions (Deno) manejan lógica serverless:

### 7.1 `request-invoice`

```typescript
// supabase/functions/request-invoice/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  const { cashier_shift_id, invoice_data } = await req.json();
  
  // 1. Verificar que shift existe y está cerrado
  // 2. Asignar número secuencial
  const invoice_number = await getNextInvoiceNumber();
  
  // 3. Llamar a dian-fe-service
  const dianResponse = await fetch(
    'https://dian-fe-service.fly.dev/invoice',
    {
      method: 'POST',
      body: JSON.stringify({ invoice_number, ...invoice_data })
    }
  );
  
  // 4. Guardar en BD
  const result = await supabase
    .from('invoices')
    .insert({
      number: invoice_number,
      dian_status: dianResponse.dian_status,
      dian_cufe: dianResponse.cufe,
      ...
    });
  
  return new Response(JSON.stringify(result), { status: 200 });
});
```

### 7.2 `process-payment` (Wompi webhook)

Recibe notificación de Wompi cuando hay pago online, actualiza `payments`.

### 7.3 `renew-monthly` (Cron)

Cada día, renovar mensualidades con `auto_renew=true` que expiraron ayer.

---

## 8. SEED DATA

`supabase/seed.sql` contiene:
- Tarifas default (carro $5.000/hora, moto $2.500/hora)
- Planes mensuales (básico, premium, ilimitado)
- Usuario admin para testing
- Municipios y departamentos de Colombia

```sql
-- Tarifas default
INSERT INTO tariffs (name, vehicle_type, unit, value_cents, grace_minutes, daily_cap_cents, is_active)
VALUES
  ('Carro por hora', 'carro', 'hora', 500000, 10, 3000000, true),
  ('Moto por hora', 'moto', 'hora', 250000, 10, 1500000, true);

-- Usuario admin
INSERT INTO auth.users (email, encrypted_password, confirmed_at)
VALUES ('admin@parqueadero.local', '...', now());
```

---

## 9. CONSIDERACIONES DE SEGURIDAD

### 9.1 RLS es la defensa

- **RLS enabled en TODAS las tablas** con datos de usuario
- **Default DENY**: Si no hay política, se rechaza
- **Service role**: Solo backend (Edge Functions) bypassa RLS
- **JWT claims**: `auth.jwt() ->> 'role'` NO es falsificable por cliente

### 9.2 Datos Sensibles

- **Documentos de identidad**: Encrypted o masked en APIs
- **Números de tarjeta**: NUNCA en BD (usa Wompi)
- **Claves técnicas DIAN**: En .env, NO en código
- **Audit log**: Toda acción sensible queda registrada

### 9.3 Backup

- Supabase hace backup automático
- Configurar retención según DIAN (mínimo 2 años)

---

## 10. FLUJO DE DESARROLLO

### Cambiar una tabla existente

1. Actualiza `specs/database-schema.spec.md`
2. Crea archivo migration `supabase/migrations/000X_*.sql`
3. Prueba local: `supabase db push`
4. Redeploy: `supabase db push --linked`

### Cambiar políticas RLS

1. Actualiza `specs/rls-policies.spec.md`
2. Crea migration con nuevas políticas
3. Prueba: `supabase start`, luego test con cada rol
4. Verificar que no rompe app frontend

### Agregar Edge Function

1. `supabase functions new nombre-function`
2. Escribir en TypeScript/Deno
3. Probar local: `supabase functions serve`
4. Deploy: `supabase functions deploy`

---

## PRÓXIMOS PASOS

1. ✅ Spec de schema y RLS creadas
2. ⏳ Migración inicial (00001_initial_schema.sql)
3. ⏳ Seed data (tarifas, usuario admin)
4. ⏳ Edge Functions (request-invoice, process-payment, renew-monthly)
5. ⏳ Tests de RLS por rol
6. ⏳ Integración con parqueadero-web y dian-fe-service

---

**v1.0** — Guía de backend. Actualizar cuando schema cambie.
