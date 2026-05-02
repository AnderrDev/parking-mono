# Spec: Schema delta — Integración Siigo (Fase 11 / S2)

## Identificador
`backend/database-schema-siigo-delta`

## Descripción
Define los cambios de schema necesarios para soportar la integración con Siigo. **Anexo** a `database-schema.spec.md` — no lo reemplaza. Las migrations resultantes son `00013_siigo_integration.sql` y `00014_siigo_polling_cron.sql`.

## Migration `00013_siigo_integration.sql`

### A. Renombre y nuevas columnas en `invoices`

```sql
-- Renombrar el número interno (operacional) para liberar 'number' visualmente al consecutivo Siigo
ALTER TABLE invoices RENAME COLUMN number TO internal_number;

-- Nuevas columnas Siigo
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS siigo_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS siigo_number TEXT,
  ADD COLUMN IF NOT EXISTS siigo_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (siigo_status IN (
      'pending', 'InProcess', 'Sent', 'Stamped', 'Rejected',
      'queued_offline', 'error_max_retries'
    )),
  ADD COLUMN IF NOT EXISTS siigo_observations JSONB,
  ADD COLUMN IF NOT EXISTS siigo_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS siigo_xml_url TEXT,
  ADD COLUMN IF NOT EXISTS siigo_qr_url TEXT,
  ADD COLUMN IF NOT EXISTS siigo_cufe TEXT,
  ADD COLUMN IF NOT EXISTS siigo_cude TEXT,
  ADD COLUMN IF NOT EXISTS siigo_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS siigo_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS siigo_last_error TEXT,
  ADD COLUMN IF NOT EXISTS requested_invoice BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_invoices_siigo_status_attempts
  ON invoices (siigo_status, siigo_attempts)
  WHERE siigo_status IN ('pending', 'InProcess', 'Sent');

CREATE INDEX IF NOT EXISTS idx_invoices_siigo_id
  ON invoices (siigo_id)
  WHERE siigo_id IS NOT NULL;
```

**Conservar** `dian_status`, `dian_cufe`, `dian_xml_url`, `dian_pdf_url` y `cufe` para no romper queries históricas. El trigger más abajo los deriva.

### B. Trigger derivación `dian_status` ← `siigo_status`

```sql
CREATE OR REPLACE FUNCTION sync_dian_from_siigo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Mapeo determinista
  NEW.dian_status := CASE NEW.siigo_status
    WHEN 'Stamped'            THEN 'accepted'
    WHEN 'Rejected'           THEN 'rejected'
    WHEN 'pending'            THEN 'pending'
    WHEN 'InProcess'          THEN 'sent'
    WHEN 'Sent'               THEN 'sent'
    WHEN 'queued_offline'     THEN 'contingency'
    WHEN 'error_max_retries'  THEN 'contingency'
    ELSE 'pending'
  END;

  -- Reflejar identificadores Siigo en columnas legacy si están vacías
  IF NEW.siigo_cufe IS NOT NULL THEN
    NEW.dian_cufe := NEW.siigo_cufe;
    NEW.cufe := COALESCE(NEW.cufe, NEW.siigo_cufe);
  END IF;
  IF NEW.siigo_pdf_url IS NOT NULL THEN
    NEW.dian_pdf_url := NEW.siigo_pdf_url;
  END IF;
  IF NEW.siigo_xml_url IS NOT NULL THEN
    NEW.dian_xml_url := NEW.siigo_xml_url;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoices_sync_dian
BEFORE INSERT OR UPDATE OF siigo_status, siigo_cufe, siigo_pdf_url, siigo_xml_url
ON invoices
FOR EACH ROW EXECUTE FUNCTION sync_dian_from_siigo();
```

**Razón**: queries actuales filtran por `dian_status='accepted'`, leen `dian_cufe`, etc. El trigger garantiza que esos campos sigan siendo verdad sin tocar el código existente.

### C. Nuevas columnas en `customers`

