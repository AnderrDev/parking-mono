# Spec: Registrar Pago

## Identificador
`payments/register-payment`

## Descripción
UseCase que registra un pago asociado a la salida de un vehículo. Se invoca automáticamente desde `RegisterVehicleExitUseCase` — no es de uso directo por el operador, pero centraliza la lógica de validación de pago.

## Actor
Sistema (invocado por RegisterVehicleExit). Operador indirectamente.

## Pre-condiciones
- Usuario autenticado.
- Existe turno `open` para el operador actual (`cashierShiftId` requerido).
- El monto sea consistente con el método de pago.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| cashierShiftId | string (UUID) | Sí | Turno `open` del operador |
| method | PaymentMethod | Sí | efectivo, tarjeta_credito, tarjeta_debito, transferencia, nequi, daviplata, cortesia, error, mensual |
| amountCents | number | Sí | ≥ 0 (0 para cortesia/error/mensual) |
| invoiceId | string \| null | No | UUID de factura asociada |
| gatewayRef | string \| null | No | Referencia de pasarela (Wompi, etc.) |
| parkingSessionId | string \| null | No | Sesión de parking que origina el pago |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<PaymentEntity>` | Pago registrado con status='completed' |
| Turno no abierto | `Left<BusinessRuleFailure>` | "No hay turno abierto. Abre tu turno antes de registrar pagos." |
| Monto inválido | `Left<ValidationFailure>` | "El monto debe ser ≥ 0" |
| Monto en método libre | `Left<ValidationFailure>` | "Cortesía/error/mensual deben tener monto = 0" |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. `cashierShiftId` debe corresponder a un turno `open` — validación a nivel de BD (FK) y UseCase.
2. Métodos `cortesia`, `error`, `mensual`: `amountCents` DEBE ser 0 (son pagos sin cobro real).
3. Métodos `efectivo`, `tarjeta_*`, `nequi`, `daviplata`, `transferencia`: `amountCents > 0`.
4. `status = 'completed'` al registrar (pago inmediato). Pagos `pending` solo para pasarela externa.
5. Si `method` usa pasarela online (tarjeta_credito, daviplata, nequi): `gatewayRef` recomendado pero no obligatorio en Fase 6.

## Flujo Principal

1. Validar `amountCents ≥ 0`.
2. Validar coherencia monto ↔ método (free methods → 0).
3. Verificar turno `open` por `cashierShiftId`.
4. Insertar payment con `status = 'completed'`, `paid_at = now()`.
5. Retornar `Right(paymentEntity)`.

## Edge Cases

- `method = 'cortesia'`, `amountCents = 1000`: → `ValidationFailure`.
- `method = 'efectivo'`, `amountCents = 0`: → `ValidationFailure`.
- Pago sin factura (`invoiceId = null`): válido (factura puede generarse después).

## Dependencias
- `PaymentRepository.create()`
- `CashierRepository.findById()` (verificar turno open)

## Mapping a UI
- **No tiene UI propia** — se invoca desde `VehicleExitDialog` al confirmar salida.
- El resultado se refleja en el cuadre del turno en tiempo real.
