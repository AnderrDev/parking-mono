# Spec: RLS Policies — Anexo Siigo (Fase 11 / S2)

## Identificador
`backend/rls-policies-siigo`

## Descripción
**Anexo** a `rls-policies.spec.md`. Define las RLS policies para las tablas y columnas nuevas introducidas por la integración Siigo (migration `00013_siigo_integration.sql`). No reescribe nada existente.

## 1. `siigo_invoice_attempts`

Tabla **append-only** que audita todas las llamadas HTTP a la API Siigo (auth, customer upsert, emit, poll). Contenido sensible (request/response Siigo, aunque sanitizado para tokens).

### Policies

| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `anon` | ❌ | ❌ | ❌ | ❌ |
| `authenticated` (admin/operador/contador) | ❌ | ❌ | ❌ | ❌ |
| `service_role` | ✅ | ✅ | ❌ (trigger) | ❌ (trigger) |

### SQL

```sql
ALTER TABLE siigo_invoice_attempts ENABLE ROW LEVEL SECURITY;

-- Default DENY (sin policies para authenticated/anon → todo bloqueado)

CREATE POLICY "service_role_all" ON siigo_invoice_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Nota**: `service_role` bypassa RLS por default en Supabase, pero declaramos la policy explícitamente para documentar la intención y para que `psql` con conexión non-superuser respete el modelo. UPDATE y DELETE igual son rechazados por los triggers `block_siigo_attempts_mutation` (definidos en `database-schema-siigo-delta.spec.md`).

### Acceso para admins (futuro, fuera de Fase 11)

Si en el futuro un admin debe poder ver el log para troubleshooting, NO se hará via policy directa. Se hará via Edge Function `get-siigo-attempts` o vista `SECURITY DEFINER` que filtre y exponga solo lo necesario, sin `request_body`/`response_body` crudos. Esto es follow-up.

## 2. `siigo_auth_tokens`

Cache single-row del bearer token Siigo (24 h). Si se filtra, alguien puede emitir facturas a nombre del comercio.

### Policies

| Rol | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `anon` | ❌ | ❌ | ❌ | ❌ |
| `authenticated` | ❌ | ❌ | ❌ | ❌ |
| `service_role` | ✅ | ✅ | ✅ | ✅ |

### SQL

```sql
ALTER TABLE siigo_auth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON siigo_auth_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

## 3. Columnas nuevas en `invoices`

Las columnas nuevas (`siigo_*`, `internal_number`, `requested_invoice`) NO requieren policies adicionales: la tabla `invoices` ya tiene RLS configurada (admin lee todo, operador lee del día, contador lee todo, etc.). Las policies existentes operan a nivel de fila, no de columna; por tanto las columnas nuevas se cubren automáticamente.

### Excepción: campo `siigo_last_error`

`siigo_last_error` puede contener detalles internos (ej. mensajes de Siigo en español que mencionan códigos DIAN). No es información sensible per se, pero por buena práctica se considera de lectura solo para admin/contador. Como Postgres RLS no filtra por columnas, esto se respeta a **nivel de aplicación**:

- El web `invoices-list.page` muestra `siigoLastError` solo si `userRole === 'admin'` (o lo presenta como "Hubo un problema técnico" para operador).
- Documentar en `parqueadero-web/specs/features/invoicing/view-invoice.spec.md`.

## 4. Columnas nuevas en `customers`

`siigo_customer_id`, `siigo_synced_at`, `siigo_sync_error` heredan policies existentes de `customers`. Sin cambios.

## 5. Función `get_invoices_for_polling(p_limit)`

`SECURITY DEFINER` (corre como owner de la función). El owner es `postgres` o el admin que aplica la migration; al ser `SECURITY DEFINER`, la función bypassa RLS al hacer SELECT sobre `invoices`.

### Permisos

```sql
REVOKE ALL ON FUNCTION get_invoices_for_polling(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_invoices_for_polling(INTEGER) TO service_role;
```

Solo `service_role` (la EF cron) puede invocarla. `authenticated` no tiene acceso.

## 6. Función `nextval_invoices()` (existente)

Sin cambios. Sigue siendo `SECURITY DEFINER`, `EXECUTE` solo a `service_role`.

## 7. Trigger `sync_dian_from_siigo`

