# Sesión: Fase 6 — Implementación completa (caja + payments)

**Fecha:** 2026-04-29  
**Estado:** completada  
**Rama:** main

---

## Objetivos

Implementar el vertical slice completo de Fase 6:
- CashierShiftEntity + CashierRepository + 3 use cases
- PaymentRepository + 2 use cases
- Data layer: modelos, datasources (remote + local stub), repo impl
- DI tokens + rutas actualizadas
- CashierShiftPage (UI de apertura, cuadre, cierre)

---

## Avance

### Domain
- [x] `cashier/domain/entities/cashier-shift.entity.ts` — `CashierShiftEntity` con `isOpen` computed
- [x] `cashier/domain/repositories/cashier.repository.ts` — abstract: `findOpenByUser`, `findById`, `create`, `close`
- [x] `cashier/domain/usecases/open-shift.usecase.ts` — valida saldo ≥ 0, verifica no turno abierto
- [x] `cashier/domain/usecases/close-shift.usecase.ts` — calcula expected/diff, valida justificación si |diff| > $5.000
- [x] `cashier/domain/usecases/reconcile-shift.usecase.ts` — agrupa pagos por método, calcula totales
- [x] `payments/domain/repositories/payment.repository.ts` — abstract: `create`, `list`, `listByShift`, `sumCashByShift`
- [x] `payments/domain/usecases/register-payment.usecase.ts` — valida monto/método, verifica turno open
- [x] `payments/domain/usecases/list-payments.usecase.ts` — valida shiftId|dateFrom requerido, pagina

### Data
- [x] `cashier/data/models/cashier-shift.model.ts` — model + mapper
- [x] `cashier/data/datasources/cashier.datasource.ts` — abstract
- [x] `cashier/data/datasources/cashier-remote.datasource.ts` — Supabase
- [x] `cashier/data/datasources/cashier-local.datasource.ts` — stub CacheFailure hasta Fase 8
- [x] `cashier/data/repositories/cashier.repository.impl.ts`
- [x] `payments/data/datasources/payment.datasource.ts` — abstract
- [x] `payments/data/datasources/payment-remote.datasource.ts` — Supabase con list paginado
- [x] `payments/data/datasources/payment-local.datasource.ts` — stub CacheFailure
- [x] `payments/data/repositories/payment.repository.impl.ts`

### DI + Routes
- [x] `core/di/injection-tokens.ts` — 11 tokens nuevos (cashier: 6, payments: 5)
- [x] `cashier/cashier.routes.ts` — providers completos + CashierShiftPageComponent
- [x] `payments/payments.routes.ts` — providers completos (placeholder page por ahora)

### Presentation
- [x] `cashier/presentation/forms/cashier.forms.ts` — openShiftForm + closeShiftForm
- [x] `cashier/presentation/pages/cashier-shift.page.ts` — 3 views: loading / no-shift / open-shift con cuadre y cierre

### Verificación
- [x] `tsc --noEmit` — 0 errores

---

## Errores encontrados y soluciones

1. `Left<Failure, Y> as Either<Failure, X>` → TS2352: usar `left(result.value)` para propagar failures cross-tipo
2. `AuthService` no existe → es `AuthStateService` en `core/services/auth-state.service.ts`

---

## Notas

- `PaymentEntity` y `PaymentModel`/`PaymentMapper` reutilizados desde `parking/` feature (no duplicados)
- `CloseShiftUseCase` depende de `PaymentRepository` para `sumCashByShift()` — cross-feature aceptable en use case
- Los pagos creados por `RegisterVehicleExitUseCase` usan el flow del parking datasource (ya funciona); `RegisterPaymentUseCase` es el punto de entrada directo para pagos sin salida de vehículo (Fase 7+)

---

## Next Steps

- Fase 4.C pendiente: `CheckMonthlyPlanUseCase` + tests (ver plan en `.claude/plans/`)
- Guard `requireOpenShift` para rutas parking (mejora UX, el use case ya valida)
- Supabase migration: verificar que `cashier_shifts` tiene las columnas `expected_balance_cents`, `difference_cents`, `justification`, `closed_at`
