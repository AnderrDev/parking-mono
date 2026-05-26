# Spec: Calcular Tarifa de Parqueadero

## Identificador
`parking/calculate-parking-fee`

## Descripción
UseCase puro que calcula el monto a cobrar según la duración, la tarifa vigente y el plan mensual. Aplica el **modelo aditivo con tope plena** definido en `parqueadero-backend/specs/tariffs-pricing.spec.md`. NO accede a BD.

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
  hoursCompleted: number;        // floor(dur / 60)
  remainderMinutes: number;      // dur % 60
  perMinuteCents: number;        // snapshot del valor minuto
  perHourCents: number;          // snapshot del valor hora
  hoursSubtotalCents: number;    // hoursCompleted × perHourCents
  minutesSubtotalCents: number;  // remainderMinutes × perMinuteCents
  subtotalCents: number;         // suma de los dos subtotales
  plenaCents: number;            // tope de la tarifa
  cappedByPlena: boolean;        // true si subtotal > plena
  durationMinutes: number;
}

interface CalculateParkingFeeResult {
  amountCents: number;           // min(subtotalCents, plenaCents)
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
3. **Cobro aditivo:**
   ```
   hoursCompleted   = Math.floor(durationMinutes / 60)
   remainderMinutes = durationMinutes % 60
   hoursSubtotal    = hoursCompleted   × perHourCents
   minutesSubtotal  = remainderMinutes × perMinuteCents
   subtotal         = hoursSubtotal + minutesSubtotal
   ```
4. **Tope plena:**
   ```
   amountCents   = min(subtotal, plenaCents)
   cappedByPlena = subtotal > plenaCents
   ```
5. **Sin redondeo:** los 3 valores son enteros BIGINT en BD; la suma y MIN preservan enteros.

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

  const hoursCompleted   = Math.floor(durationMinutes / 60);
  const remainderMinutes = durationMinutes % 60;
  const hoursSubtotal    = hoursCompleted   * h;
  const minutesSubtotal  = remainderMinutes * m;
  const subtotal         = hoursSubtotal + minutesSubtotal;
  const cappedByPlena    = subtotal > p;
  const amount           = cappedByPlena ? p : subtotal;

  const breakdown = { hoursCompleted, remainderMinutes, perMinuteCents: m, perHourCents: h,
                      hoursSubtotalCents: hoursSubtotal, minutesSubtotalCents: minutesSubtotal,
                      subtotalCents: subtotal, plenaCents: p, cappedByPlena,
                      durationMinutes };

  if (isMonthly) return right({ amountCents: 0, reason: 'monthly', breakdown });
  return right({ amountCents: amount, reason: 'paid', breakdown });
}
```

## Edge Cases

- **Duración exactamente múltiplo de 60:** `remainderMinutes=0`, solo cobra horas.
- **`subtotal == plena`:** no se considera capped (`cappedByPlena=false`), ambos coinciden numéricamente.
- **`subtotal > plena`:** `cappedByPlena=true`, `amount=plena`.
- **Discontinuidad en `dur=60`:** intencional. 59 min × $60 = $3.540 > 1 × $2.400 = $2.400. C5 (`per_hour ≤ 60 × per_minute`) garantiza que pasar al cobro por hora es más barato o igual que 60 min sueltos.

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

Cuando aplica plena:

```
Detalle del cobro:
  4 horas × $2.400 = $9.600
  Subtotal           $9.600
  Tope diario (plena) $9.000   ←
```

**Ticket de entrada (`print-entry-ticket`):** muestra las 3 líneas como referencia:

```
Tarifa Moto: $60/min · $2.400/h · plena $9.000
```

## Cambios respecto a la versión anterior

- **Antes (2026-05-20):** MIN-de-tres entre `dur × per_minute`, `ceil(dur/60) × per_hour` y `plena`. El cliente siempre pagaba lo más barato.
- **Ahora (2026-05-24):** aditivo `floor(dur/60) × per_hour + (dur % 60) × per_minute`, con tope `plena`. Refleja el modelo operativo real del parqueadero.
- **Eliminado:** concepto de minutos de gracia (campo `graceMinutes` queda en 0 en BD, UI no lo expone). Las estancias muy cortas se cobran al `per_minute`.
- **Breakdown:** `winner` reemplazado por `cappedByPlena`. `byMinuteCents`/`byHourCents` reemplazados por `hoursSubtotalCents`/`minutesSubtotalCents` + descomposición `hoursCompleted`/`remainderMinutes`.

## Dependencias

- `TariffEntity` con los 3 campos tiered (ver `parqueadero-backend/specs/tariffs-pricing.spec.md`).
- Sin dependencias de BD ni red.

---
Status: vigente desde 2026-05-24 (reemplaza el modelo MIN-de-tres del 2026-05-20).
