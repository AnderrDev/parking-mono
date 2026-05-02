-- Migration 00013: Integración Siigo (Fase 11 / S2)
-- Spec: specs/database-schema-siigo-delta.spec.md
--       specs/rls-policies-siigo.spec.md
--
-- Cambios:
--   1. Renombrar invoices.number → invoices.internal_number (consecutivo operacional).
--   2. Añadir columnas siigo_* a invoices (consecutivo y estado fiscal).
--   3. Añadir columnas siigo_* a customers (mapeo a tercero en Siigo).
--   4. Tabla siigo_invoice_attempts (append-only, auditoría de llamadas HTTP).
--   5. Tabla siigo_auth_tokens (cache single-row del bearer Siigo, 24 h).
--   6. Función get_invoices_for_polling() para el cron siigo-poll-status.
--   7. Trigger sync_dian_from_siigo: deriva dian_status desde siigo_status (compat).
--   8. RLS service_role-only en las dos tablas nuevas + revoke de la función.
--   9. Adaptación de assign_invoice_number() (definida en 00001) al rename.

BEGIN;

-- =============================================================================
-- 1. Renombrar invoices.number → invoices.internal_number
--    Es el consecutivo operacional propio (FAC-YYYY-MM-DD-NNNN). NO es el
--    consecutivo fiscal — ese lo asigna Siigo.
-- =============================================================================
ALTER TABLE invoices RENAME COLUMN number TO internal_number;

-- Re-renombrar la constraint UNIQUE auto-generada por el RENAME (Postgres no lo hace)
ALTER TABLE invoices RENAME CONSTRAINT invoices_number_key TO invoices_internal_number_key;

