# Spec: Desactivar Cliente

## Identificador
`customers/deactivate-customer`

## Descripción
UseCase que realiza soft delete de un cliente. Solo admin.

## Actor
Admin.

## Pre-condiciones
- Usuario autenticado con rol `admin`.
- Cliente existe y `_deleted = false`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| id | string (UUID) | Sí | Debe existir |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<void>` | Cliente desactivado |
| No encontrado | `Left<NotFoundFailure>` | "Cliente no encontrado" |
| Tiene planes activos | `Left<BusinessRuleFailure>` | "El cliente tiene planes mensuales activos. Cancélalos antes de desactivar." |
| Ya eliminado | `Left<BusinessRuleFailure>` | "El cliente ya está desactivado" |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. Soft delete: `_deleted = true`. **Nunca** `DELETE` físico.
2. Si el cliente tiene planes mensuales con `status IN ('active', 'expiring')` → bloquear con `BusinessRuleFailure`.
3. Vehículos asociados (`owner_customer_id`) quedan con `owner_customer_id = NULL` (ON DELETE SET NULL en BD).
4. Facturas y pagos históricos se mantienen íntegros.
5. Cambio en `audit_log`.

## Flujo Principal

1. Buscar cliente por `id`. Si no existe → `NotFoundFailure`.
2. Si ya `_deleted = true` → `BusinessRuleFailure`.
3. Verificar planes mensuales activos/expiring. Si existen → `BusinessRuleFailure`.
4. Actualizar `_deleted = true`.
5. Registrar en `audit_log`.
6. Retornar `Right(void)`.

## Edge Cases

- Cliente con plan mensual `expired` o `cancelled`: se puede desactivar.
- Cliente sin vehículos ni planes: desactivación directa.

## Dependencias
- `CustomerRepository.deactivate()`
- `MonthlyPlanRepository.countActiveByCustomer(customerId)`

## Mapping a UI
- **Invocación**: Fila → "Desactivar" → `ConfirmDialog`.
- **Si bloqueado**: Dialog con mensaje "Primero cancela los planes activos".
- **Feedback éxito**: Toast "Cliente desactivado".
