# Spec: Cerrar Turno de Caja

## Identificador
`cashier/close-shift`

## Descripción
UseCase que cierra el turno de caja activo del operador. Calcula diferencia entre efectivo esperado y contado; bloquea si la diferencia supera el umbral hasta justificar.

## Actor
Operador, Admin.

## Pre-condiciones
- Usuario autenticado.
- Existe turno `open` para el usuario (o admin cierra turno de otro).

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| shiftId | string (UUID) | Sí | Debe ser turno `open` del usuario |
| closingBalanceCents | number | Sí | ≥ 0 (efectivo físico contado) |
| justification | string \| null | Condicional | Requerido si `|diff| > 500000` (=$5.000 COP) |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<CashierShiftEntity>` | Turno cerrado con totales calculados |
| No encontrado | `Left<NotFoundFailure>` | "Turno no encontrado o ya cerrado" |
| Falta justificación | `Left<ValidationFailure>` | "La diferencia supera $5.000. Ingresa una justificación." |
| Validación | `Left<ValidationFailure>` | Saldo negativo |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. `expected_balance_cents = opening_balance_cents
     + Σ(payments.amount_cents WHERE method='efectivo' AND status='completed' AND shift_id=shiftId)
     − Σ(cash_withdrawals.amount_cents WHERE shift_id=shiftId AND _deleted=false)`.

   Los retiros parciales (HU-039) sacan efectivo de la caja durante el
   turno; deben restarse del esperado para que el cuadre sea simétrico
   con `ReconcileShiftUseCase` (UI).
2. `difference_cents = closing_balance_cents - expected_balance_cents`.
3. Si `|difference_cents| > 500_000` y `justification` es null o vacío → `ValidationFailure`.
4. Al cerrar: `status = 'closed'`, `closed_at = now()`, guardar `closing_balance_cents`, `expected_balance_cents`, `difference_cents`.
5. Un turno cerrado NO puede reabrirse ni modificarse.

## Flujo Principal

1. Buscar turno por `shiftId`. Verificar que pertenece al usuario y `status = 'open'`.
2. Validar `closingBalanceCents ≥ 0`.
3. Sumar pagos en efectivo del turno (`sumCashByShift`).
4. Sumar retiros parciales del turno (`listWithdrawalsByShift`).
5. Calcular `expected_balance_cents = opening + cash − withdrawals`.
6. Calcular `difference_cents = closing − expected`.
7. Si `|difference_cents| > 500_000`: verificar `justification` presente.
8. Actualizar turno con totales y `status = 'closed'`.
9. Retornar `Right(shiftEntity)`.

## Edge Cases

- Cierre exacto (`difference = 0`): no requiere justificación.
- Sobrante de $1 peso (`diff = 100` cents): dentro del umbral, sin bloqueo.
- Faltante de $10.000 COP (`diff = -1.000.000` cents): requiere justificación.
- Turno sin pagos en efectivo y sin retiros: `expected = opening_balance_cents`.
- Turno con retiro de $10.000 sin justificar: el cajero debe contar
  `opening + cash − $10.000`. Si lo cuenta correctamente, no hay diferencia.

## Dependencias
- `CashierRepository.findById()`
- `CashierRepository.close()`
- `CashierRepository.listWithdrawalsByShift(shiftId)` — para descontar retiros
- `PaymentRepository.sumCashByShift(shiftId)` — suma pagos en efectivo del turno

## Mapping a UI
- **Invocación**: `CashierShiftPage` → "Cerrar turno" → form con saldo contado + justificación condicional.
- **Validación en tiempo real**: mostrar diferencia calculada mientras el operador escribe el saldo contado.
- **Feedback**: Toast "Turno cerrado. Diferencia: ±$X" y UI vuelve a estado "sin turno".
