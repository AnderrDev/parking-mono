# Pen-test RLS — Fase 10 Sprint 10D

Suite de **self-pen-test** que ataca PostgREST con JWTs manipulados para validar que las RLS policies bloquean las operaciones que deben bloquear. Es complemento (no sustituto) de la suite SQL en `../rls/`.

## Estrategia

- Construye JWTs HS256 firmados con `SUPABASE_JWT_SECRET` (el de `supabase status` local). Manipula claims (`role`, `user_role`, `sub`, etc.) para emular atacantes.
- Hace `POST/PATCH/DELETE` directos a `http://127.0.0.1:54321/rest/v1/<tabla>` con el JWT manipulado.
- Espera HTTP 4xx (PASS) o reporta FAIL si recibe 2xx.

> **Las policies deben confiar en `public.users.role`, NO en `auth.jwt() ->> 'user_role'`**. Si el pen-test descubre que basta manipular el claim para escalar privilegios, esa es la vulnerabilidad.

## Pre-requisitos

```bash
# Docker arriba + supabase local:
cd parqueadero-backend
supabase start

# Deno instalado (test runner):
deno --version  # >= 1.40
```

## Correr

```bash
./run-pen-test.sh
```

Exit 0 si todo PASS, 1 si algún case FAIL.

## Cases

| # | Case | Lo que ataca | Espera |
|---|---|---|---|
| 01 | operador-as-admin | operador con `user_role=admin` en JWT intenta INSERT en `tariffs` | 403 |
| 02 | operador-cross-shift | operador A intenta cerrar el `cashier_shift` de operador B | 403 |
| 03 | anon-read-invoices | sin JWT (anon) intenta SELECT en `invoices` | 401/403 |
| 04 | operador-write-tariffs | operador con role correcto intenta UPDATE en `tariffs` (admin-only) | 403 |
| 05 | stale-write-bypass | UPDATE sin client_op_id en una tabla mutable | 403/400 |
| 06 | audit-log-immutable | intento UPDATE/DELETE en `audit_log` | 403 |

## Seguridad

**NO** correr contra producción. El secret se manipula, los payloads son sintéticos. Usar solo `supabase start` local.

Para validar producción, replicar manualmente desde Postman/curl con creds reales una vez. Documentar en `sessions/YYYY-MM-DD-pen-test-prod.md`.

## Estado actual (Sprint 10D)

- ✅ Infraestructura (este README + `run-pen-test.sh`).
- ⏳ 2 cases de ejemplo (`01-operador-as-admin.test.ts`, `06-audit-log-immutable.test.ts`).
- ⏳ Cases 02–05 y 07 pendientes — patrón claro, copia el ejemplo.
- ⏳ Validación contra `supabase start` real al iniciar Sprint 10F.