No requiere RLS. Se ejecuta automáticamente en cualquier INSERT/UPDATE de `invoices`, sin importar el rol que dispare la operación.

## 8. Vector de ataque considerado

| Vector | Mitigación |
|---|---|
| Cliente JS lee `siigo_auth_tokens` para robar token | RLS lo bloquea (default deny + única policy es service_role). |
| Operador escribe `siigo_status='Stamped'` para "marcar" facturas como aceptadas sin haberlas estampado | RLS de `invoices` permite UPDATE a operador solo en sus filas del día — pero podría intentar este vector en sus filas. **Mitigación adicional**: agregar `WITH CHECK (NEW.siigo_status = OLD.siigo_status)` a la policy de UPDATE de operador — operador NO puede tocar `siigo_status`, solo `service_role` lo modifica via las EF Siigo. |
| Cliente JS llama EF `siigo-poll-status` directamente | La EF requiere `Authorization: Bearer <SERVICE_ROLE_KEY>`. JWT de usuario normal → 401. |
| Lectura de `siigo_invoice_attempts` para enumerar facturas | RLS lo bloquea para todos excepto service_role. |
| Filtración de logs Supabase Functions con request_body que contiene access_key | El cliente HTTP (`_shared/siigo/client.ts`) sanitiza headers/body antes de hacer `console.log` o `INSERT`. |

### Adición a la policy de UPDATE de `invoices` (operador)

La policy existente permite UPDATE a operador en sus sesiones del día. Para evitar que toque `siigo_*`:

```sql
-- En migration 00013 (o 00015 si se separa):
CREATE POLICY "operador_update_invoice_no_siigo" ON invoices
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt() ->> 'role' = 'operador'
    AND DATE(created_at AT TIME ZONE 'America/Bogota') = CURRENT_DATE
  )
  WITH CHECK (
    -- Solo permite cambiar campos no-Siigo
    siigo_status = (SELECT siigo_status FROM invoices i WHERE i.id = invoices.id)
    AND siigo_id IS NOT DISTINCT FROM (SELECT siigo_id FROM invoices i WHERE i.id = invoices.id)
    AND siigo_number IS NOT DISTINCT FROM (SELECT siigo_number FROM invoices i WHERE i.id = invoices.id)
    AND siigo_cufe IS NOT DISTINCT FROM (SELECT siigo_cufe FROM invoices i WHERE i.id = invoices.id)
  );
```

> **Decisión pendiente**: si la complejidad del WITH CHECK es excesiva, alternativa = revocar UPDATE directo a operador en `invoices` y exigir que toda mutación pase por una EF (ya pasa, en la práctica). Validar al implementar S2.

## Tests

`parqueadero-backend/supabase/tests/rls/04_siigo_audit_immutable.test.sql`:
- `service_role` puede INSERT en `siigo_invoice_attempts`.
- `service_role` no puede UPDATE/DELETE (trigger lo bloquea).
- `authenticated` (operador, admin, contador) no puede SELECT/INSERT/UPDATE/DELETE.
- `anon` no puede nada.

`parqueadero-backend/supabase/tests/rls/05_siigo_status_trigger.test.sql`:
- Verifica que el trigger `sync_dian_from_siigo` deriva `dian_status` correctamente.
- Casos: `pending`, `InProcess`, `Sent`, `Stamped`, `Rejected`, `queued_offline`, `error_max_retries`.
- Verifica que `siigo_cufe` se espeja a `dian_cufe` y `cufe`.

`parqueadero-backend/supabase/tests/rls/06_siigo_auth_tokens.test.sql` (nuevo, opcional pero recomendado):
- `service_role` puede leer/escribir.
- Cualquier otro rol obtiene 0 filas / DENIED.

## Verificación

```bash
cd parqueadero-backend
supabase db reset
psql "$SUPABASE_DB_URL" -f supabase/tests/rls/04_siigo_audit_immutable.test.sql
psql "$SUPABASE_DB_URL" -f supabase/tests/rls/05_siigo_status_trigger.test.sql
psql "$SUPABASE_DB_URL" -f supabase/tests/rls/06_siigo_auth_tokens.test.sql
```

Salida esperada: cada `RAISE NOTICE 'PASS: ...'` + ningún `RAISE EXCEPTION`.
