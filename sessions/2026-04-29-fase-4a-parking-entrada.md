# Sesión: Fase 4.A — Parking: Entrada de Vehículos

**Fecha:** 2026-04-29
**Subproyecto(s):** parqueadero-web
**Estado:** en progreso

## Objetivos
- [ ] Domain: `ParkingSessionEntity`, `VehicleEntity`, `TariffEntity`, `MonthlyPlanEntity` (stub)
- [ ] Domain: `ParkingRepository` abstract (registerEntry, getActiveSessionByPlate, getActiveSessions)
- [ ] Domain: `SearchVehicleByPlateUseCase`, `RegisterVehicleEntryUseCase`
- [ ] Data: modelos + mappers (snake_case ↔ camelCase)
- [ ] Data: `ParkingDataSource` abstract, `ParkingRemoteDataSource` (Supabase), `ParkingLocalDataSource` (placeholder)
- [ ] Data: `ParkingRepositoryImpl`
- [ ] Presentation: `ParkingForms.createEntryForm()`
- [ ] Presentation: `VehicleEntryFormComponent` (dumb)
- [ ] Presentation: `OperatorDashboardPageComponent` (smart)
- [ ] DI: tokens en `injection-tokens.ts` + providers en `parking.routes.ts`
- [ ] Tests: `register-vehicle-entry.usecase.spec.ts` — happy + 5 edge cases

## Contexto
Fases 0-3 cerradas. Specs leídas:
- `specs/features/parking/register-vehicle-entry.spec.md`
- `specs/features/parking/register-vehicle-exit.spec.md`
- `specs/features/parking/calculate-parking-fee.spec.md`
- `specs/features/parking/get-active-sessions.spec.md`
- `specs/features/parking/search-vehicle-by-plate.spec.md`

Skills activos: angular-architect.

Reglas clave del spec:
- Una placa = una sola sesión activa (BusinessRuleFailure si ya existe)
- Turno de caja abierto obligatorio
- Mensualidad: si existe y está vigente, se asocia a la sesión
- entry_at en UTC
- Offline: guardar en local con _sync_status='pending'

## Avance

### Domain
- [ ] `features/parking/domain/entities/parking-session.entity.ts`
- [ ] `features/parking/domain/entities/vehicle.entity.ts`
- [ ] `features/parking/domain/entities/tariff.entity.ts`
- [ ] `features/parking/domain/entities/monthly-plan.entity.ts`
- [ ] `features/parking/domain/repositories/parking.repository.ts`
- [ ] `features/parking/domain/usecases/search-vehicle-by-plate.usecase.ts`
- [ ] `features/parking/domain/usecases/register-vehicle-entry.usecase.ts`

### Data
- [ ] `features/parking/data/models/parking-session.model.ts`
- [ ] `features/parking/data/models/vehicle.model.ts`
- [ ] `features/parking/data/models/tariff.model.ts`
- [ ] `features/parking/data/datasources/parking.datasource.ts`
- [ ] `features/parking/data/datasources/parking-remote.datasource.ts`
- [ ] `features/parking/data/datasources/parking-local.datasource.ts`
- [ ] `features/parking/data/repositories/parking.repository.impl.ts`

### Presentation
- [ ] `features/parking/presentation/forms/parking.forms.ts`
- [ ] `features/parking/presentation/components/vehicle-entry-form.component.ts`
- [ ] `features/parking/presentation/pages/operator-dashboard.page.ts`
- [ ] `features/parking/parking.routes.ts`

### Tests
- [ ] `features/parking/domain/usecases/register-vehicle-entry.usecase.spec.ts`

## Decisiones
- `ParkingLocalDataSource` es placeholder (Fase 8 implementa PowerSync real)
- `VehicleEntity` se crea desde la placa si no existe previamente en BD
- `MonthlyPlanEntity` incluido como stub para que `RegisterVehicleEntryUseCase` pueda referenciarlo
- `OperatorDashboardPage` usa signals para estado (loading, error, successMessage)
- `VehicleEntryFormComponent` recibe `hasMonthlyPlan` como input para mostrar badge

## Bloqueos / Pendientes
Ninguno al inicio.

## Next Steps
- Fase 4.B — Salida + cobro: CalculateParkingFeeUseCase, RegisterVehicleExitUseCase, VehicleExitDialogComponent, ActiveSessionsTableComponent
