# Sesión: Fase 2 — Core Angular + Design System

**Fecha:** 2026-04-29
**Subproyecto(s):** parqueadero-web
**Estado:** en progreso

## Objetivos
- [ ] Construir `core/` completo (Either, Failures, BaseEntity, UseCase, DI tokens, Supabase service, NetworkInfo, auth guard, error interceptor)
- [ ] Construir `shared/` (models, utils, validators, pipes)
- [ ] Design system SCSS (tokens canónicos + reset + global)
- [ ] Fuentes self-hosted: Inter + JetBrains Mono
- [ ] Componentes dumb shared (8): loading-spinner, error-display, confirm-dialog, status-badge, plate-input, search-input, data-table, offline-banner
- [ ] Shell de la app: app.component con sidebar + header + router-outlet, lazy routes a 8 features, app.config con providers globales
- [ ] Tests 100% en pipes y utils; test instanceof en Failures

## Contexto
Fases 0 y 1 cerradas. El scaffold de Angular existe (6 archivos en src/app/). No hay código de negocio. Esta fase construye la infra completa que usarán todas las features siguientes.

Skills activos: angular-architect, ui-ux-parqueadero, frontend-quality, ui-ux-pro-max.

Design system: Flat Design, minimalismo funcional, tokens ui-ux-parqueadero canónicos (azul #0B5CFF, fuentes Inter + JetBrains Mono).

## Avance

### Core
- [ ] `core/either/either.ts`
- [ ] `core/either/failures.ts`
- [ ] `core/base/base.entity.ts`
- [ ] `core/base/usecase.ts`
- [ ] `core/di/injection-tokens.ts`
- [ ] `core/services/supabase.service.ts`
- [ ] `core/services/network-info.service.ts`
- [ ] `core/guards/auth.guard.ts`
- [ ] `core/interceptors/error.interceptor.ts`

### Shared
- [ ] `shared/models/{pagination,sort,filter}.model.ts`
- [ ] `shared/utils/{date,currency,plate,uuid}.utils.ts`
- [ ] `shared/forms/validators/{plate,nit,colombian-phone,positive-number}.validator.ts`
- [ ] `shared/forms/form-error-messages.ts`
- [ ] `shared/pipes/{currency-cop,time-ago,plate-format}.pipe.ts`

### Design System
- [ ] `shared/styles/tokens.scss`
- [ ] `shared/styles/reset.scss`
- [ ] `shared/styles/global.scss`
- [ ] Fuentes self-hosted en `src/assets/fonts/`

### Componentes Shared
- [ ] `loading-spinner`
- [ ] `error-display`
- [ ] `confirm-dialog`
- [ ] `status-badge`
- [ ] `plate-input`
- [ ] `search-input`
- [ ] `data-table`
- [ ] `offline-banner`

### Shell
- [ ] `app.component.ts` + html + scss
- [ ] `app.routes.ts` (8 lazy routes + placeholders)
- [ ] `app.config.ts` (providers globales)
- [ ] `index.html` (lang=es-CO, preload fuentes, theme-color)

### Tests
- [ ] `core/either/either.spec.ts`
- [ ] `shared/pipes/*.spec.ts`
- [ ] `shared/utils/*.spec.ts`

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
