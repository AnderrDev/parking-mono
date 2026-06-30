# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚦 Boot (lazy — lee solo lo que el task exige)

1. Consulta la **fase activa** en `PLAN.md` (busca `**Fase actual:**`) solo si vas a avanzar tareas de fase.
2. Lee la **última sesión** en `sessions/` solo si necesitas contexto de trabajo previo.
3. Lee el **`CLAUDE.md` del subproyecto** donde trabajarás antes de tocar código en él.

Las reglas absolutas y la fase activa ya llegan vía hooks en cada turno — no las releas aquí.

---

## Monorepo Layout

| Subproject | Stack | Doc |
|---|---|---|
| `parqueadero-web/` | Angular 18 SPA, TypeScript, SCSS, online-only | `parqueadero-web/CLAUDE.md` |
| `parqueadero-backend/` | Supabase (PostgreSQL + RLS + Deno Edge Functions) | `parqueadero-backend/CLAUDE.md` |

## Spec-Driven Development (regla de proyecto)

Ciclo fijo — nada se implementa sin spec:

```
SPEC → CONTRATO → TEST → IMPLEMENT → REVIEW
```

Si el spec no existe, créalo y confirma antes de codear. Si el código diverge del spec, actualiza el spec primero.

Specs existentes (extiende, no duplices):
- `parqueadero-web/specs/features/parking/*.spec.md` (5 use cases)
- `parqueadero-web/specs/components/*.spec.md` (3 components)
- `parqueadero-backend/specs/database-schema.spec.md`, `rls-policies.spec.md`

## Clean Architecture

**Regla inviolable: `domain/` nunca importa desde `data/` ni `presentation/`.**

```
Presentation → Domain ← Data
```

Patrones compartidos:
- **`Either<Failure, Result>`** en todos los use cases y repositorios. Sin `throw`/`raise` para control de flujo. Subclases: `ValidationFailure`, `BusinessRuleFailure`, `NotFoundFailure`, `NetworkFailure`, `ServerFailure`.
- **Repository pattern**: abstracto en `domain/repositories/`, implementación en `data/repositories/`; en web las operaciones son online-only contra Supabase.
- **Entity vs Model**: `XxxEntity` (camelCase, domain) ↔ `XxxModel` (snake_case, DB DTO) ↔ `XxxMapper`.
- **UseCase**: método único `execute(params) → Either[Failure, Result]`.

Convenciones de nombres por subproyecto en cada `CLAUDE.md` (Angular: `kebab-case.tipo.ts`; Python: `snake_case.py`).

## Reglas de negocio no negociables

1. Una placa = una sesión activa (`UNIQUE(vehicle_plate) WHERE status='active'`).
2. Minutos de gracia: sin cobro si sale antes del umbral configurado.
3. Tope diario: nunca cobrar más del techo configurado.
4. Plan mensual activo = sesión gratuita.
5. Numeración de tickets internos: solo el servidor (Edge Function), nunca el cliente.
6. Online-only: sin conexión se retorna `NetworkFailure`; no se persiste operación local.
7. Cambios sensibles van a `audit_log` (append-only).

> **Out of scope:** facturación electrónica DIAN/Siigo (descartada el 2026-05-20). El parqueadero opera como POS con ticket interno numerado, sin firma XAdES ni CUFE.

## Notas de trabajo

- Un subproyecto a la vez. Cambios cross-subproject requieren actualizar specs en **todos** los `specs/` afectados antes de codear.
- Idioma: comentarios, specs y copy en **español colombiano**. Identificadores de código en inglés.
- Moneda: `*_cents` integers (COP). Hora: UTC-5 (Colombia).
- Sesiones: una entrada `sessions/YYYY-MM-DD-<slug>.md` por sesión (plantilla en `sessions/README.md`). Actualizar al cerrar con `Estado: completada` + Next Steps.
- Skills: `angular-architect`, `supabase-expert`, `frontend-quality`, `ui-ux-parqueadero`. Invocar cuando el trabajo lo requiera, no al inicio de cada sesión.
- Comandos de build/test/deploy: ver el `CLAUDE.md` del subproyecto correspondiente.
