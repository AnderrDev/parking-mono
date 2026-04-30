# Spec: Abrir Turno de Caja

## Identificador
`cashier/open-shift`

## Descripción
UseCase que abre un nuevo turno de caja para el operador. Es prerequisito para registrar entradas/salidas y pagos.

## Actor
Operador.

## Pre-condiciones
- Usuario autenticado con rol `operador` o `admin`.
- No existe turno `open` para el mismo usuario.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| userId | string (UUID) | Sí | Usuario autenticado |
| openingBalanceCents | number | Sí | ≥ 0 (puede ser 0 si no hay efectivo inicial) |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<CashierShiftEntity>` | Turno creado con status='open' |
| Turno ya abierto | `Left<BusinessRuleFailure>` | "Ya tienes un turno abierto. Ciérralo antes de abrir uno nuevo." |
| Validación | `Left<ValidationFailure>` | Saldo inicial negativo |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. Constraint `uq_shifts_open_per_user` en BD garantiza unicidad — el UseCase verifica antes para dar mensaje claro.
2. `opening_balance_cents ≥ 0` (puede ser 0).
3. Al abrir: `status = 'open'`, `opened_at = now()`, `closing_balance_cents = null`, `difference_cents = null`.
4. Turno queda asociado al operador autenticado.

## Flujo Principal

1. Verificar que no existe turno `open` para `userId`.
2. Validar `openingBalanceCents ≥ 0`.
3. Insertar turno con `status = 'open'`.
4. Retornar `Right(shiftEntity)`.

## Edge Cases

- `openingBalanceCents = 0`: válido (turno sin efectivo inicial).
- Segundo intento de apertura sin cerrar el primero: `BusinessRuleFailure` con mensaje claro.

## Dependencias
- `CashierRepository.create()`
- `CashierRepository.findOpenByUser(userId)`

## Mapping a UI
- **Invocación**: `CashierShiftPage` → botón "Abrir turno" → form con saldo inicial.
- **Feedback**: Toast "Turno abierto" + UI cambia a estado "turno en curso".
- **Guard**: `requireOpenShift` en rutas de parking usa este estado para verificar.