```sql
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS siigo_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS siigo_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS siigo_sync_error TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_siigo_id
  ON customers (siigo_customer_id)
  WHERE siigo_customer_id IS NOT NULL;
```

### D. Tabla `siigo_invoice_attempts` (audit, append-only)

```sql
CREATE TABLE siigo_invoice_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID REFERENCES invoices(id) ON DELETE CASCADE,
  attempt_number  INTEGER NOT NULL,
  operation       TEXT NOT NULL CHECK (operation IN ('auth','customer_upsert','emit','poll')),
  http_method     TEXT,
  http_url        TEXT,
  http_status     INTEGER,
  request_body    JSONB,                   -- Sanitizado (sin tokens ni access_key)
  response_body   JSONB,                   -- Sanitizado
  latency_ms      INTEGER,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_siigo_attempts_invoice ON siigo_invoice_attempts(invoice_id, created_at DESC);
CREATE INDEX idx_siigo_attempts_operation ON siigo_invoice_attempts(operation, created_at DESC);
```

**Append-only**: trigger que rechaza UPDATE/DELETE (mismo patrón que `audit_log` existente).

```sql
CREATE OR REPLACE FUNCTION block_siigo_attempts_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'siigo_invoice_attempts is append-only';
END;
$$;

CREATE TRIGGER trg_siigo_attempts_no_update
BEFORE UPDATE ON siigo_invoice_attempts
FOR EACH ROW EXECUTE FUNCTION block_siigo_attempts_mutation();

CREATE TRIGGER trg_siigo_attempts_no_delete
BEFORE DELETE ON siigo_invoice_attempts
FOR EACH ROW EXECUTE FUNCTION block_siigo_attempts_mutation();
```

### E. Tabla `siigo_auth_tokens` (single-row cache)

