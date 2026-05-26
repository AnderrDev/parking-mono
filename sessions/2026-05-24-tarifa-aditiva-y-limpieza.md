# Sesión: Tarifa aditiva (hora + minutos restantes) + limpieza de árbol

**Fecha:** 2026-05-24
**Subproyecto(s):** parqueadero-web + parqueadero-backend (specs)
**Estado:** en curso

## Objetivos

1. Limpieza del árbol de widgets (huérfanos confirmados).
2. Revisión de pendientes (inventario, no ejecución).
3. Re-auditar y reescribir la lógica de cobro: **aditivo (horas completas × per_hour + minutos restantes × per_minute), tope plena**. Eliminar minutos de gracia del UI.

## Decisiones (turno 1)

- **Fórmula nueva:** `amount = min(hours_complete × per_hour + remainder × per_minute, plena)`. Reemplaza MIN-de-tres.
- **Gracia:** eliminada del UI. Campo `grace_minutes` se queda en BD a 0 (no requiere migration destructiva).
- **Mensualidad:** sin cambios — sigue cobrando $0.
- **Plena:** se mantiene como tope absoluto por sesión.
- **C5 (`per_hour ≤ 60 × per_minute`) y C6 (`plena ≤ 24 × per_hour`):** se mantienen — siguen siendo coherentes con el modelo aditivo.

## Widgets confirmados huérfanos (a eliminar)

- `shared/components/kpi-card/`
- `shared/components/plate-input/`
- `shared/components/search-input/`
- `shared/components/status-badge/`

(El agente Explore reportó 6, pero verifiqué con grep que `ConflictsDialogComponent` y `VehicleEntryFormComponent` **sí están en uso** — quedan.)

## Pendientes inventariados

**Bloqueantes Fase 10 (deploy productivo):** e2e Playwright, Lighthouse, pen-test RLS, PWA testing, link Supabase prod + push migrations, deploy Vercel/Firebase, dominio HTTPS, Sentry, alertas, backup verification, `docs/runbook.md`, plan rollback.

**Configs manuales Supabase prod:** Leaked password protection · Site URL · poblar `app_settings`.

**Limpieza diferida:** drop legacy `value_cents`/`daily_cap_cents` para parking · drop unidades legacy `minuto/fraccion/dia` del CHECK · borrar `cleanup_fe_2026-05-20.sql` post-aplicación.

**TODOs activos en código:** ninguno.

## Avance

- [x] Auditoría tarifas/cobro y confirmación de fórmula con usuario.
- [x] Borrado de 4 widgets huérfanos (`kpi-card`, `plate-input`, `search-input`, `status-badge`).
- [x] Reescribir `calculate-parking-fee.usecase.ts` con fórmula aditiva.
- [x] Actualizar `calculate-parking-fee.usecase.spec.ts` (22 casos canónicos: moto + carro 1-1440 min, mensualidad, validaciones).
- [x] Actualizar `vehicle-exit-dialog.component.{html,scss}` (nuevo breakdown: horas × tarifa + min × tarifa + plena cap).
- [x] Quitar gracia del UI: columna eliminada de `tariffs-list.page.ts`, input eliminado de `tariff-edit-dialog.component.html`. Campo sigue en BD/entity con default 0 — el cálculo lo ignora.
- [x] Actualizar `ticket-renderer.service.ts` (snapshot sin gracia).
- [x] Reescribir specs: `parqueadero-backend/specs/tariffs-pricing.spec.md` y `parqueadero-web/specs/features/parking/calculate-parking-fee.spec.md`.
- [x] `npx tsc --noEmit` limpio.
- [x] `npx ng build --configuration=development` limpio (bundle inicial 2.95 MB, sin errores de template).

## Notas finales

- **Discontinuidad intencional en `dur=60`**: 59 min × $60 = $3.540 > 1h = $2.400. C5 garantiza `per_hour ≤ 60 × per_minute`, así que completar la hora siempre es ≤ que 60 min sueltos. Documentado en ambas specs.
- **Compatibilidad con datos existentes**: las 2 tarifas seed (moto / carro) ya tenían `grace_minutes=0` (sesión `2026-05-20-tariff-tiered-pricing`), así que ningún cálculo cambia para los registros actuales. Solo el algoritmo cambia hacia adelante.
- **Constraints DB intactos**: C1–C7 vigentes. No requirió migration nueva.
- **Tests no se ejecutaron** (política del proyecto, ver `feedback_no_tests.md`). Las specs `.spec.ts` quedan actualizadas para cuando se habiliten.

## Mejoras UX/UI (turno 2026-05-24, post-revisión visual con Playwright)

Tras revisión visual del flujo de creación/edición de tarifas, aplicadas estas mejoras priorizadas:

- [x] **Lista**: columna "Unidad" eliminada (redundante con el nuevo modelo). Header "Plena" renombrado a "Tope día".
- [x] **Dialog**: select "Tipo de tarifa" simplificado a "Parking" / "Mensualidad" (antes mostraba `Parking (min · hora · plen…` truncado).
- [x] **Dialog**: label "Plena / día (COP)" → "Tope día (COP)".
- [x] **Dialog — Preview de cobro en vivo**: nuevo `<section>` que renderiza 6 puntos canónicos (30min, 1h, 1h30, 2h, 5h, 24h) recalculados en cada cambio de input. Marca con badge naranja `tope` cuando aplica el cap. Usa la misma fórmula del usecase (no depende de él para evitar carga de DI; replica `floor(dur/60)×per_hour + (dur%60)×per_minute, min(., plena)`).
- [x] **Verificado**: C5 (`per_hour ≤ 60 × per_minute`) y C6 (`plena ≤ 24 × per_hour`) ya disparaban en vivo gracias al cross-field validator del FormGroup. Banner rojo visible inmediatamente al editar valores.

