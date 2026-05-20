# E2E Tests (Playwright)

Suite end-to-end del flujo crítico del operador, según `qa-manual-fase-8.md` y handoff Fase 10 §3 (Sprint 10B).

## Estrategia de selectores

**Selectores accesibles** (no `data-testid`). Usamos `getByRole`, `getByLabel`, `getByText`, `getByPlaceholder`. Beneficios:
- No requiere cambios en templates HTML
- Robusto contra refactor de DOM
- Alineado con auditoría a11y de Sprint 10C

Si un selector queda ambiguo, preferir el role + el accessible name antes que CSS selectors frágiles.

## Pre-requisitos

1. Supabase local corriendo (`cd parqueadero-backend && supabase start`).
2. Migrations aplicadas (`supabase db reset` aplica todas, incluyendo Fase 8: 00019/00020/00021).
3. Usuarios de prueba creados — ver `seed.e2e.sql` (siguiente paso, ver §TODO).

## TODO antes del primer run

- [ ] Crear `parqueadero-backend/supabase/seed.e2e.sql` con:
  - `admin@e2e.local` (role=admin, password fijo)
  - `operador@e2e.local` (role=operador, password fijo)
  - Una tarifa activa de prueba
  - Datos predecibles para los 3 flujos
- [ ] En CI: añadir secret `E2E_SUPABASE_SERVICE_KEY` para crear usuarios vía API.
- [ ] Documentar en `runbook.md` cómo regenerar el seed.

## Correr local

```bash
cd parqueadero-web

# Una vez:
npx playwright install --with-deps chromium

# Headless:
npm run e2e

# UI mode (debug interactivo):
npm run e2e:ui

# Solo F1:
npx playwright test f1-operator-cycle
```

## Flujos cubiertos

| ID | Flujo | Spec |
|---|---|---|
| F1 | Login operador + entrada + salida con cobro | `e2e/specs/f1-operator-cycle.spec.ts` |
| F2 | Admin CRUD tarifas (crear/editar/desactivar) | `e2e/specs/f2-admin-tariffs.spec.ts` |
| F3 | Apertura + cierre de turno con cuadre | `e2e/specs/f3-shift-open-close.spec.ts` |
| F4 | Ciclo offline (snapshot, outbox, drain, logout protegido) | `e2e/specs/f4-offline-cycle.spec.ts` |

### F4 — Detalle de tests

- `snapshot al login pobla tablas mirror`: verifica que `snapshotPull()` se ejecuta tras login y llena `tariffs`/`app_settings`.
- `outbox: entrada offline → drain al recuperar red`: usa `context.setOffline(true/false)` para forzar el path offline; valida que la outbox queda en `pending`, banner muestra mensaje, y al volver online el drain la vacía.
- `logout con outbox pendiente abre confirm dialog`: respeta la protección de Sprint 3 — cancelar mantiene la sesión y la outbox.
- `banner cambia de estado offline → syncing → online`: smoke del componente `<app-offline-banner>` reactivo a `NetworkInfoService.isOnline$`.

Helpers: `e2e/utils/dexie-inspect.ts` consulta IndexedDB via `page.evaluate` sin acoplar a globals del runtime.

## Roadmap

- Sprint 10B: 3 flujos básicos pasando local + CI con `continue-on-error`.
- Sprint 10D: pen-test RLS desde Playwright (auth manipulada).
- Fase 10 cierre: thresholds duros + parte de gate de merge.
