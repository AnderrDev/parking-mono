# Spec: Panel de mensualidades activas

**ID:** HU-047
**Módulo:** Parking — Dashboard Operador
**Versión:** 1.0
**Fecha:** 2026-05-10

---

## Descripción

Panel lateral en el dashboard del operador que lista las **mensualidades activas y próximas a vencer**. Permite al operador reconocer al cliente recurrente al momento de la entrada/salida, avisar cuando la mensualidad está a punto de vencer y detectar planes recién expirados.

Es lectura: el operador no edita planes desde aquí — para CRUD se va a `/monthly-plans` (admin).

---

## Actor
Operador (vista `/parking`).

## Pre-condiciones
- Usuario autenticado con turno abierto o cerrado (el panel se ve siempre).

---

## Fuente de datos

`ListMonthlyPlansUseCase` con filtros:
- `status: 'active'` para la lista principal.
- Se complementa con una segunda consulta `status: 'expiring'` (≤ 7 días) para destacar.
- `pagination: { page: 1, pageSize: 50 }` — el cap evita traer históricos.

Como `MonthlyPlanStatus` ya incluye `expiring`, el panel mezcla `active + expiring` en una sola lista ordenada por `endDate ASC` (los más próximos a vencer arriba).

---

## UI

Componente standalone `<app-monthly-plans-panel>` recibe:
- `@Input() plans: MonthlyPlanEntity[] | null` — lista de planes a renderizar.
- `@Input() loading: boolean`
- `@Input() error: string | null`
- `@Output() selectPlate = EventEmitter<string>()` — para que el dashboard rellene el buscador con esa placa al hacer click.

Layout:
- Header: "Mensualidades activas" + badge total + botón "Ver todas" → router link a `/monthly-plans`.
- Lista vertical compacta. Cada fila:
  - Placa (mono, grande).
  - Días restantes con color según urgencia.
  - Fecha de vencimiento (dd MMM yyyy).
  - Tipo de plan.
- Estados:
  - **loading**: 4 skeletons.
  - **empty**: "Sin mensualidades activas".
  - **error**: banner discreto.

Urgencia por color (sólo color complementa al texto):
| Días restantes | Tone |
|---|---|
| ≤ 0 (vencida) | danger |
| 1–3 | warning |
| 4–7 | info |
| > 7 | neutral |

---

## Integración en operator-dashboard

- Nuevos signals: `monthlyPlans`, `monthlyPlansLoading`, `monthlyPlansError`.
- `ngOnInit()` carga las mensualidades en paralelo a `loadSessions/loadTariffs/loadShiftStatus`.
- Refresh tras `handleEntryRegistered` y `onExitSubmit` (un plan puede entrar/salir y mostrar fechas distintas) — pero NO en el ciclo del clock (cada segundo es excesivo).
- Click en una fila → `plateSearchQuery.set(plate)`, `plateSuggestionsOpen.set(false)`, dispara `onSelectSuggestion` con la placa para mostrar el dossier histórico.

---

## Reglas de negocio

1. **Filtro por estado**: sólo `active` + `expiring`. `expired` y `cancelled` no aparecen.
2. **Soft-deleted** quedan fuera.
3. **Orden**: `endDate ASC` (los que vencen pronto, primero).
4. **Cap 50 planes**: si hay más, mostrar mensaje "+ N más — ver todas" hacia `/monthly-plans`.
5. La sesión activa actual del vehículo NO se valida aquí — esta vista es del plan, no de la presencia. Para saber si está dentro, el operador usa el buscador.

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `presentation/components/monthly-plans-panel.component.{ts,html,scss}` | Nuevo componente. |
| `presentation/pages/operator-dashboard.page.{ts,html,scss}` | Inyectar use case + integrar panel. |
| `parking.routes.ts` | Añadir providers para MonthlyPlanRepository + LIST_MONTHLY_PLANS_TOKEN (route-scoped). |

---

## Verificación

- [ ] Al abrir `/parking` se cargan las mensualidades activas en paralelo a las sesiones.
- [ ] Lista ordenada por días restantes ascendentes.
- [ ] Color de urgencia coherente con días restantes.
- [ ] Click en una fila rellena el buscador y muestra el dossier histórico.
- [ ] "Ver todas" navega a `/monthly-plans`.
- [ ] Empty state visible cuando no hay planes activos.
- [ ] `ng build` sin errores.
