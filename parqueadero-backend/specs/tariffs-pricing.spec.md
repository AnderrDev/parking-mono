# Spec: Tarifa unificada (per_minute + per_hour + plena) — modelo aditivo con ciclos de 12 h

## Identificador
`backend/tariffs-pricing`

## Descripción

Una sola tarifa activa por `vehicle_type` (excepto las tarifas de plan, ver más abajo). La tarifa expone **tres valores independientes**:

- `per_minute_cents` — valor del minuto suelto
- `per_hour_cents` — valor de cada hora completa
- `plena_cents` — precio del bloque de 12 horas; también actúa como tope de cada ciclo

El cobro es **aditivo por ciclos de 12 horas**: cada ciclo de 12 h completado cobra exactamente una plena. En la fracción final (lo que no completa un ciclo) se cobra por hora completa + minutos sueltos, con la plena como techo del ciclo. Los ciclos se suman: una sesión larga puede cobrar varias plenas.

**Cambios respecto al modelo anterior (2026-05-24):** la plena pasa de ser tope absoluto de la sesión a tope **por ciclo de 12 h**. Una sesión de 24 h cobra 2 plenas, no 1. Vigente en código desde el 2026-06-28 (`3c03f07`); este spec se actualizó el 2026-07-04.

**Cambios respecto al modelo del 2026-05-20:** se reemplazó el MIN-de-tres por el modelo aditivo. Se eliminó el concepto de minutos de gracia del producto (la columna `grace_minutes` se mantiene en BD por compatibilidad pero queda en 0 y no participa del cálculo).

## Por qué aditivo y no MIN-de-tres

El cobro aditivo es el que esperan los operadores y los clientes en parqueaderos colombianos (cobro por hora completada + minutos extra al precio del minuto). El MIN-de-tres favorecía al cliente pero no reflejaba la realidad operativa.

Por simetría, se valida solo el sentido cliente-friendly: `per_hour ≤ 60 × per_minute` y `plena ≤ 24 × per_hour`. Lo contrario sería irracional (hora más cara que 60 minutos sueltos o plena más cara que un día entero al precio de hora).

## Algoritmo de cobro

Para una sesión de `durationMinutes` con `tariff`:

```
1. Si la sesión es mensualidad activa → cobra $0 (cubierta por plan).
2. Ciclos de 12 h completos:
   plenaBlocks       = floor(durationMinutes / 720)
   remainderMinutes  = durationMinutes % 720
3. Fracción final (lo que no completa un ciclo):
   hoursCompleted    = floor(remainderMinutes / 60)
   looseMinutes      = remainderMinutes % 60
   remainderSubtotal = hoursCompleted × per_hour_cents
                     + looseMinutes × per_minute_cents
4. La plena topa cada ciclo:
   remainderAmount   = min(remainderSubtotal, plena_cents)
5. amountCents = plenaBlocks × plena_cents + remainderAmount
   cappedByPlena = plenaBlocks > 0 OR remainderSubtotal > plena_cents
```

Cada ciclo de 12 h completado cobra **exactamente una plena**, incluso si `12 × per_hour < plena` (la plena es el precio fijo del bloque, no un MIN). Con las tarifas reales esto no ocurre porque la plena siempre es menor que 12 h al valor hora, pero es el comportamiento definido.

**SIN redondeo a $50:** los 3 valores en BD son enteros (BIGINT) y la suma preserva enteros, así que el cobro es exacto al peso. Esto permite tarifas como `$60/min` (no múltiplo de $50). El operador maneja el cambio físico al cobrar en efectivo.

## Ejemplos canónicos

Tarifa **moto**: `per_minute=$60`, `per_hour=$2.400`, `plena=$9.000`.

| Duración | plenas 12h | fracción (h × $2.400 + min × $60) | fracción topada | cobro |
|---|---|---|---|---|
| 1 min | 0 | $60 | $60 | **$60** |
| 15 min | 0 | $900 | $900 | **$900** |
| 30 min | 0 | $1.800 | $1.800 | **$1.800** |
| 59 min | 0 | $3.540 | $3.540 | **$3.540** |
| 60 min | 0 | $2.400 | $2.400 | **$2.400** |
| 90 min | 0 | $4.200 | $4.200 | **$4.200** |
| 150 min (2h30) | 0 | $6.600 | $6.600 | **$6.600** |
| 180 min (3h) | 0 | $7.200 | $7.200 | **$7.200** |
| 240 min (4h) | 0 | $9.600 | $9.000 (cap) | **$9.000** |
| 720 min (12h) | 1 × $9.000 | $0 | $0 | **$9.000** |
| 840 min (14h) | 1 × $9.000 | 2h → $4.800 | $4.800 | **$13.800** |
| 960 min (16h) | 1 × $9.000 | 4h → $9.600 | $9.000 (cap) | **$18.000** |
| 1440 min (24h) | 2 × $9.000 | $0 | $0 | **$18.000** |
| 1500 min (25h) | 2 × $9.000 | 1h → $2.400 | $2.400 | **$20.400** |

Tarifa **carro**: `per_minute=$100`, `per_hour=$3.600`, `plena=$12.000`.