**Screenshots de referencia** (capturados en localhost:4201, no commiteados):
- `tariffs-05-list-after.png` — lista limpia sin columna Unidad.
- `tariffs-06-edit-preview.png` — preview en vivo con la tarifa moto ($60/$2.600/$9.000) mostrando tope a las 5h y 24h.
- `tariffs-07-c5-violation.png` — banner C5 visible al subir per_hour a $5.000 (>60×$60).

**No tocado intencionalmente:**
- Iconos por tipo de vehículo (mejora cosmética, no priorizada).
- Ejemplo de cobro en cada fila de la lista (puede esperar a Fase 10 si el operador lo pide).
- Confirm-dialog de desactivar (texto actual es correcto).
- Indicador "última edición" en filas (puede esperar).

## Fix de 2 bugs pre-existentes (turno 3, descubiertos por console errors del usuario)

Tras los cambios UX, el usuario reportó 2 errores de consola al navegar /reports:

1. **NG0600 — "Writing to signals is not allowed in a `computed` or an `effect`"** en `sync-orchestrator.service.ts:158`. El `effect()` del constructor reacciona a `authState.currentUser()` y dispara `snapshotPull()` que internamente hace `_syncing.set(true)` y `_activeShiftId.set(null)`. Esos writes son intencionales (no un ciclo reactivo), pero Angular los bloquea por defecto.
   - **Fix:** `effect(() => {...}, { allowSignalWrites: true })`. Comentado el motivo arriba del effect.

2. **NullInjectorError — "No provider for InjectionToken GetSettingUseCase!"** al cargar `_ReportsPageComponent`. `GetRevenueByPeriodUseCase` (reports) inyecta `GET_SETTING_TOKEN`, pero el provider solo estaba en `settings.routes.ts` (route-scoped a /settings). Mismo bug latente en `close-shift.usecase` (cashier) y `register-payment.usecase` (payments).
   - **Fix:** mover `SETTINGS_DATASOURCE_TOKEN`, `SETTINGS_REPOSITORY_TOKEN` y `GET_SETTING_TOKEN` a `app.config.ts` (root). Dejar `UPDATE_SETTING_TOKEN` en `settings.routes.ts` (solo admin desde /settings). Comentario en ambos archivos explica el motivo.

**Verificado:** `npx tsc --noEmit` y `npx ng build --configuration=development` ambos limpios.

**No corregido:** error 400 al login `hhwctcjwrlbqgsrfriqn…grant_type=password`. Es Supabase rechazando credenciales — verificar password en sesión del usuario (`admin@parqueadero.com / ParqueaderoAdmin2026!` según `sessions/2026-05-20-reset-admin-credentials.md`). Probable typo en input.

## Credenciales quemadas en input de login (DEV-ONLY)

A pedido del usuario, `auth.forms.ts:9-15` prefilea el form de login con `admin@parqueadero.com` / `ParqueaderoAdmin2026!`. Comentario DEV-ONLY explica que deben quitarse antes del build productivo (Fase 10) o reemplazarse vía `fileReplacements` del angular.json. **Riesgo asumido:** credenciales visibles en bundle JS — aceptable solo porque el dev environment se comparte con el equipo.

## Quitar color/marca del formulario de entrada

A pedido del usuario, removidos los inputs `color` y `marca` del flujo de registrar entrada:

- `parking.forms.ts:createEntryForm` — FormGroup solo expone `plate` + `vehicleType`.
- `vehicle-entry-form.component.ts:onSubmit` — emite `color: null, brand: null` (la interfaz `VehicleEntryFormValue` los mantiene por compat con la pipeline aguas abajo).
- `vehicle-entry-form.component.html` — sección "Datos opcionales" eliminada.

**No tocado intencionalmente:**
- Columnas `color` / `brand` en `vehicles` (BD) — se mantienen aceptando NULL, sin migration destructiva. Datos históricos quedan intactos.
- `vehicle.entity.ts`, `vehicle.model.ts`, datasources, repositorio, usecase, mapper — todos siguen exponiendo los campos en sus contratos. Solo el UI deja de capturar; el resto recibe NULL transparentemente.
- `register-vehicle-entry.usecase.spec.ts` ya usa `color: null, brand: null` en su seed, así que no requiere cambios.

`npx tsc --noEmit` y `npx ng build --configuration=development` ambos limpios tras los cambios.

## Next Steps

Próxima sesión: **Fase 10 — Deploy productivo** (es la única fase pendiente). Bloqueantes prioritarios:
1. Suite e2e Playwright (3 flujos críticos: login operador + ciclo entrada/salida; admin gestiona catálogo; cierre de caja).
2. Configurar proyecto Supabase productivo separado + push migrations.
3. Configs manuales: Leaked password protection · Site URL · poblar `app_settings` (NIT 52.210.596-8, resolución, etc.).
4. Deploy a Firebase Hosting + dominio HTTPS.
5. Sentry + alertas + backup verification.
6. `docs/runbook.md` y plan de rollback.

**Estado:** completada.
