# Spec: Cuadre de Turno (Reconcile)

## Identificador
`cashier/reconcile`

## Descripción
UseCase puro (solo lectura) que calcula el resumen financiero de un turno: totales por método de pago, sesiones atendidas y diferencia de efectivo. No tiene efectos secundarios.

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
| Sin acceso | `Left<UnauthorizedFailure>` | Operador intentando ver turno ajeno |
| Error servidor | `Left<ServerFailure>` | — |

```typescript
interface ReconcileResult {
  shift: CashierShiftEntity;
  totalSessions: number;
  totalRevenueCents: number;
  byMethod: { method: string; count: number; amountCents: number }[];
  cashExpectedCents: number;   // opening + Σ efectivo
  cashCountedCents: number;    // closing_balance (si turno cerrado)
  differenceCents: number;     // counted - expected
}
```

## Reglas de Negocio

1. Solo incluye pagos `status = 'completed'`.
2. Métodos `cortesia`, `mensual`, `error` se incluyen en el breakdown pero con `amount_cents = 0` (son pagos sin cobro).
3. `totalRevenueCents = Σ(amount_cents) WHERE status='completed' AND method NOT IN ('cortesia','error','mensual')`.
4. Si el turno está `open` (aún no cerrado): `cashCountedCents = null`, `differenceCents = null`.
5. Operador solo puede reconciliar su propio turno. Admin puede reconciliar cualquiera.

## Flujo Principal

1. Buscar turno por `shiftId`.
2. Verificar acceso (propio o admin).
3. Agrupar payments por método.
4. Calcular totales.
5. Retornar `Right(reconcileResult)`.

## Edge Cases

- Turno sin pagos: todos los totales en 0.
- Turno abierto: `cashCountedCents = null`, `differenceCents = null`.
- Turno con solo pagos de cortesía: `totalRevenueCents = 0` pero `totalSessions > 0`.

## Dependencias
- `CashierRepository.findById()`
- `PaymentRepository.listByShift(shiftId)`

## Mapping a UI
- **Invocación**: `CashierShiftPage` → panel "Cuadre en tiempo real" visible durante el turno + modal detallado al cerrar.
- **Columnas**: Método | Transacciones | Total.
- **Footer**: Total recaudado | Efectivo esperado | Efectivo contado | Diferencia (destacado en rojo si hay).