```sql
CREATE TABLE siigo_auth_tokens (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token  TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`CHECK (id = 1)` garantiza una sola fila. Cualquier UPSERT debe usar `id=1`.

### F. Función `get_invoices_for_polling(p_limit INT)`

```sql
CREATE OR REPLACE FUNCTION get_invoices_for_polling(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  id UUID,
  siigo_id TEXT,
  siigo_status TEXT,
  siigo_attempts INTEGER,
  siigo_last_attempt_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, siigo_id, siigo_status, siigo_attempts, siigo_last_attempt_at
  FROM invoices
  WHERE siigo_status IN ('pending', 'InProcess', 'Sent')
    AND siigo_id IS NOT NULL
    AND siigo_attempts < COALESCE(current_setting('app.siigo_poll_max_retries', true)::int, 30)
    AND (
      siigo_last_attempt_at IS NULL
      OR siigo_last_attempt_at < now() - (LEAST(POWER(siigo_attempts, 2) * 5, 300) || ' seconds')::interval
    )
  ORDER BY siigo_last_attempt_at NULLS FIRST, created_at ASC
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED;
$$;

REVOKE ALL ON FUNCTION get_invoices_for_polling(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_invoices_for_polling(INTEGER) TO service_role;
```

**Notas**:
- `FOR UPDATE SKIP LOCKED` permite que cron concurrente reparta filas sin colisión.
- `siigo_id IS NOT NULL` excluye facturas que fallaron en la emisión inicial (no se pueden polling sin id Siigo).
- El backoff `min(attempts² × 5, 300)` está alineado con el spec del cron.

### G. Comentarios documentales en columnas

```sql
COMMENT ON COLUMN invoices.internal_number   IS 'Consecutivo operacional propio (FAC-YYYY-MM-DD-NNNNNN). Para tickets/audit. NO es el consecutivo fiscal DIAN.';
COMMENT ON COLUMN invoices.siigo_number      IS 'Consecutivo fiscal asignado por Siigo (es el válido para DIAN).';
COMMENT ON COLUMN invoices.siigo_status      IS 'Estado en Siigo. dian_status se deriva via trigger.';
COMMENT ON COLUMN invoices.requested_invoice IS 'TRUE solo si el cliente pidió FE; FALSE = ticket POS interno.';
COMMENT ON COLUMN invoices.dian_status       IS 'DERIVED — se actualiza via trigger sync_dian_from_siigo. NO escribir directo.';
```

## Migration `00014_siigo_polling_cron.sql`

Ver spec `siigo-poll-status.spec.md` §"Cron job". Resumen:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'siigo-poll-every-30s',
  '30 seconds',
  $$ SELECT net.http_post(
       url := current_setting('app.siigo_poll_url'),
       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'), 'Content-Type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 25000
     ); $$
);
```

**Setup post-deploy** (manual, una vez por entorno; documentar en `parqueadero-backend/README.md`):

```sql
-- Solo el admin productivo (Supabase service_role o psql con superuser):
ALTER DATABASE postgres SET app.siigo_poll_url = 'https://<ref>.supabase.co/functions/v1/siigo-poll-status';
ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';
ALTER DATABASE postgres SET app.siigo_poll_max_retries = '30';
```

## RLS

Ver spec separada `rls-policies-siigo.spec.md`. Resumen:
- `siigo_invoice_attempts`: solo `service_role`. `authenticated` y `anon` denegados.
- `siigo_auth_tokens`: solo `service_role`. Denegado para todos los demás.
- Columnas nuevas en `invoices` y `customers`: heredan las policies existentes (no requieren cambio porque ya hay policies por rol sobre la tabla; las columnas nuevas se cubren).

## Compatibilidad hacia atrás

| Query / código actual | ¿Sigue funcionando? | Por qué |
|---|---|---|
| `SELECT number FROM invoices` | ❌ | Renombrado. Hay que actualizar todo el código que lo lee. |
| `SELECT internal_number FROM invoices` | ✅ | Nuevo nombre. |
| `SELECT dian_status FROM invoices` | ✅ | Trigger lo mantiene. |
| `SELECT cufe, dian_cufe FROM invoices` | ✅ | Trigger los espeja desde `siigo_cufe`. |
| `SELECT dian_pdf_url FROM invoices` | ✅ | Trigger lo espeja desde `siigo_pdf_url`. |
| EF `request-invoice` actual | ❌ | Inserta `number`, ahora se llama `internal_number`. Se mantiene la EF hasta S9 (cutover); en ese momento se elimina. |

**Acción para S2 (junto con la migration)**:
- Actualizar `request-invoice/index.ts` para insertar `internal_number` en lugar de `number`. Es un fix mínimo para no romper en producción mientras coexiste con la nueva EF.
- Buscar referencias a `invoices.number` en el repo (web datasource, mappers) y renombrar — esto va en S6 cuando se renombre `InvoiceEntity.number → internalNumber`.

## Tests RLS sugeridos

`parqueadero-backend/supabase/tests/rls/04_siigo_audit_immutable.test.sql`:
- Insertar fila con `service_role` → OK.
- Tentar UPDATE → debe fallar con `siigo_invoice_attempts is append-only`.
- Tentar DELETE → debe fallar.
- Conectar como `authenticated` → SELECT/INSERT debe ser denegado.

`parqueadero-backend/supabase/tests/rls/05_siigo_status_trigger.test.sql`:
- INSERT invoice con `siigo_status='pending'` → `dian_status='pending'`.
- UPDATE `siigo_status='Stamped'` → `dian_status='accepted'`, `dian_cufe = siigo_cufe`.
- UPDATE `siigo_status='queued_offline'` → `dian_status='contingency'`.

## Verificación local

```bash
cd parqueadero-backend
supabase db reset                        # aplica 00013 y 00014
psql "$SUPABASE_DB_URL" -f supabase/tests/rls/04_siigo_audit_immutable.test.sql
psql "$SUPABASE_DB_URL" -f supabase/tests/rls/05_siigo_status_trigger.test.sql
```
