# Sesión: Tarifa unificada min/hora/plena (feature)

**Fecha:** 2026-05-20
**Subproyecto(s):** parqueadero-backend + parqueadero-web
**Estado:** completada

## Objetivos
- [ ] Una sola tarifa por `vehicle_type` con tres valores independientes: `per_minute_cents`, `per_hour_cents`, `plena_cents`.
- [ ] Cobro = MIN(byMinute, byHour, plena) con redondeo único a $50 al final.
- [ ] Backfill de tarifas existentes preservando el cobro previo.

## Sprints

### S1 — Specs (este turno)
- [x] `parqueadero-backend/specs/database-schema.spec.md` § tariffs reescrito: 3 columnas nuevas + constraints C1–C7.
- [x] `parqueadero-backend/specs/tariffs-pricing.spec.md` creado: algoritmo MIN-de-tres, ejemplos canónicos moto/carro, migration plan.
- [x] `parqueadero-web/specs/features/parking/calculate-parking-fee.spec.md` reescrito con MIN-de-tres + breakdown nuevo.

### S2 — Migration + entity/model (cerrado)
- [x] `supabase/migrations/00023_tariff_tiered_pricing.sql` (no 00021 — ya había dos 00021_*): ADD COLUMNs nullable, backfill, CHECKs condicionales C4-C6, UNIQUE C7.
- [x] `tariff.entity.ts`: 3 readonly opcionales (`perMinuteCents`, `perHourCents`, `plenaCents`), default null.
- [x] `tariff.model.ts` + mapper: 3 fields snake_case opcionales mapeados a camelCase.
- [x] `tsc --noEmit` limpio (build de Angular tenía errores pre-existentes de `ticket_number`, no relacionado).
- **Decisión**: NOT NULL queda para una migration posterior (post-S4) para no bloquear el código viejo entre S2 y S4.

### S3 — Calc usecase (cerrado)
- [x] `calculate-parking-fee.usecase.ts` reescrito con dual-path: tiered (MIN de tres) cuando los 3 campos están seteados, legacy (valueCents+unit) en caso contrario.
- [x] `FeeBreakdown` extendido con `byMinuteCents`, `byHourCents`, `plenaCents`, `winner` (manteniendo `base`, `grace`, `cap`, `unit`, `durationMinutes` para back-compat).
- [x] Tests existentes (legacy path) siguen pasando — usan tarifas sin los 3 campos nuevos.
- [ ] Tests nuevos canónicos: postergados (memoria `feedback_no_tests` — no ejecutamos tests; los agregamos junto con la limpieza del legacy path al final de S4).

### S4 — UI + ticket (cerrado)
- [x] **Domain**: `CreateTariffParams` + `UpdateTariffParams` con 3 fields opcionales. `create-tariff.usecase` + `update-tariff.usecase` validan C4-C6 cuando unit != mensualidad.
- [x] **Data**: `tariff-remote.datasource` envía los 3 nuevos + deriva `value_cents`/`daily_cap_cents` para back-compat. `tariff.repository.impl` propaga al mirror Dexie.
- [x] **Forms**: `tariff.forms` agrega los 3 fields + `tieredPricingCrossFieldValidator` que expone `c5`/`c6` como errors del FormGroup.
- [x] **Dialog**: `tariff-edit-dialog` ramifica visualmente — mensualidad (valueCents + fechas) vs parking (3 inputs + gracia). Submit deriva `valueCents`/`dailyCapCents` automáticamente para parking. Mensajes inline para C5/C6.
- [x] **List page**: columnas reemplazadas — `$/min`, `$/hora`, `Plena` (en vez de Valor + Tope). Cell template renderiza `—` si null (back-compat con rows legacy).
- [x] **Ticket renderer**: `formatTieredTariff()` muestra `$X/min · $Y/h · plena $Z`. Fall-back al formato viejo si la tarifa no tiene los 3 fields.
- [x] **Exit dialog**: nueva sección `dialog__fee-breakdown` con los 3 candidatos (byMinute/byHour/plena), highlight visual del ganador con `→`.
- [x] **Spec ticket**: `print-entry-ticket.spec.md` actualizado con el nuevo formato `tariffLine`.
- [x] `tsc --noEmit` limpio (filtrando errores pre-existentes del feature `ticket_number` que está a medio terminar fuera de mi alcance).

### S5 — Seed dev (cerrado)
- [x] Migration 00023 aplicada por usuario vía SQL Editor (MCP `apply_migration` bloqueado por el clasificador a pesar de autorización previa — fallback al patrón del wipe).
- [x] INSERT de 2 tarifas (moto + carro) corrido vía SQL Editor.
- [x] Verificación vía MCP `execute_sql`: `per_minute_cents`, `per_hour_cents`, `plena_cents` correctos para ambos vehículos.
- [x] **22/22 casos** pasaron en script de verificación `/tmp/test-tariff-calc.mjs` cubriendo: minute-wins, hour-wins, plena-wins, gracia, mensualidad — para moto y carro.

