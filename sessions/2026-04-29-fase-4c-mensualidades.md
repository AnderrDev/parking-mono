# Sesión: Fase 4C — Mensualidades en línea

**Fecha:** 2026-04-29  
**Estado:** completada  
**Rama:** main

---

## Objetivos

Completar Fase 4.C: CheckMonthlyPlanUseCase + tests de cálculo de tarifa + corrección de sidebar en login.

---

## Avance

### Archivos creados

- `domain/usecases/check-monthly-plan.usecase.ts` — thin wrapper sobre `repo.getActivePlanByPlate()`, normaliza placa
- `domain/usecases/check-monthly-plan.usecase.spec.ts` — 5 casos: activo, expiring, null, NetworkFailure, normalización
- `domain/usecases/calculate-parking-fee.usecase.spec.ts` — 13 casos: gracia, mensual, hora, fracción, día, tope diario, unidad inválida, validaciones

### Archivos modificados

- `core/di/injection-tokens.ts` — añadido `CHECK_MONTHLY_PLAN_TOKEN`
- `parking/parking.routes.ts` — registrado `CheckMonthlyPlanUseCase` en providers
- `app.component.ts` — **bug fix**: sidebar ya no se muestra en rutas `/auth/*`

---

## Decisiones técnicas

1. `CheckMonthlyPlanUseCase.execute()` normaliza la placa (uppercase + trim) antes de delegar al repo.
2. El fix del sidebar usa `toSignal` + `Router.events` para detectar la ruta activa. Cuando la URL empieza por `/auth`, se renderiza solo `<router-outlet />` sin shell. Es reactivo: funciona correctamente en transiciones de login → dashboard.

---

## Next Steps

- Fase 5: Catálogos admin — specs primero (16 archivos), luego código por catálogo.
- Orden de specs: tariffs → customers → vehicles → monthly-plans (por dependencias de FK).
