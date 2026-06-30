# E2E Tests (Playwright)

Suite end-to-end del flujo crítico del operador.

## Estrategia de selectores

**Selectores accesibles** (no `data-testid`). Usamos `getByRole`, `getByLabel`, `getByText`, `getByPlaceholder`. Beneficios:
- No requiere cambios en templates HTML
- Robusto contra refactor de DOM
- Alineado con auditoría a11y de Sprint 10C

Si un selector queda ambiguo, preferir el role + el accessible name antes que CSS selectors frágiles.

## Pre-requisitos

1. Supabase local corriendo (`cd parqueadero-backend && supabase start`).
2. Migrations aplicadas (`supabase db reset`).
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

## Roadmap

- Sprint 10B: 3 flujos básicos pasando local + CI con `continue-on-error`.
- Sprint 10D: pen-test RLS desde Playwright (auth manipulada).
- Fase 10 cierre: thresholds duros + parte de gate de merge.
