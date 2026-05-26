# Spec: Tarifa unificada (per_minute + per_hour + plena) — modelo aditivo

## Identificador
`backend/tariffs-pricing`

## Descripción

Una sola tarifa activa por `vehicle_type` (excepto mensualidades, ver más abajo). La tarifa expone **tres valores independientes**:

- `per_minute_cents` — valor del minuto suelto
- `per_hour_cents` — valor de cada hora completa
- `plena_cents` — tope absoluto por sesión (día completo)

El cobro es **aditivo**: por cada hora completa cobra `per_hour_cents`; por los minutos restantes cobra `per_minute_cents`. La plena actúa como techo duro: ninguna sesión supera ese valor.

**Cambios respecto al modelo anterior (2026-05-24):** se reemplaza el MIN-de-tres por el modelo aditivo. Se elimina el concepto de minutos de gracia del producto (la columna `grace_minutes` se mantiene en BD por compatibilidad pero queda en 0 y no participa del cálculo).

## Por qué aditivo y no MIN-de-tres

El cobro aditivo es el que esperan los operadores y los clientes en parqueaderos colombianos (cobro por hora completada + minutos extra al precio del minuto). El MIN-de-tres favorecía al cliente pero no reflejaba la realidad operativa.

Por simetría, se valida solo el sentido cliente-friendly: `per_hour ≤ 60 × per_minute` y `plena ≤ 24 × per_hour`. Lo contrario sería irracional (hora más cara que 60 minutos sueltos o plena más cara que un día entero al precio de hora).

## Algoritmo de cobro

Para una sesión de `durationMinutes` con `tariff`:

```
1. Si la sesión es mensualidad activa → cobra $0 (cubierta por plan).
2. hoursCompleted   = floor(durationMinutes / 60)
   remainderMinutes = durationMinutes % 60
3. subtotal = hoursCompleted × per_hour_cents
            + remainderMinutes × per_minute_cents
4. amountCents = min(subtotal, plena_cents)
   cappedByPlena = subtotal > plena_cents
```

**SIN redondeo a $50:** los 3 valores en BD son enteros (BIGINT) y la suma preserva enteros, así que el cobro es exacto al peso. Esto permite tarifas como `$60/min` (no múltiplo de $50). El operador maneja el cambio físico al cobrar en efectivo.

## Ejemplos canónicos

Tarifa **moto**: `per_minute=$60`, `per_hour=$2.400`, `plena=$9.000`.

| Duración | horas × $2.400 | min × $60 | subtotal | plena | cobro |
|---|---|---|---|---|---|
| 1 min | 0 | $60 | $60 | $9.000 | **$60** |
| 15 min | 0 | $900 | $900 | $9.000 | **$900** |
| 30 min | 0 | $1.800 | $1.800 | $9.000 | **$1.800** |
| 59 min | 0 | $3.540 | $3.540 | $9.000 | **$3.540** |
| 60 min | $2.400 | 0 | $2.400 | $9.000 | **$2.400** |
| 90 min | $2.400 | $1.800 | $4.200 | $9.000 | **$4.200** |
| 150 min (2h30) | $4.800 | $1.800 | $6.600 | $9.000 | **$6.600** |
| 180 min (3h) | $7.200 | 0 | $7.200 | $9.000 | **$7.200** |
| 240 min (4h) | $9.600 | 0 | $9.600 | $9.000 | **$9.000 (cap)** |
| 720 min (12h) | $28.800 | 0 | $28.800 | $9.000 | **$9.000 (cap)** |
| 1440 min (24h) | $57.600 | 0 | $57.600 | $9.000 | **$9.000 (cap)** |

Tarifa **carro**: `per_minute=$100`, `per_hour=$3.600`, `plena=$12.000`.

| Duración | horas × $3.600 | min × $100 | subtotal | cobro |
|---|---|---|---|---|
| 30 min | 0 | $3.000 | $3.000 | **$3.000** |
| 60 min | $3.600 | 0 | $3.600 | **$3.600** |
| 90 min | $3.600 | $3.000 | $6.600 | **$6.600** |
| 180 min | $10.800 | 0 | $10.800 | **$10.800** |
| 200 min (3h20) | $10.800 | $2.000 | $12.800 | **$12.000 (cap)** |
| 240 min (4h) | $14.400 | 0 | $14.400 | **$12.000 (cap)** |
| 1440 min (24h) | $86.400 | 0 | $86.400 | **$12.000 (cap)** |

## Discontinuidad en el cruce horario (intencional)

Hay una discontinuidad en `dur = 60` que favorece al cliente:
- 59 min × $60 = $3.540
- 60 min → 1 × $2.400 = $2.400

Esto es válido porque C5 garantiza `per_hour ≤ 60 × per_minute` — la hora completa siempre es igual o más barata que 60 min sueltos.

## Mensualidad

`unit='mensualidad'` es un tipo de tarifa **distinto**: representa el precio mensual de un plan, no un cobro por sesión. Sigue usando `value_cents` (precio del mes) y los 3 campos tiered quedan en NULL. Una sesión asociada a una mensualidad activa cobra $0.

El UNIQUE de "una tarifa por vehicle_type" **excluye** mensualidad — pueden coexistir una tarifa de parking y una de mensualidad para el mismo `vehicle_type`.

## Lookup desde el app

`getActiveTariff(vehicle_type)`:

```sql
SELECT * FROM tariffs
WHERE vehicle_type = $1
  AND is_active = true
  AND _deleted = false
  AND unit != 'mensualidad'
LIMIT 1;
```

Como hay UNIQUE en (vehicle_type) para parking activas, el resultado es determinista.

## Validaciones backend (constraints)

| # | Constraint | Razón |
|---|---|---|
| C1 | `per_minute_cents IS NOT NULL` cuando `unit != 'mensualidad'` | parking necesita los 3 valores |
| C2 | `per_hour_cents IS NOT NULL` cuando `unit != 'mensualidad'` | idem |
| C3 | `plena_cents IS NOT NULL` cuando `unit != 'mensualidad'` | idem |
| C4 | Los 3 > 0 | no se acepta tarifa cero |
| C5 | `per_hour_cents <= per_minute_cents * 60` | hora ≤ 60 min sueltos (favorece cliente al cruce horario) |
| C6 | `plena_cents <= per_hour_cents * 24` | plena ≤ 24h |
| C7 | UNIQUE `(vehicle_type)` WHERE `is_active=true AND _deleted=false AND unit != 'mensualidad'` | una sola parking activa por tipo |

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
Status: vigente desde 2026-05-24 (reemplaza el modelo MIN-de-tres del 2026-05-20).
