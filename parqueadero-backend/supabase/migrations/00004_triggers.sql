-- Migration 00004: triggers (updated_at, audit, invoice numbering)
-- Spec: specs/database-schema.spec.md
-- Las funciones set_updated_at(), write_audit_log() y assign_invoice_number()
-- se definieron en 00001.

BEGIN;

-- ============================================================================
-- updated_at en todas las tablas con la columna
-- ============================================================================
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tariffs_updated_at
  BEFORE UPDATE ON tariffs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_monthly_plans_updated_at
  BEFORE UPDATE ON monthly_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cashier_shifts_updated_at
  BEFORE UPDATE ON cashier_shifts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_parking_sessions_updated_at
  BEFORE UPDATE ON parking_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_invoice_lines_updated_at
  BEFORE UPDATE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- audit_log triggers en tablas sensibles
-- (Spec rls-policies §"Triggers para Audit Log")
-- ============================================================================
CREATE TRIGGER trg_parking_sessions_audit
  AFTER INSERT OR UPDATE OR DELETE ON parking_sessions
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER trg_payments_audit
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER trg_invoices_audit
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER trg_monthly_plans_audit
  AFTER INSERT OR UPDATE OR DELETE ON monthly_plans
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER trg_cashier_shifts_audit
  AFTER INSERT OR UPDATE OR DELETE ON cashier_shifts
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

-- ============================================================================
-- assign_invoice_number BEFORE INSERT en invoices
-- ============================================================================
CREATE TRIGGER trg_invoices_assign_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION assign_invoice_number();

COMMIT;