-- Adaptar la función assign_invoice_number (definida en 00001) al nuevo nombre.
-- Sigue idempotente: solo asigna si NEW.internal_number IS NULL.
CREATE OR REPLACE FUNCTION assign_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.internal_number IS NULL THEN
    NEW.internal_number := 'FAC-'
      || TO_CHAR(now() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD')
      || '-'
      || LPAD(nextval('invoice_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION assign_invoice_number IS
  'BEFORE INSERT en invoices: asigna internal_number si viene NULL. Idempotente — la Edge Function suele asignarlo explícitamente.';

-- =============================================================================
-- 2. Columnas siigo_* en invoices
-- =============================================================================
ALTER TABLE invoices
  ADD COLUMN siigo_id              TEXT UNIQUE,
  ADD COLUMN siigo_number          TEXT,
  ADD COLUMN siigo_status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (siigo_status IN (
      'pending', 'InProcess', 'Sent', 'Stamped', 'Rejected',
      'queued_offline', 'error_max_retries'
    )),
  ADD COLUMN siigo_observations    JSONB,
  ADD COLUMN siigo_pdf_url         TEXT,
  ADD COLUMN siigo_xml_url         TEXT,
  ADD COLUMN siigo_qr_url          TEXT,
  ADD COLUMN siigo_cufe            TEXT,
  ADD COLUMN siigo_cude            TEXT,
  ADD COLUMN siigo_attempts        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN siigo_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN siigo_last_error      TEXT,
  ADD COLUMN requested_invoice     BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_invoices_siigo_status_attempts
  ON invoices (siigo_status, siigo_attempts)
  WHERE siigo_status IN ('pending', 'InProcess', 'Sent');

CREATE INDEX idx_invoices_siigo_id
  ON invoices (siigo_id)
  WHERE siigo_id IS NOT NULL;

COMMENT ON COLUMN invoices.internal_number   IS
  'Consecutivo operacional propio (FAC-YYYY-MM-DD-NNNN). Para tickets/auditoría/offline. NO es el consecutivo fiscal DIAN.';
COMMENT ON COLUMN invoices.siigo_id          IS
  'ID interno de Siigo (UUID/string) para hacer GET /v1/invoices/{id} en polling.';
COMMENT ON COLUMN invoices.siigo_number      IS
  'Consecutivo fiscal asignado por Siigo (es el válido para DIAN).';
COMMENT ON COLUMN invoices.siigo_status      IS
  'Estado en Siigo. dian_status se deriva via trigger sync_dian_from_siigo.';
COMMENT ON COLUMN invoices.requested_invoice IS
  'TRUE solo si el cliente pidió FE; FALSE = ticket POS interno.';
COMMENT ON COLUMN invoices.dian_status       IS
  'DERIVED — se actualiza via trigger sync_dian_from_siigo desde siigo_status. NO escribir directo desde fuera del trigger.';

-- =============================================================================
-- 3. Trigger sync_dian_from_siigo
--    Mantiene los campos legacy (dian_status, dian_cufe, dian_xml_url,
--    dian_pdf_url, cufe) sincronizados desde siigo_*. Esto preserva queries y
--    reportes históricos sin tocar código.
-- =============================================================================
CREATE OR REPLACE FUNCTION sync_dian_from_siigo()
RETURNS TRIGGER AS $$
BEGIN
  NEW.dian_status := CASE NEW.siigo_status
    WHEN 'Stamped'           THEN 'accepted'
    WHEN 'Rejected'          THEN 'rejected'
    WHEN 'pending'           THEN 'pending'
    WHEN 'InProcess'         THEN 'sent'
    WHEN 'Sent'              THEN 'sent'
    WHEN 'queued_offline'    THEN 'contingency'
    WHEN 'error_max_retries' THEN 'contingency'
    ELSE 'pending'
  END;

  IF NEW.siigo_cufe IS NOT NULL THEN
    NEW.dian_cufe := NEW.siigo_cufe;
    NEW.cufe      := COALESCE(NEW.cufe, NEW.siigo_cufe);
  END IF;
  IF NEW.siigo_pdf_url IS NOT NULL THEN
    NEW.dian_pdf_url := NEW.siigo_pdf_url;
  END IF;
  IF NEW.siigo_xml_url IS NOT NULL THEN
    NEW.dian_xml_url := NEW.siigo_xml_url;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_dian_from_siigo IS
  'BEFORE INSERT/UPDATE en invoices: deriva dian_status desde siigo_status y espeja siigo_cufe/pdf/xml a campos legacy.';

-- Nombrado entre 'assign_number' (a) y 'updated_at' (u) para que corra en
-- orden alfabético en la cadena BEFORE: a → s → u.
CREATE TRIGGER trg_invoices_sync_dian
  BEFORE INSERT OR UPDATE OF siigo_status, siigo_cufe, siigo_pdf_url, siigo_xml_url
  ON invoices
  FOR EACH ROW EXECUTE FUNCTION sync_dian_from_siigo();

-- =============================================================================
-- 4. Columnas siigo_* en customers
-- =============================================================================
ALTER TABLE customers
  ADD COLUMN siigo_customer_id TEXT UNIQUE,
  ADD COLUMN siigo_synced_at   TIMESTAMPTZ,
  ADD COLUMN siigo_sync_error  TEXT;

CREATE INDEX idx_customers_siigo_id
  ON customers (siigo_customer_id)
  WHERE siigo_customer_id IS NOT NULL;

COMMENT ON COLUMN customers.siigo_customer_id IS
  'ID del tercero en Siigo (cuenta del cliente). Se crea on-demand al primer POST /v1/customers.';

-- =============================================================================
-- 5. Tabla siigo_invoice_attempts (append-only, auditoría)
--    Registra cada llamada HTTP a Siigo (auth, customer_upsert, emit, poll).
--    Sanitización de tokens/access_key se hace en el cliente HTTP antes de insertar.
-- =============================================================================
CREATE TABLE siigo_invoice_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID REFERENCES invoices(id) ON DELETE CASCADE,
  attempt_number  INTEGER NOT NULL,
  operation       TEXT NOT NULL CHECK (operation IN ('auth', 'customer_upsert', 'emit', 'poll')),
  http_method     TEXT,
  http_url        TEXT,
  http_status     INTEGER,
  request_body    JSONB,
  response_body   JSONB,
  latency_ms      INTEGER,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_siigo_attempts_invoice   ON siigo_invoice_attempts (invoice_id, created_at DESC);
CREATE INDEX idx_siigo_attempts_operation ON siigo_invoice_attempts (operation, created_at DESC);

COMMENT ON TABLE siigo_invoice_attempts IS
  'Auditoría append-only de cada llamada HTTP al API Siigo. UPDATE/DELETE bloqueados por trigger.';

-- Trigger que bloquea UPDATE y DELETE (defensa adicional incluso para service_role).
CREATE OR REPLACE FUNCTION siigo_attempts_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'siigo_invoice_attempts es append-only: operación % no permitida', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_siigo_attempts_no_update
  BEFORE UPDATE ON siigo_invoice_attempts
  FOR EACH STATEMENT
  EXECUTE FUNCTION siigo_attempts_prevent_mutation();

CREATE TRIGGER trg_siigo_attempts_no_delete
  BEFORE DELETE ON siigo_invoice_attempts
  FOR EACH STATEMENT
  EXECUTE FUNCTION siigo_attempts_prevent_mutation();

-- =============================================================================
-- 6. Tabla siigo_auth_tokens (cache bearer ~24 h)
--    CHECK (id = 1) garantiza una sola fila — siempre se hace UPSERT con id=1.
-- =============================================================================
CREATE TABLE siigo_auth_tokens (
  id           INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE siigo_auth_tokens IS
  'Cache single-row del bearer token Siigo (vence 24 h). UPSERT con id=1. Solo service_role accede.';

-- =============================================================================
-- 7. Función get_invoices_for_polling(p_limit)
--    Llamada por el cron siigo-poll-status. Selecciona invoices no terminales,
--    aplica backoff `min(attempts² × 5, 300)s`, usa FOR UPDATE SKIP LOCKED para
--    repartir filas entre invocaciones concurrentes del cron.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_invoices_for_polling(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  id                    UUID,
  siigo_id              TEXT,
  siigo_status          TEXT,
  siigo_attempts        INTEGER,
  siigo_last_attempt_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.siigo_id, i.siigo_status, i.siigo_attempts, i.siigo_last_attempt_at
  FROM invoices i
  WHERE i.siigo_status IN ('pending', 'InProcess', 'Sent')
    AND i.siigo_id IS NOT NULL
    AND i.siigo_attempts < COALESCE(current_setting('app.siigo_poll_max_retries', true)::int, 30)
    AND (
      i.siigo_last_attempt_at IS NULL
      OR i.siigo_last_attempt_at < now() - (LEAST(POWER(i.siigo_attempts, 2) * 5, 300) || ' seconds')::interval
    )
  ORDER BY i.siigo_last_attempt_at NULLS FIRST, i.created_at ASC
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED;
$$;

COMMENT ON FUNCTION get_invoices_for_polling IS
  'SECURITY DEFINER. Devuelve hasta p_limit invoices listas para polling. FOR UPDATE SKIP LOCKED para evitar doble cron.';

REVOKE ALL ON FUNCTION get_invoices_for_polling(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_invoices_for_polling(INTEGER) TO service_role;

-- =============================================================================
-- 8. RLS de siigo_invoice_attempts
--    Default DENY (sin policies para authenticated/anon). service_role bypassa RLS
--    en Supabase, pero declaramos la policy explícita para documentar y soportar
--    conexiones non-superuser que respeten el modelo.
-- =============================================================================
ALTER TABLE siigo_invoice_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "siigo_attempts_service_role_all" ON siigo_invoice_attempts
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- =============================================================================
-- 9. RLS de siigo_auth_tokens
-- =============================================================================
ALTER TABLE siigo_auth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "siigo_auth_tokens_service_role_all" ON siigo_auth_tokens
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

COMMIT;
