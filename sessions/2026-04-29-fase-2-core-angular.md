# Sesión: Fase 2 — Core Angular + Design System

**Fecha:** 2026-04-29
**Subproyecto(s):** parqueadero-web
**Estado:** completada — commit `88d1afb`

## Objetivos
- [x] Construir `core/` completo (Either, Failures, BaseEntity, UseCase, DI tokens, Supabase service, NetworkInfo, auth guard, error interceptor)
- [x] Construir `shared/` (models, utils, validators, pipes)
- [x] Design system SCSS (tokens canónicos + reset + global)
- [x] Fuentes self-hosted: Inter + JetBrains Mono
- [x] Componentes dumb shared (8): loading-spinner, error-display, confirm-dialog, status-badge, plate-input, search-input, data-table, offline-banner
- [x] Shell de la app: app.component con sidebar + header + router-outlet, lazy routes a 8 features, app.config con providers globales
- [x] Tests 100% en pipes y utils; test instanceof en Failures

## Contexto
Fases 0 y 1 cerradas. El scaffold de Angular existe (6 archivos en src/app/). No hay código de negocio. Esta fase construye la infra completa que usarán todas las features siguientes.

Skills activos: angular-architect, ui-ux-parqueadero, frontend-quality, ui-ux-pro-max.

Design system: Flat Design, minimalismo funcional, tokens ui-ux-parqueadero canónicos (azul #0B5CFF, fuentes Inter + JetBrains Mono).

## Avance

### Core
- [x] `core/either/either.ts`
- [x] `core/either/failures.ts`
- [x] `core/base/base.entity.ts`
- [x] `core/base/usecase.ts`
- [x] `core/di/injection-tokens.ts`
- [x] `core/services/supabase.service.ts`
- [x] `core/services/network-info.service.ts`
- [x] `core/guards/auth.guard.ts`
- [x] `core/interceptors/error.interceptor.ts`

### Shared
- [x] `shared/models/{pagination,sort,filter}.model.ts`
- [x] `shared/utils/{date,currency,plate,uuid}.utils.ts`
- [x] `shared/forms/validators/{plate,nit,colombian-phone,positive-number}.validator.ts`
- [x] `shared/forms/form-error-messages.ts`
- [x] `shared/pipes/{currency-cop,time-ago,plate-format}.pipe.ts`

### Design System
- [x] `shared/styles/tokens.scss`
- [x] `shared/styles/reset.scss`
- [x] `shared/styles/global.scss`
- [x] Fuentes self-hosted en `src/assets/fonts/`

### Componentes Shared
- [x] `loading-spinner`
- [x] `error-display`
- [x] `confirm-dialog`
- [x] `status-badge`
- [x] `plate-input`
- [x] `search-input`
- [x] `data-table`
- [x] `offline-banner`

### Shell
- [x] `app.component.ts` + html + scss
- [x] `app.routes.ts` (8 lazy routes + placeholders)
- [x] `app.config.ts` (providers globales)
- [x] `index.html` (lang=es-CO, preload fuentes, theme-color)

### Tests
- [x] `core/either/either.spec.ts`
- [x] `shared/pipes/*.spec.ts`
- [x] `shared/utils/*.spec.ts`

## Decisiones
- Tokens SCSS canónicos del skill `ui-ux-parqueadero` (no los del ui-ux-pro-max que usa navy oscuro — el proyecto tiene su propio sistema).
- Fuentes self-hosted via `@font-face` en tokens.scss para evitar dependencia de Google Fonts en producción (PWA offline-first).
- `data-table` usa container queries (`@container`) en lugar de media queries para ser reutilizable en cualquier contexto.
- `confirm-dialog` usa Angular CDK Dialog (ya instalado) con focus trap y restore focus.
- `NetworkInfoService` expone `isOnline$` (RxJS) y `isOnline()` (signal) para compatibilidad con ambos patrones.

## Bloqueos / Pendientes
Ninguno al inicio.

## Next Steps
- Fase 3 — Auth: crear specs `login.spec.md`, `logout.spec.md`, `restore-session.spec.md` ANTES de codear. Confirmar con usuario. Skills: supabase-expert + angular-architect.
