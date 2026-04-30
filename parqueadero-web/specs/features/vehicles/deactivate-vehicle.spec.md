# Spec: Desactivar Vehículo

## Identificador
`vehicles/deactivate-vehicle`

## Descripción
UseCase que realiza soft delete de un vehículo del catálogo.

## Actor
Admin.

## Pre-condiciones
- Usuario autenticado con rol `admin`.
- Vehículo existe y `_deleted = false`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| id | string (UUID) | Sí | Debe existir |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<void>` | Vehículo desactivado |
| No encontrado | `Left<NotFoundFailure>` | "Vehículo no encontrado" |
| Sesión activa | `Left<BusinessRuleFailure>` | "El vehículo tiene una sesión activa. Ciérrala antes de desactivar." |
| Plan activo | `Left<BusinessRuleFailure>` | "El vehículo tiene un plan mensual activo." |
| Ya eliminado | `Left<BusinessRuleFailure>` | "El vehículo ya está desactivado" |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. Soft delete: `_deleted = true`. **Nunca** `DELETE` físico.
2. Bloquear si `parking_sessions` tiene sesión con `status = 'active'` y `vehicle_plate = plate`.
3. Bloquear si `monthly_plans` tiene plan con `status IN ('active', 'expiring')` y `vehicle_plate = plate`.
4. Historial de sesiones completadas queda intacto.

## Flujo Principal

1. Buscar vehículo por `id`. Si no existe → `NotFoundFailure`.
2. Si ya `_deleted = true` → `BusinessRuleFailure`.
3. Verificar sesión activa.
4. Verificar plan mensual activo/expiring.
5. Actualizar `_deleted = true`.
6. Retornar `Right(void)`.

## Edge Cases

- Vehículo con solo historial de sesiones `completed`: desactivación directa.
- Vehículo sin propietario: se puede desactivar igual.

## Dependencias
- `VehicleRepository.deactivate()`
- `ParkingRepository.getActiveSessionByPlate()`
- `MonthlyPlanRepository.getActivePlanByPlate()`

## Mapping a UI
- **Invocación**: Fila → "Desactivar" → `ConfirmDialog`.
- **Si sesión activa**: "Cierra primero la sesión del vehículo".
- **Feedback éxito**: Toast "Vehículo desactivado".