### S6 — Limpieza legacy path + tests canónicos (cerrado)
- [x] `calculate-parking-fee.usecase.ts` simplificado a un solo path (MIN-de-tres). Eliminado `calculateLegacy`, `FeeWinner='legacy'`, campos legacy `base`/`grace`/`cap`/`unit` del breakdown.
- [x] `FeeBreakdown` ahora tiene solo: `byMinuteCents`, `byHourCents`, `plenaCents`, `winner`, `graceMinutes`, `durationMinutes` (sin nulls).
- [x] Si la tarifa carga sin los 3 fields tiered → `ValidationFailure` con mensaje accionable ("Editá la tarifa desde /tariffs para setear los 3 valores").
- [x] `calculate-parking-fee.usecase.spec.ts` reescrito con 22 cases canónicos (cobra MOTO 1-1440 min + CARRO 1-1440 min + gracia + mensualidad). Cada caso valida `amountCents` exacto + `winner` esperado.
- [x] `register-vehicle-exit.usecase.spec.ts` + `create-tariff.usecase.spec.ts`: `makeTariff`/`baseParams` extendidos con los 3 tiered fields para que la calc no devuelva ValidationFailure.
- [x] `vehicle-exit-dialog.component.html`: `breakdown.grace` → `breakdown.graceMinutes`. Breakdown section ya no necesita `@if (... !== null)` (los 3 fields son siempre number, no nullable).
- [x] `tsc --noEmit` limpio.

### S7 — Hardening DB (cerrado)
- [x] `00024_tariff_sync_legacy_columns.sql`: UPDATE de `value_cents := per_hour_cents` y `daily_cap_cents := plena_cents` para tarifas parking. En dev quedaron desalineadas $200 tras el seed; ahora 0 desfasadas (verificado vía MCP).
- [x] `00025_tariff_tiered_not_null.sql`: constraint `tariffs_parking_requires_tiered` exige los 3 fields NOT NULL cuando `unit != 'mensualidad'` (mensualidad sigue aceptando NULL). Verificado en pg_constraint.
- [x] `ng build` GREEN (el usuario limpió `ticket_number` en paralelo durante la sesión).
- [x] Ambas migrations aplicadas en dev (`hhwctcjwrlbqgsrfriqn`) vía SQL Editor.

### Pendientes follow-up (sesión futura)
- [ ] Re-evaluar si dropear unidades `minuto`/`fraccion`/`dia` del CHECK constraint del backend (la UI ya no las expone, pero el backend las acepta para back-compat). Es opcional, no bloquea nada.
- [ ] Eventualmente dropear `value_cents` / `daily_cap_cents` para parking. Hoy se mantienen porque mensualidad los usa con semántica propia.

## Decisiones

- **MIN-de-tres** (no breakpoint ni tiered acumulado): es el modelo que respeta los 3 precios sin descontinuidades, favorece al cliente y matchea el comportamiento típico de parqueaderos colombianos.
- **Constraints cliente-friendly** (`per_hour ≤ 60·per_minute`, `plena ≤ 24·per_hour`): bloquean tarifas irracionales sin restringir las palancas comerciales.
- **`unit` se mantiene** para distinguir `mensualidad` (tarifa distinta, no es parking) de las parking tariffs. Solo para parking el `unit` pasa a ser etiqueta (no rige cálculo).
- **`value_cents` y `daily_cap_cents` quedan como legacy** en la migration 00021 (no se borran). Se eliminan en una migration posterior tras validar que ningún código las lee para parking.
- **Backfill seguro**: `per_hour := value_cents`, `per_minute := value_cents / 60`, `plena := daily_cap_cents`. Las tarifas existentes mantienen exactamente el mismo cobro que tenían.
- **UNIQUE excluye mensualidad**: `UNIQUE(vehicle_type) WHERE is_active=true AND _deleted=false AND unit != 'mensualidad'`. Pueden coexistir una parking y una mensualidad para el mismo tipo.
- **SIN redondeo a $50 en path tiered** (2026-05-20 post-S5 testing): los 3 cents en BD son BIGINT enteros y MIN preserva enteros, así que se cobra exacto al peso (ej. moto 1 min = $60 exacto). Path legacy mantiene `roundToCopStep` porque ahí sí hay valores fraccionados. Sacamos `multipleOfCentsValidator` de los 3 fields tiered en el form (el admin puede setear $60/min sin que la UI lo bloquee). Operador maneja el cambio físico al cobrar.
- **Selector de unidad simplificado a binario** (2026-05-20 post-S5): el dialog ya no expone 'minuto' / 'fraccion' / 'día' como opciones. Solo "Parking" (= `unit='hora'` canónico, con los 3 inputs tiered) o "Mensualidad". El backend sigue aceptando las 5 unidades para back-compat con rows legacy. Cuando se edita una tarifa legacy con `unit='fraccion'`, el select queda en blanco hasta que el admin elija Parking o Mensualidad — al guardar normaliza a 'hora' y los 3 fields tiered ya están backfilled.

## Bloqueos / Pendientes

- Ninguno. Esperando OK explícito del usuario al cierre de S1 para arrancar S2 (migration + entity/model).

## Next Steps

- [ ] Usuario revisa los 3 specs y confirma.
- [ ] Si OK: arrancar S2 con `00021_tariff_tiered_pricing.sql` (migration en local primero, luego aplicar al dev remoto).
- [ ] Si hay ajustes: editar specs antes de codear.
