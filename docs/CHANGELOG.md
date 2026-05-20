# Changelog

Todos los cambios notables a este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog 1.1.0](https://keepachangelog.com/es-ES/1.1.0/)
y este proyecto adhiere a [Semantic Versioning 2.0.0](https://semver.org/lang/es/).

## [Unreleased]

### Added

- **Fase 10 Sprint 10A** — Reactivación de suite unitaria en CI con
  `ChromeHeadlessCI`. 6 mocks de `MockParkingRepository` añaden
  `getVehicleHistoryStats`. `karma.conf.js` con flags de CI.
- **Fase 10 Sprint 10B** — Infraestructura Playwright + 3 specs base
  (F1 operador cycle, F2 admin tariffs, F3 shift open/close). Selectores
  accesibles (sin `data-testid`). `seed.e2e.sql` pendiente.
- **Fase 10 Sprint 10C** — Lighthouse CI soft-launch con thresholds
  graduales (a11y ≥ 0.95 error, perf ≥ 0.85 warn, best-practices ≥ 0.90
  error, PWA ≥ 0.80 warn). 2 URLs anónimas auditadas.
- **Fase 10 Sprint 10E** — Runbook §8–§13 (rollback expandido,
  comprobaciones diarias, onboarding, tarifas, backup mensual,
  convenciones commit). `commitlint.config.cjs`, `.husky/pre-commit`,
  `.husky/commit-msg` listos para activar.
- **Fase 8** — Offline operador-only completo (Sprints 0–3): Dexie como
  mirror local + outbox FIFO + Realtime, conflicts UI + BroadcastChannel,
  stale-write trigger, logout protegido, telemetría.

### Changed

- `PLAN.md` marca Fase 11 (Siigo / FE de terceros) como **DESCARTADA**
  por decisión de producto (2026-05-15). El sistema opera como POS
  interno; numeración local de `invoices` se mantiene.
- Runbook §3 (Siigo) marcado como obsoleto / referencia histórica.

### Migrations

- `00019_realtime_offline_mirror.sql` — Realtime publication para 5
  catálogos del mirror offline.
- `00020_outbox_idempotency.sql` — `client_op_id UUID UNIQUE` parcial
  + `_sync_status` en 4 tablas mutables.
- `00021_stale_write_protection.sql` — trigger `check_stale_write`
  (SQLSTATE `P0409`) en parking_sessions, payments, cashier_shifts.

### Pendiente (humano)

- Aplicar migrations 00019/00020/00021 al backend productivo.
- QA manual según `parqueadero-web/specs/infrastructure/qa-manual-fase-8.md`.
- Activar husky: `cd parqueadero/parqueadero-web && npx husky init` o equivalente.
- Crear `seed.e2e.sql` para correr suite Playwright.
- Sprint 10D (pen-test RLS scripts + PWA validation) y 10F (deploy real)
  por completar.

## [1.0.0] — TBD

Será el primer release productivo. Se publica al cierre de Fase 10F.

[Unreleased]: https://github.com/ORG/parqueadero/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ORG/parqueadero/releases/tag/v1.0.0
