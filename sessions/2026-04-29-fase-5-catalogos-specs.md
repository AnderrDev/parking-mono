# Sesión: Fase 5 — Catálogos admin (specs + implementación)

**Fecha:** 2026-04-29  
**Estado:** completada  
**Rama:** main

---

## Objetivos

Crear 16 specs + implementar los 4 catálogos admin completos (domain → data → presentation).

---

## Avance

### Specs creados (16 specs)

- [x] tariffs — list, create, update, deactivate
- [x] customers — list, create, update, deactivate
- [x] vehicles — list, create, update, deactivate
- [x] monthly-plans — list, create, update, deactivate

### Implementación completa

**tariffs** ✅
- `TariffEntity` extendida con `scheduleJson`, `validFrom`, `validTo`
- `TariffRepository` abstract + `ListTariffsUseCase`, `CreateTariffUseCase`, `UpdateTariffUseCase`, `DeactivateTariffUseCase`
- `TariffRemoteDataSource`, `TariffLocalDataSource` (stub), `TariffRepositoryImpl`
- `TariffForms`, `TariffEditDialogComponent`, `TariffsListPageComponent`
- DI tokens en `injection-tokens.ts`, lazy route en `tariffs.routes.ts`

**customers** ✅
- `CustomerEntity` nueva con `DocType`, campos DIAN
- `CustomerRepository` abstract + 4 use cases
- `CustomerRemoteDataSource`, `CustomerLocalDataSource`, `CustomerRepositoryImpl`
- `CustomerForms`, `CustomerEditDialogComponent`, `CustomersListPageComponent`
- DI tokens, lazy route en `customers.routes.ts`

**monthly-plans** ✅
- `MonthlyPlanEntity` extendida con `amountCents`, `autoRenew`, `paymentTokenId`, `isDeleted`
- `MonthlyPlanRepository` abstract + `ListMonthlyPlansUseCase`, `CreateMonthlyPlanUseCase`, `UpdateMonthlyPlanUseCase`, `CancelMonthlyPlanUseCase`
- `MonthlyPlanRemoteDataSource`, local stub, `MonthlyPlanRepositoryImpl`
- `MonthlyPlanForms`, `MonthlyPlanEditDialogComponent`, `MonthlyPlansListPageComponent`
- DI tokens, lazy route en `monthly-plans.routes.ts`
- **Nota:** Edge Function `renew-monthly` pendiente (cron diario)

**vehicles** ✅
- `VehicleEntity` extendida con `ownerCustomerId`, `isDeleted`
- `VehicleRepository` abstract + 4 use cases
- `VehicleRemoteDataSource`, local stub, `VehicleRepositoryImpl`
- `VehicleForms`, `VehicleEditDialogComponent`, `VehiclesListPageComponent`
- DI tokens, lazy route en `vehicles.routes.ts`, nav item en sidebar, ruta `/vehicles` en `app.routes.ts`

### Side fixes
- `AppComponent`: sidebar oculto en rutas `/auth`
- `MonthlyPlanModel`: añadidos `amount_cents`, `auto_renew`, `payment_token_id`, `_deleted`
- `VehicleModel`: añadidos `owner_customer_id`, `_deleted`
- `tsc --noEmit`: 0 errores en toda la sesión al cierre

---

## Pendiente Fase 5

- [x] Edge Function `renew-monthly` — `supabase/functions/renew-monthly/index.ts` implementada
  - Busca planes `expired` + `auto_renew=true` cuyo `end_date = ayer`
  - Crea nuevo plan con misma duración; status calculado (≤5 días → expiring)
  - Audit_log via trigger automático `trg_monthly_plans_audit`
  - Invocar: `supabase functions invoke renew-monthly --no-verify-jwt`

## Next Steps

**Fase 5 DoD** casi completa — falta solo `renew-monthly` Edge Function.  
Siguiente: **Fase 6 — Cierre de caja + payments**.  
Skills: `angular-architect`, `supabase-expert`.  
Empezar creando specs en `specs/features/cashier/` y `specs/features/payments/`.
