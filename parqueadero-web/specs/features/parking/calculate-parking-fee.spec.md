# Spec: Calcular Tarifa de Parqueadero

## Identificador
`parking/calculate-parking-fee`

## Descripción
UseCase puro que calcula el monto a cobrar según la duración, la tarifa vigente y el plan mensual. Aplica el **modelo aditivo con ciclos de plena de 12 h** definido en `parqueadero-backend/specs/tariffs-pricing.spec.md`: cada ciclo de 12 h completado cobra una plena; la fracción final se cobra por hora + minuto con la plena como techo del ciclo, y todo se suma. NO accede a BD.

## Actor
Sistema (invocado por `register-vehicle-exit`, preview en tiempo real en el dialog de salida, reportes).

## Pre-condiciones
- Parámetros válidos (no NULL, positivos).
- La tarifa proviene de `getActiveTariff(vehicleType)` y trae los 3 campos tiered (`perMinuteCents`, `perHourCents`, `plenaCents`) seteados.

## Input

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| durationMinutes | number | Sí | > 0, entero |
| tariff | TariffEntity | Sí | `perMinuteCents > 0`, `perHourCents > 0`, `plenaCents > 0` |
| isMonthly | boolean | Sí | true si hay mensualidad activa |
| vehicleType | VehicleType | Sí | Enum: carro, moto, bicicleta, otro |

## Output

```typescript
type FeeReason = 'monthly' | 'paid';

interface FeeBreakdown {
  plenaBlockMinutes: number;           // 720 (constante: 12 h)
  plenaBlocksCompleted: number;        // floor(dur / 720) — ciclos de 12 h completos
  remainderAfterPlenaMinutes: number;  // dur % 720 — fracción que no completa ciclo
  plenaBlocksSubtotalCents: number;    // plenaBlocksCompleted × plenaCents
  remainderSubtotalCents: number;      // subtotal aditivo de la fracción (sin topar)
  hoursCompleted: number;              // floor(remainderAfterPlenaMinutes / 60)
  remainderMinutes: number;            // remainderAfterPlenaMinutes % 60
  perMinuteCents: number;              // snapshot del valor minuto
  perHourCents: number;                // snapshot del valor hora
  hoursSubtotalCents: number;          // hoursCompleted × perHourCents
  minutesSubtotalCents: number;        // remainderMinutes × perMinuteCents
  subtotalCents: number;               // plenaBlocksSubtotalCents + remainderSubtotalCents (sin topar)
  plenaCents: number;                  // precio/tope del ciclo de 12 h
  cappedByPlena: boolean;              // plenaBlocksCompleted > 0 || remainderCappedByPlena
  remainderCappedByPlena: boolean;     // true si remainderSubtotalCents > plenaCents
  durationMinutes: number;
}

interface CalculateParkingFeeResult {
  amountCents: number;           // plenaBlocksSubtotalCents + min(remainderSubtotalCents, plenaCents)
  reason: FeeReason;
  breakdown: FeeBreakdown;
}
```

| Caso | Tipo |
|---|---|
| Éxito con cobro | `Right<CalculateParkingFeeResult>` con `reason='paid'` |
| Mensualidad activa | `Right<{amountCents:0, reason:'monthly', breakdown}>` |
| Parámetros inválidos | `Left<ValidationFailure>` |

## Reglas de Negocio

1. **Validación temprana:** `durationMinutes > 0` entero, `tariff` con los 3 `*Cents` definidos y > 0.
2. **Mensualidad:** Si `isMonthly=true` → `amountCents=0`, `reason='monthly'`. El breakdown se calcula igual para auditoría.
3. **Ciclos de plena (12 h):**
   ```
   plenaBlocksCompleted       = Math.floor(durationMinutes / 720)
   remainderAfterPlenaMinutes = durationMinutes % 720
   plenaBlocksSubtotal        = plenaBlocksCompleted × plenaCents
   ```
   Cada ciclo completo cobra exactamente una plena (precio fijo del bloque, no un MIN).
4. **Cobro aditivo de la fracción:**
   ```
   hoursCompleted    = Math.floor(remainderAfterPlenaMinutes / 60)
   remainderMinutes  = remainderAfterPlenaMinutes % 60
   hoursSubtotal     = hoursCompleted   × perHourCents
   minutesSubtotal   = remainderMinutes × perMinuteCents
   remainderSubtotal = hoursSubtotal + minutesSubtotal
   ```
5. **Tope plena por ciclo y suma:**
   ```
   remainderCappedByPlena = remainderSubtotal > plenaCents
   remainderAmount        = remainderCappedByPlena ? plenaCents : remainderSubtotal
   amountCents            = plenaBlocksSubtotal + remainderAmount
   cappedByPlena          = plenaBlocksCompleted > 0 || remainderCappedByPlena
   ```
6. **Sin redondeo:** los 3 valores son enteros BIGINT en BD; la suma y MIN preservan enteros.

## Flujo Principal

