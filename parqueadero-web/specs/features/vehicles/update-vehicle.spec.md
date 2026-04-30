# Spec: Actualizar Vehículo

## Identificador
`vehicles/update-vehicle`

## Descripción
UseCase que actualiza los atributos editables de un vehículo. La placa es inmutable.

## Actor
Admin.

## Pre-condiciones
- Usuario autenticado con rol `admin`.
- Vehículo existe y `_deleted = false`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| id | string (UUID) | Sí | Debe existir |
| color | string \| null | No | max 50 chars |
| brand | string \| null | No | max 50 chars |
| ownerCustomerId | string \| null | No | UUID de cliente existente o null para quitar propietario |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<VehicleEntity>` | Vehículo actualizado |
| No encontrado | `Left<NotFoundFailure>` | "Vehículo no encontrado" |
| Cliente no existe | `Left<NotFoundFailure>` | "Cliente propietario no encontrado" |
| Validación | `Left<ValidationFailure>` | Campo inválido |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. `plate` y `vehicle_type` son **inmutables**.
2. Solo se actualizan los campos enviados (patch).
3. Si `ownerCustomerId` presente: cliente debe existir y `_deleted = false`.
4. Enviar `ownerCustomerId = null` → elimina la asociación de propietario.

## Flujo Principal

1. Buscar vehículo por `id`. Si no existe → `NotFoundFailure`.
2. Si `ownerCustomerId` presente: verificar que cliente existe.
3. Aplicar patch.
4. Retornar vehículo actualizado.

## Edge Cases

- Solo actualizar `color = null` → borra el color.
- Cambiar `ownerCustomerId` de cliente A a cliente B: válido.

## Dependencias
- `VehicleRepository.update()`
- `CustomerRepository.findById()` (si ownerCustomerId)

## Mapping a UI
- **Invocación**: Fila → "Editar" → `VehicleEditDialog` (modo edit).
- **Feedback**: Toast "Vehículo actualizado".