| Duración | plenas 12h | fracción (h × $3.600 + min × $100) | fracción topada | cobro |
|---|---|---|---|---|
| 30 min | 0 | $3.000 | $3.000 | **$3.000** |
| 60 min | 0 | $3.600 | $3.600 | **$3.600** |
| 90 min | 0 | $6.600 | $6.600 | **$6.600** |
| 180 min | 0 | $10.800 | $10.800 | **$10.800** |
| 200 min (3h20) | 0 | $12.800 | $12.000 (cap) | **$12.000** |
| 240 min (4h) | 0 | $14.400 | $12.000 (cap) | **$12.000** |
| 840 min (14h) | 1 × $12.000 | 2h → $7.200 | $7.200 | **$19.200** |
| 1440 min (24h) | 2 × $12.000 | $0 | $0 | **$24.000** |

## Discontinuidad en el cruce horario (intencional)

Hay una discontinuidad en `dur = 60` que favorece al cliente:
- 59 min × $60 = $3.540
- 60 min → 1 × $2.400 = $2.400

Esto es válido porque C5 garantiza `per_hour ≤ 60 × per_minute` — la hora completa siempre es igual o más barata que 60 min sueltos.

## Tarifas de plan (mensualidad y quincena)

Hay dos unidades que **no** son cobros por sesión sino el precio de un plan
prepagado por un periodo fijo:

| unit | Periodo | Desde |
|---|---|---|
| `mensualidad` | 30 días | 00013 |
| `quincena` | 15 días | 00041 (2026-08-11) |

Ambas usan `value_cents` como precio del periodo completo y dejan los 3
campos de tiered pricing en NULL. Una sesión cubierta por un plan vigente
cobra $0.

**Categorías de unicidad.** Solo puede haber una tarifa de rotación activa
por `vehicle_type` (si hubiera dos, el cobro tomaría "cualquiera"). Los
planes, en cambio, son productos distintos entre sí: para un mismo
`vehicle_type` pueden convivir una mensualidad y una quincena activas, pero
no dos mensualidades. Ver C7 y C8.

> **Al agregar una unidad de plan nueva** hay que tocar los cuatro lugares
> que definen la frontera plan/rotación, o el plan se cobrará como parqueo
> por tiempo: el CHECK `tariffs_unit_check`, el CHECK
> `tariffs_parking_requires_tiered`, los índices únicos parciales, y la
> constante `PLAN_TARIFF_UNITS` en `parking/domain/entities/tariff.entity.ts`
> (de la que sale el filtro de todas las consultas del front).

## Lookup desde el app

`getActiveTariff(vehicle_type)`:

```sql
SELECT * FROM tariffs
WHERE vehicle_type = $1
  AND is_active = true
  AND _deleted = false
  AND unit NOT IN ('mensualidad', 'quincena')
LIMIT 1;
```

Como hay UNIQUE en (vehicle_type) para rotación activa, el resultado es determinista.

`getActivePlanTariff(vehicle_type, unit)` hace el lookup del precio de un
plan filtrando por la unidad exacta (`mensualidad` o `quincena`). Si no hay
tarifa configurada devuelve null y quien vende digita el monto a mano.

## Validaciones backend (constraints)

| # | Constraint | Razón |
|---|---|---|
| C1 | `per_minute_cents IS NOT NULL` cuando `unit NOT IN ('mensualidad','quincena')` | rotación necesita los 3 valores |
| C2 | `per_hour_cents IS NOT NULL` cuando `unit NOT IN ('mensualidad','quincena')` | idem |
| C3 | `plena_cents IS NOT NULL` cuando `unit NOT IN ('mensualidad','quincena')` | idem |
| C4 | Los 3 > 0 | no se acepta tarifa cero |
| C5 | `per_hour_cents <= per_minute_cents * 60` | hora ≤ 60 min sueltos (favorece cliente al cruce horario) |
| C6 | `plena_cents <= per_hour_cents * 24` | plena ≤ 24h. Nota: idealmente sería `≤ 12 × per_hour` (la plena cubre un ciclo de 12 h); endurecerlo requiere migration y validar tarifas existentes — pendiente. |
| C7 | UNIQUE `(vehicle_type)` WHERE `is_active=true AND _deleted=false AND unit NOT IN ('mensualidad','quincena')` | una sola tarifa de rotación activa por tipo (ajustada en 00043) |
| C8 | UNIQUE `(vehicle_type, unit)` WHERE `is_active=true AND _deleted=false AND unit IN ('mensualidad','quincena')` | un solo precio activo por plan y tipo; mensualidad y quincena conviven (00043) |

`grace_minutes` se conserva con valor por defecto 0; la UI no lo expone y el cálculo no lo consulta.

## Migrations vigentes

- `00023_tariff_tiered_pricing.sql` — agrega los 3 campos tiered con backfill desde value_cents/daily_cap_cents.
- `00024_tariff_sync_legacy_columns.sql` — sincroniza value_cents/daily_cap_cents con los nuevos (back-compat para mensualidad).
- `00025_tariff_tiered_not_null.sql` — exige los 3 NOT NULL cuando `unit != 'mensualidad'`.

`value_cents` y `daily_cap_cents` se mantienen como columnas legacy (mensualidad las usa con semántica propia). Se eliminarán en una migration posterior tras confirmar que ningún código las lee para parking.

## Specs derivados

- `parqueadero-web/specs/features/parking/calculate-parking-fee.spec.md` — implementación del algoritmo en cliente.
- `parqueadero-web/specs/features/parking/print-entry-ticket.spec.md` — formato del snapshot en ticket.

---
Status: vigente — modelo de ciclos de 12 h en código desde 2026-06-28 (`3c03f07`), spec actualizado 2026-07-04 (reemplaza el tope único por sesión del 2026-05-24; este a su vez reemplazó el MIN-de-tres del 2026-05-20).
