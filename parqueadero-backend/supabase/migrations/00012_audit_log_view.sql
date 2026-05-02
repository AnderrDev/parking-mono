-- Migration 00012: vista v_audit_log con nombre de usuario desnormalizado.
-- Fecha: 2026-05-01
--
-- Motivo: audit_log.user_id no tiene FK a users por diseño (el log debe
-- sobrevivir si el usuario se elimina). PostgREST no puede hacer el join
-- automático sin FK, lo que causa PGRST200 al consultar usuarios(nombre).
-- La vista resuelve esto sin comprometer el invariante append-only de la tabla.

CREATE OR REPLACE VIEW v_audit_log AS
SELECT
  a.id,
  a.user_id,
  u.nombre     AS user_name,
  a.action,
  a.entity_type,
  a.entity_id,
  a.before_json,
  a.after_json,
  a.created_at
FROM audit_log a
LEFT JOIN users u ON u.id = a.user_id;

-- RLS: misma visibilidad que audit_log — solo admin y contador pueden leer.
ALTER VIEW v_audit_log OWNER TO postgres;

GRANT SELECT ON v_audit_log TO authenticated;

NOTIFY pgrst, 'reload schema';
