# Spec: Cuadre de Turno (Reconcile)

## Identificador
`cashier/reconcile`

## Descripción
UseCase puro (solo lectura) que calcula el resumen financiero de un turno:
totales por método de pago **agrupados en Efectivo / Digital / Sin cobro**,
movimientos manuales, sesiones atendidas y diferencia de efectivo.
No tiene efectos secundarios.

## Actor
Operador (su propio turno), Admin/Contador (cualquier turno).

## Pre-condiciones
- Usuario autenticado.
- Turno existe.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| shiftId | string (UUID) | Sí | Debe existir |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<ReconcileResult>` | Resumen financiero completo |
| No encontrado | `Left<NotFoundFailure>` | "Turno no encontrado" |
| Error servidor | `Left<ServerFailure>` | — |

```typescript
interface ReconcileResult {
  shift: CashierShiftEntity;
  totalSessions: number;
  totalRevenueCents: number;      // Σ cobrado (excluye cortesia/error/mensual)
  byMethod: { method: string; count: number; amountCents: number }[];
  cashCollectedCents: number;     // Σ pagos método 'efectivo'
  digitalCollectedCents: number;  // Σ pagos métodos digitales
  cashExpectedCents: number;      // opening + efectivo + entradas manuales − salidas manuales
  cashCountedCents: number | null;  // closing_balance (si turno cerrado)
  differenceCents: number | null;   // counted − expected (si turno cerrado)
  withdrawalsTotalCents: number;  // Σ salidas manuales (HU-039, movement_type='out')
  manualIncomeCents: number;      // Σ entradas manuales (movement_type='in')
}
```

## Reglas de Negocio

1. Solo incluye pagos `status = 'completed'`.
2. Métodos `cortesia`, `mensual`, `error` se incluyen en el breakdown pero con
   `amount_cents = 0` (son pagos sin cobro).
3. `totalRevenueCents = Σ(amount_cents) WHERE method NOT IN ('cortesia','error','mensual')`.
4. Grupos de métodos: ver clasificación en `close-shift.spec.md`
   (`DIGITAL_PAYMENT_METHODS` / `FREE_PAYMENT_METHODS`).
5. Los movimientos manuales de efectivo (HU-039) afectan `cashExpectedCents`,
   nunca el total digital.
6. Si el turno está `open`: `cashCountedCents = null`, `differenceCents = null`.

## Flujo Principal

1. Buscar turno por `shiftId`.
2. Listar pagos del turno y agrupar por método.
3. Listar movimientos manuales del turno.
4. Calcular totales por grupo (efectivo / digital) y esperado de efectivo.
5. Retornar `Right(reconcileResult)`.

## Edge Cases

- Turno sin pagos: todos los totales en 0.
- Turno abierto: `cashCountedCents = null`, `differenceCents = null`.
- Turno con solo pagos de cortesía: `totalRevenueCents = 0` pero `totalSessions > 0`.
- Turno con solo pagos digitales: `cashExpectedCents = opening ± movimientos manuales`.

## Dependencias
- `CashierRepository.findById()`
- `CashierRepository.listWithdrawalsByShift(shiftId)`
- `PaymentRepository.listByShift(shiftId)`

## Mapping a UI

- **Invocación**: `CashierShiftPage` → card "Cuadre actual" visible durante el turno.
- **Agrupación visual**: el breakdown por método se agrupa en tres secciones con
  subtotal: **Efectivo en caja**, **Digital en cuentas**, **Sin cobro** (colapsable
  o discreta). Nunca una lista plana que mezcle canales.
- **Header de página**: muestra dos indicadores separados — "Efectivo esperado" y
  "Digital recibido" — además del total recaudado.
- **Cierre**: el detalle completo se re-presenta en el modal "Resumen de cierre"
  antes de confirmar (ver `close-shift.spec.md`).
- **Footer del cuadre**: Total recaudado | Efectivo esperado (con movimientos
  manuales desglosados) | Digital en cuentas.
