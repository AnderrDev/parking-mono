# Sesión: Panel de mensualidades activas en parking (HU-047)

**Fecha:** 2026-05-10
**Subproyecto(s):** parqueadero-web
**Estado:** completada

## Objetivos
- [x] Mostrar al operador, en `/parking`, las mensualidades activas + próximas a vencer.
- [x] Click en una fila debe rellenar el buscador y mostrar el dossier histórico ya existente.

## Avance
- Spec nueva `specs/components/monthly-plans-panel.spec.md`.
- Componente standalone `<app-monthly-plans-panel>` (TS+HTML+SCSS) que recibe `plans / loading / error` y emite `plateSelected`. Ordena por `endDate ASC`, capa a 50 y agrega badge de urgencia con 4 tonos (danger / warning / info / neutral) según `daysUntilExpiry`.
- `parking.routes.ts`: registra `MONTHLY_PLAN_REMOTE_DATASOURCE_TOKEN`, `MONTHLY_PLAN_REPOSITORY_TOKEN`, `LIST_MONTHLY_PLANS_TOKEN` route-scoped — la página los necesita y el módulo monthly-plans los tiene en su propio route.
- `operator-dashboard.page.ts`: signals `monthlyPlans / monthlyPlansLoading / monthlyPlansError`, método `loadMonthlyPlans()` que dispara dos consultas en paralelo (`status:'active'` + `status:'expiring'`), deduplica por id, se carga en `ngOnInit` junto al resto. Método `onMonthlyPlanPlateSelected(plate)` reutiliza el flujo de `onSelectSuggestion` (búsqueda + dossier histórico).
- Template inserta el panel después de `<app-receipt-card>` y antes del listado de sesiones; nuevo modifier `.dashboard__monthly` en SCSS.

`ng build --configuration=development` ✅ sin errores.

## Decisiones
- **Route-scoped en parking** en vez de mover a root: solo dos páginas consumen `MonthlyPlanRepository` (dashboard del operador y admin de mensualidades). Mantener route-scoped reduce el inicialización en rutas que no lo necesitan y simetría con los demás use cases del feature.
- **Doble consulta** (active + expiring) en lugar de una sin filtro: aprovecha la enum existente y deja claro la semántica; el costo es despreciable (dos paginated calls de pageSize 50 a la BD).
- **Click rellena el buscador** en lugar de abrir un modal de detalle: ya tenemos el dossier histórico funcionando en el panel del buscador; reusarlo evita duplicar UI.

## Bloqueos / Pendientes
Ninguno.

## Next Steps
- [ ] Realtime: suscripción a `monthly_plans` para refrescar el panel cuando se crea/cancela un plan desde otra ventana. Migración 00018 ya habilita realtime para las tablas grandes; falta extender a `monthly_plans`.
- [ ] Continuar con Fase 8 (Offline / PowerSync) o Fase 11 (Siigo) según prioridad.
