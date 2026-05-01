# Sesión: Mejoras UI/UX — Design System + Componentes

**Fecha:** 2026-04-30
**Estado:** completada
**Fase:** Transversal (mejoras visuales sobre todas las fases anteriores)
**Subproyecto:** parqueadero-web

---

## Objetivo

Mejorar colores, jerarquía visual, intuitivo para operadores nuevos, feedback visual claro. Skills usadas: `ui-ux-pro-max`, `frontend-design`.

## Cambios realizados

### Fase A — Token refresh (`tokens.scss`, `global.scss`)
- `--color-bg` y `--color-bg-subtle`: shift a gray-50/100 (más cálido que slate puro)
- Nuevos tokens: `--color-cta-entry` (sky-700), `--color-cta-exit` (red-700), `--color-surface-elevated`, `--space-4-5`
- `h3` → `color: var(--color-text-strong)` (contraste mejorado)
- Nueva clase global `.form-hint`

### Fase B — Sidebar UX (`app.component.scss`)
- Estado activo: de "fondo negro lleno" → borde izquierdo 3px sky + fondo `--color-accent-soft`
- Grupo titles: `--color-text-disabled` → `--color-text-muted` (pasa 4.5:1)
- Rail mode (tablet ≤1024px): tooltips CSS via `content: attr(aria-label)` — sin cambios TypeScript

### Fase C — Dashboard operador
- Botón "Registrar entrada": negro → `--color-cta-entry` (sky-700), min-height → 56px
- Botón "Salida": negro → `--color-cta-exit` (rojo), foco ring → rojo
- Chips tipo vehículo selected: negro → `--color-accent-soft` (sin confundir con submit)
- `.session-card__duration`: `--text-xs` → `--text-sm`, `--color-text` → `--color-text-strong`
- Panel entrada: nuevo modifier `.panel--action` con borde left azul
- Template HTML: `class="panel panel--action"` en sección de registro

### Fase D — Login
- Botón submit: negro → `--color-accent` (sky-700) — "azul = avanzar"
- Input hover: border neutral → accent-tinted (`color-mix`)
- Password toggle: nuevo signal `showPassword`, botón con SVG ojo/ojo-tachado, ARIA completo
- Spec creada: `specs/components/login-password-toggle.spec.md`

### Fase E — Shared components
- `status-badge`: animación pulse en `.badge--active .badge__dot::after` con `prefers-reduced-motion`
- `data-table`: hover universal en `.table__row:hover`, sort icon Unicode → SVG path via `sortIconPath()`
- Empty states: todas las páginas con `app-data-table` ya tenían mensajes propios — sin cambio requerido

## Archivos modificados
- `src/app/shared/styles/tokens.scss`
- `src/app/shared/styles/global.scss`
- `src/app/app.component.scss`
- `src/app/features/parking/presentation/components/vehicle-entry-form.component.scss`
- `src/app/features/parking/presentation/pages/operator-dashboard.page.scss`
- `src/app/features/parking/presentation/pages/operator-dashboard.page.html`
- `src/app/shared/components/status-badge/status-badge.component.scss`
- `src/app/shared/components/data-table/data-table.component.scss`
- `src/app/shared/components/data-table/data-table.component.html`
- `src/app/shared/components/data-table/data-table.component.ts`
- `src/app/features/auth/presentation/pages/login.page.ts`
- `src/app/features/auth/presentation/pages/login.page.html`
- `src/app/features/auth/presentation/pages/login.page.scss`
- `specs/components/login-password-toggle.spec.md` (nueva)

## Verificación
- `tsc --noEmit` — sin errores

## Next Steps
- Revisar visualmente en Chrome DevTools: 375px, 768px, 1024px, 1440px
- Verificar contraste con DevTools → Accessibility → Color Contrast
- Si se quiere extender a cambio de contraseña: aplicar mismo toggle con spec `change-password-toggle.spec.md`
- Fase 8 (PowerSync/Offline hardening) — pendiente de arrancar
