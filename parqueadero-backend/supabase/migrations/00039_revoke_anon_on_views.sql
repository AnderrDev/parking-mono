-- ──────────────────────────────────────────────────────────────────────────
-- 00039 — Cerrar la lectura anónima de las vistas de reportes y auditoría.
--
-- Hallazgo (auditoría 2026-08-11): las 4 vistas de `public` eran legibles
-- SIN iniciar sesión, usando solo la anon key — que viaja dentro del bundle
-- JS publicado, o sea que es información pública. Verificado con:
--
--   curl "$URL/rest/v1/v_revenue_daily?select=*" -H "apikey: <anon>"
--   → devolvía todos los pagos: monto, método, día, operador y turno.
--   Igual `v_audit_log`, con los before/after JSON completos.
--
-- Por qué las vistas se saltan RLS: son propiedad de `postgres`, que tiene
-- BYPASSRLS, y ninguna se creó con `security_invoker = on`. Una vista sin
-- esa opción resuelve los permisos de las tablas base como su OWNER, no
-- como quien consulta, así que las policies de `payments`, `audit_log`,
-- etc. no se evalúan. Lo único que gobierna el acceso es el GRANT — y
-- Supabase le da por defecto todos los privilegios a `anon`.
--
-- Las tablas base sí estaban protegidas (`payments` como anon devolvía []).
-- El agujero era exclusivo de las vistas.
--
-- Este fix es el mínimo que cierra el hueco sin arriesgar la operación:
-- quita a `anon` de las vistas y deja intacto a `authenticated`, que es el
-- rol con el que la app consulta después del login. Los reportes siguen
-- funcionando igual para admin, contador y operador.
--
-- Pendiente aparte (decisión de negocio, NO incluida acá): con este cambio
-- cualquier usuario logueado sigue viendo todo a través de las vistas, sin
-- importar su rol — un operador puede leer `v_audit_log` completo. La
-- solución de fondo es `ALTER VIEW … SET (security_invoker = on)`, pero eso
-- hace que cada vista evalúe las policies del que consulta y puede vaciar
-- los reportes del operador (p.ej. `cashier_shifts` solo deja ver los turnos
-- propios). Requiere revisar las policies antes, y probar reporte por reporte.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

REVOKE ALL ON public.v_revenue_daily        FROM anon;
REVOKE ALL ON public.v_sessions_by_type     FROM anon;
REVOKE ALL ON public.v_operator_performance FROM anon;
REVOKE ALL ON public.v_audit_log            FROM anon;

-- Nadie escribe a través de las vistas: dejar solo lectura a los logueados.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.v_revenue_daily, public.v_sessions_by_type,
     public.v_operator_performance, public.v_audit_log
  FROM authenticated;

COMMIT;
