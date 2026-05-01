# Sesión: Integraciones post-Fase 9 + Fase 8 (Offline / PowerSync)

**Fecha:** 2026-04-29  
**Estado:** completada  
**Rama:** main

---

## Objetivo

1. Cerrar deudas técnicas de la Fase 9 (role.guard, emitInvoice, PLAN.md).
2. Implementar Fase 8 completa: PowerSync offline hardening.

---

## Cambios realizados

### Post-Fase 9
- [x] `app.routes.ts` — `/invoicing` y `/reports` protegidos con `requireRole('admin', 'contador')`.
- [x] `parking.forms.ts` — `createExitForm()` añade campo `emitInvoice: false`.
- [x] `vehicle-exit-dialog.component.ts` — checkbox "Emitir factura" + estilos `.form-check`.
- [x] `operator-dashboard.page.ts` — navega a `/invoicing?sessionId=<id>` tras salida exitosa con emitInvoice.
- [x] `PLAN.md` — estado actualizado (Fases 3-9 completadas, Fase 8 = siguiente).

### Fase 8 — PowerSync

#### Infraestructura
- [x] `environments/environment.ts` / `environment.prod.ts` — añadido `powerSyncUrl`.
- [x] `core/services/powersync.schema.ts` — `PARQUEADERO_SCHEMA` con 7 tablas.
- [x] `core/services/powersync.service.ts` — `PowerSyncService` + `SupabasePowerSyncConnector`.
- [x] `app.component.ts` — `void this.powerSync.connect()` en constructor.

#### Local datasources (SQLite real)
- [x] `parking/data/datasources/parking-local.datasource.ts`
- [x] `tariffs/data/datasources/tariff-local.datasource.ts`
- [x] `cashier/data/datasources/cashier-local.datasource.ts`
- [x] `payments/data/datasources/payment-local.datasource.ts`
- [x] `monthly-plans/data/datasources/monthly-plan-local.datasource.ts`
- [x] `customers/data/datasources/customer-local.datasource.ts`
- [x] `vehicles/data/datasources/vehicle-local.datasource.ts`
- [x] `reports/data/datasources/report-local.datasource.ts` — `NetworkFailure` (reports requieren DB views)

#### Repository impls (offline routing)
- [x] `parking/data/repositories/parking.repository.impl.ts`
- [x] `tariffs/data/repositories/tariff.repository.impl.ts`
- [x] `customers/data/repositories/customer.repository.impl.ts`
- [x] `vehicles/data/repositories/vehicle.repository.impl.ts`
- [x] `monthly-plans/data/repositories/monthly-plan.repository.impl.ts`
- [x] `cashier/data/repositories/cashier.repository.impl.ts`
- [x] `payments/data/repositories/payment.repository.impl.ts`

#### Verificación
- [x] `npx tsc --noEmit` → 0 errores

---

## Next Steps

- Configurar `powerSyncUrl` real en Supabase (consola PowerSync) y añadirlo a `environment.prod.ts`.
- Storage bucket `invoices/` en Supabase Studio (pendiente manual Fase 9).
- Iniciar Fase 7 (tarjeta de presentación / PWA icons) o Fase 10 (DIAN producción).