```typescript
calculate(params): Either<Failure, CalculateParkingFeeResult> {
  const { durationMinutes, tariff, isMonthly } = params;

  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return left(new ValidationFailure('Duración debe ser un entero > 0', 'durationMinutes'));
  }
  const { perMinuteCents: m, perHourCents: h, plenaCents: p } = tariff;
  if (m == null || h == null || p == null) {
    return left(new ValidationFailure('Tarifa incompleta', 'tariff'));
  }
  if (m <= 0 || h <= 0 || p <= 0) {
    return left(new ValidationFailure('Tarifa con valores inválidos', 'tariff'));
  }

  const plenaBlockMinutes          = 12 * 60; // 720
  const plenaBlocksCompleted       = Math.floor(durationMinutes / plenaBlockMinutes);
  const remainderAfterPlenaMinutes = durationMinutes % plenaBlockMinutes;
  const hoursCompleted             = Math.floor(remainderAfterPlenaMinutes / 60);
  const remainderMinutes           = remainderAfterPlenaMinutes % 60;
  const hoursSubtotal              = hoursCompleted   * h;
  const minutesSubtotal            = remainderMinutes * m;
  const remainderSubtotal          = hoursSubtotal + minutesSubtotal;
  const plenaBlocksSubtotal        = plenaBlocksCompleted * p;
  const remainderCappedByPlena     = remainderSubtotal > p;
  const remainderAmount            = remainderCappedByPlena ? p : remainderSubtotal;
  const subtotal                   = plenaBlocksSubtotal + remainderSubtotal;
  const cappedByPlena              = plenaBlocksCompleted > 0 || remainderCappedByPlena;
  const amount                     = plenaBlocksSubtotal + remainderAmount;

  const breakdown = { plenaBlockMinutes, plenaBlocksCompleted, remainderAfterPlenaMinutes,
                      plenaBlocksSubtotalCents: plenaBlocksSubtotal,
                      remainderSubtotalCents: remainderSubtotal,
                      hoursCompleted, remainderMinutes, perMinuteCents: m, perHourCents: h,
                      hoursSubtotalCents: hoursSubtotal, minutesSubtotalCents: minutesSubtotal,
                      subtotalCents: subtotal, plenaCents: p, cappedByPlena,
                      remainderCappedByPlena, durationMinutes };

  if (isMonthly) return right({ amountCents: 0, reason: 'monthly', breakdown });
  return right({ amountCents: amount, reason: 'paid', breakdown });
}
```

## Edge Cases

- **Duración exactamente múltiplo de 60:** `remainderMinutes=0`, solo cobra horas.
- **Duración exactamente múltiplo de 720:** fracción en 0, cobra solo `N × plena` (720 min → 1 plena; 1440 min → 2 plenas).
- **`remainderSubtotal == plena`:** no se considera capped (`remainderCappedByPlena=false`), ambos coinciden numéricamente.
- **`remainderSubtotal > plena`:** `remainderCappedByPlena=true`, la fracción cobra `plena`.
- **`plenaBlocksCompleted > 0`:** `cappedByPlena=true` siempre (hubo al menos un ciclo a plena).
- **Discontinuidad en `dur=60`:** intencional. 59 min × $60 = $3.540 > 1 × $2.400 = $2.400. C5 (`per_hour ≤ 60 × per_minute`) garantiza que pasar al cobro por hora es más barato o igual que 60 min sueltos.
- **Ejemplo 14 h (840 min, moto):** 1 × plena $9.000 + 2h × $2.400 = **$13.800**.

## Mapping a UI

**Preview en `VehicleExitDialogComponent`:**

```
Vehículo ABC123 (Moto)
Entrada: 14:30
Salida: 17:00
Duración: 2h 30m

Detalle del cobro:
  2 horas × $2.400 = $4.800
  30 min × $60     = $1.800
                     ─────
                     $6.600
```

Cuando la fracción alcanza la plena (`remainderCappedByPlena`):

```
Detalle del cobro:
  4 horas × $2.400 = $9.600
  Subtotal           $9.600
  Tope plena (12 h)  $9.000   ←
```

Cuando hay ciclos de 12 h completos (`plenaBlocksCompleted > 0`), se muestra la línea de
bloques ANTES de la fracción, y una fila final de total (porque el detalle ya no es una
sola cifra):

```
Detalle del cobro:
  1 × plena (12 h)   $9.000
  2 horas × $2.400   $4.800
  Total              $13.800
```

Si además la fracción se topa (ej: 16 h moto):

```
Detalle del cobro:
  1 × plena (12 h)   $9.000
  4 horas × $2.400   $9.600
  Subtotal fracción  $9.600
  Tope plena (12 h)  $9.000   ←
  Total              $18.000
```

Regla: las filas Subtotal/Tope solo aparecen si `remainderCappedByPlena` (no basta
`cappedByPlena`, que también es true por el solo hecho de haber bloques); la fila Total
solo aparece si `plenaBlocksCompleted > 0`.

**Ticket de entrada (`print-entry-ticket`):** muestra las 3 líneas como referencia:

```
Tarifa Moto: $60/min · $2.400/h · plena $9.000
```

## Cambios respecto a versiones anteriores

- **2026-05-20:** MIN-de-tres entre `dur × per_minute`, `ceil(dur/60) × per_hour` y `plena`. El cliente siempre pagaba lo más barato.
- **2026-05-24:** aditivo `floor(dur/60) × per_hour + (dur % 60) × per_minute`, con `plena` como tope absoluto de la sesión. Eliminado el concepto de minutos de gracia (campo `graceMinutes` queda en 0 en BD, UI no lo expone).
- **2026-06-28 (`3c03f07`), documentado 2026-07-04:** la plena pasa a ser tope **por ciclo de 12 h** que se suma: `floor(dur/720) × plena + min(fracción aditiva, plena)`. Breakdown gana `plenaBlockMinutes`, `plenaBlocksCompleted`, `remainderAfterPlenaMinutes`, `plenaBlocksSubtotalCents`, `remainderSubtotalCents` y `remainderCappedByPlena`; `cappedByPlena` pasa a significar "hubo al menos un ciclo topado o completo".

## Dependencias

- `TariffEntity` con los 3 campos tiered (ver `parqueadero-backend/specs/tariffs-pricing.spec.md`).
- Sin dependencias de BD ni red.

---
Status: vigente — ciclos de plena de 12 h en código desde 2026-06-28 (`3c03f07`), spec actualizado 2026-07-04.
