-- Migration 00001: extensions, helpers, audit_log, sequence
-- Spec: specs/database-schema.spec.md (Secuencias, audit_log, naming)
--       specs/rls-policies.spec.md (audit_log doble defensa)

BEGIN;

-- =============================================
-- 1. Extensions
-- =============================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================
-- 2. Generic updated_at trigger function
-- =============================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_updated_at IS
  'Trigger BEFORE UPDATE: actualiza updated_at = now() en cualquier tabla con esa columna.';

-- =============================================
-- 3. audit_log table (append-only, sin FK a users — preservar log si user se borra)
-- =============================================
CREATE TABLE audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID,
  action       TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'VIEW')),
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  before_json  JSONB,
  after_json   JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_entity  ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_user    ON audit_log (user_id);
CREATE INDEX idx_audit_log_created ON audit_log (created_at DESC);

COMMENT ON TABLE audit_log IS 'Bitácora inmutable de cambios sensibles. APPEND-ONLY: triggers bloquean UPDATE/DELETE.';

-- =============================================
-- 4. Trigger: bloquea UPDATE y DELETE sobre audit_log
--    (defensa contra service_role que bypassa RLS)
-- =============================================
CREATE OR REPLACE FUNCTION audit_log_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log es append-only: operación % no permitida', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_log_prevent_mutation();

CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_log_prevent_mutation();

-- =============================================
-- 5. Generic write_audit_log() trigger function
--    SECURITY DEFINER: corre como owner para bypassar RLS de audit_log al insertar.
-- =============================================
CREATE OR REPLACE FUNCTION write_audit_log()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id   UUID;
  v_entity_id UUID;
BEGIN
  -- auth.uid() puede no existir en contextos donde Supabase Auth no está cargado
  -- (p.ej. seeds), así que usamos lookup defensivo.
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_entity_id := COALESCE(NEW.id, OLD.id);

  INSERT INTO audit_log (user_id, action, entity_type, entity_id, before_json, after_json)
  VALUES (
    v_user_id,
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION write_audit_log IS
  'AFTER trigger genérico para tablas sensibles. Inserta en audit_log con auth.uid() actual.';

-- =============================================
-- 6. Sequence + función para numeración server-side de facturas
-- =============================================
CREATE SEQUENCE invoice_number_seq START 1;

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

COMMENT ON FUNCTION assign_invoice_number IS
  'BEFORE INSERT en invoices: asigna number si viene NULL. Idempotente — respeta number explícito (Edge Function puede sobreescribir).';

-- =============================================
-- 7. RLS de audit_log (sin FORCE para que SECURITY DEFINER pueda insertar)
-- =============================================
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: solo admin y contador (vía claim 'role' del JWT — depende de hook Fase 3)
CREATE POLICY "audit_log_admin_contador_read" ON audit_log
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'contador'));

-- INSERT/UPDATE/DELETE: sin policies para clientes → DENY default.
-- Inserciones legítimas vienen de write_audit_log() (SECURITY DEFINER) o service_role.
-- UPDATE/DELETE bloqueados por triggers (incluso para service_role).

COMMIT;
