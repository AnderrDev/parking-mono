# Sesión: Auditoría — duplicación, archivos > 400, componentización

**Fecha:** 2026-05-03
**Subproyecto(s):** parqueadero-web
**Estado:** completada

## Objetivos
- [x] Auditar duplicación de código (SCSS, helpers TS, constants).
- [x] Listar archivos > 400 líneas.
- [x] Verificar componentización.
- [x] F1 — Constants + helpers compartidos.
- [x] F2 — `_data-viz.scss` partial global + `<app-kpi-card>`.
- [x] F3 — Descomponer operator-dashboard en 3 sub-componentes.
- [x] F4 — Descomponer reports.page en 2 sub-componentes.

## Avance

### Diagnóstico inicial
- Web: 9 archivos > 400 líneas (operator-dashboard 957 SCSS / 638 TS / 424 HTML;
  cashier-shift 613 SCSS; app 519 SCSS; reports 481 HTML / 447 TS;
  parking-remote 456; vehicle-exit-dialog 427 SCSS).
- Backend y dian-fe: 0 archivos > 400 ✅.
- Duplicación: `.kpi*` y `.bar-row*` en exec-dashboard ↔ reports; `formatCop`
  redefinido en exec-dashboard; `barWidth` casi igual en exec ↔ reports;
  `DOC_TYPES` / `VEHICLE_TYPES` / `PAYMENT_METHODS` en 4-6 archivos.

### F1 — Constants + helpers compartidos
- Nuevo: `shared/constants/form-options.ts` con `DOC_TYPES`, `VEHICLE_TYPES`
  (con `shortLabel`), `PLAN_TYPES`, `PAYMENT_METHODS_PLAN`, `TARIFF_UNITS`.
- Nuevo: `shared/utils/chart.utils.ts` con `barWidth(value, max, minPct)` y
  `pctOf(value, total)`.
- `date.utils.ts`: agregado `formatBogotaDay(label)`.
- Reemplazos: customer-edit-dialog, vehicle-edit-dialog, tariff-edit-dialog,
  monthly-plan-edit-dialog ahora consumen las constantes shared.
- executive-dashboard: usa `formatCOP` y `barWidth` shared (eliminado
  `formatCop` local; el método de instancia delega).
- reports.page: `pctOfMethodTotal`, `barWidth`, `formatBogotaDay` ahora
  delegan a shared utils.

### F2 — Partial global + componente KPI
- Nuevo: `shared/styles/_data-viz.scss` con `.kpi`, `.kpi__label`,
  `.kpi__hint`, `.kpi__value` (+modifier `--text`), `.kpi__detail`,
  `.kpi__delta`, `.kpi-grid`. Importado vía `global.scss`.
- Nuevo: `shared/components/kpi-card/kpi-card.component.ts` standalone con
  inputs `label`, `value`, `detail`, `variant`, `hint`, `textValue`, `delta`.
- Eliminadas definiciones locales de `.kpi*` en exec-dashboard.scss y
  reports.page.scss.

### F3 — operator-dashboard descompuesto
- Nuevo: `parking/.../components/shift-status-banner.component.{ts,scss}`
  (4 estados: loading/error/closed/open). Input `state`, `errorMessage`,
  `openedAt`, `openingBalanceCents`; output `retry`.
- Nuevo: `tariffs-bar.component.{ts,scss}` con `TariffBarItem[]` input;
  encapsula `perHourCents`/`perMinuteCents` por tariff.
- Nuevo: `receipt-card.component.{ts,scss}` con `ExitReceipt` input;
  outputs `dismiss`, `print`, `pause`, `resume`. La interface `ExitReceipt`
  vive ahí ahora y se importa en el page.
- Page agrega computed `shiftBannerState`.
- Tres bloques HTML (~120 líneas) y SCSS (~309 líneas) movidos.

### F4 — reports.page parcialmente descompuesto
- Nuevo: `reports/.../components/payment-method-stack.component.{ts,scss}`
  con stack horizontal + leyenda. Input `MethodSlice[]`.
- Nuevo: `reports/.../components/dian-status-grid.component.{ts,scss}`
  con grid de tarjetas. Input `DianStatusEntry[]`.
- HTML reemplazado en tab "Resumen contable".

## Resultado

Antes / Después:
| Archivo | Antes | Después |
|---|---|---|
| operator-dashboard.page.html | 424 | 318 ✅ |
| operator-dashboard.page.scss | 957 | 648 |
| operator-dashboard.page.ts | 638 | 647 |
| reports.page.html | 481 | 446 |
| reports.page.scss | 326 | 205 ✅ |
| reports.page.ts | 447 | 450 |

**Archivos > 400 que quedan (8):** operator-dashboard.{scss,ts}, cashier-shift.scss, app.component.scss, parking-remote.datasource.ts, reports.page.{ts,html}, vehicle-exit-dialog.component.scss.

Build production: ✅ limpio (1 warning de budget SCSS por 38 bytes).

## Decisiones

- **`parking-remote.datasource.ts` (456) NO se separa.** Es un DataSource que
  agrupa CRUD por dominio; convención correcta del proyecto. Separar
  reduce cohesion sin ganancia.
- **`monthly-plan-edit-dialog` providers self-contained** se mantienen
  (memoria documenta NullInjectorError previo si se mueven a app.config).
- **SCSS específicos de feature (cashier-shift, app, vehicle-exit-dialog)
  no se modularizan a partials globales** — no hay reuso entre archivos;
  modularización sería organizacional sin valor. Se documenta como excepción.
- **operator-dashboard.page.ts (647) y reports.page.ts (450)** son
  orquestadores con muchos UCs. Dividir más en sub-componentes con su
  propio estado tendría costo de pasar muchos inputs/outputs. Se aceptan
  como están.
- **`reports.page.html` (446) — los 4 tabs tienen KPIs específicos por
  contexto.** Reemplazar los 14 `<article class="kpi">` por `<app-kpi-card>`
  bajaría unas 80 líneas pero requiere construir objetos `KpiDelta` con
  suffix formateado en el `.ts`, agregando complejidad. Postergado.

## Bloqueos / Pendientes

- (Heredado) Duplicados activos de tariffs en BD pendientes de cleanup
  manual antes de aplicar partial unique index.

## Next Steps

- [ ] (Opcional) Reemplazar los 14 KPIs inline de `reports.page.html` por
  `<app-kpi-card>` cuando el componente tenga overload para suffix
  formateado automático.
- [ ] (Opcional) Si surgen 2+ pages que necesiten un `<app-bars-chart>`
  reusable, extraerlo. Por ahora cada uno tiene su propio markup con
  variantes legítimas (3 vs 4 columnas).
- [ ] (Opcional) Modularizar `cashier-shift.page.scss` si crece más;
  hoy son secciones específicas no reusadas.
