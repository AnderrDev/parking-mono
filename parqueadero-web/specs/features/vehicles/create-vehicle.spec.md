# Spec: Crear Vehículo

## Identificador
`vehicles/create-vehicle`

## Descripción
UseCase que registra un nuevo vehículo en el catálogo. La placa es el identificador único e inmutable.

## Actor
Admin.

## Pre-condiciones
- Usuario autenticado con rol `admin`.
- No existe vehículo activo con la misma placa.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| plate | string | Sí | Formato colombiano (ABC123 o ABC12D); normalizar UPPER |
| vehicleType | VehicleType | Sí | carro, moto, bicicleta, otro |
| color | string \| null | No | max 50 chars |
| brand | string \| null | No | max 50 chars |
| ownerCustomerId | string \| null | No | UUID de cliente existente |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<VehicleEntity>` | Vehículo creado |
| Placa duplicada | `Left<BusinessRuleFailure>` | "Ya existe un vehículo con placa {plate}" |
| Placa inválida | `Left<ValidationFailure>` | "Formato de placa inválido" |
| Cliente no existe | `Left<NotFoundFailure>` | "Cliente propietario no encontrado" |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. Placa normalizada (UPPER, trim) antes de insertar y verificar duplicado.
2. Placa UNIQUE en BD — constraint + validación en UseCase.
3. `ownerCustomerId`: si presente, el cliente debe existir y `_deleted = false`.
4. No es requerido tener cliente propietario (vehículos esporádicos).

## Flujo Principal

1. Normalizar placa.
2. Validar formato de placa.
3. Verificar duplicado de placa.
4. Si `ownerCustomerId`: verificar que cliente existe.
5. Insertar vehículo.
6. Retornar `Right(vehicleEntity)`.

## Edge Cases

- Placa sin dueño (`ownerCustomerId = null`): válido.
- Registrar `ABC123` cuando existe `ABC-123` (sin guión): normalización las hace iguales → duplicado.
- `vehicleType = 'otro'`: válido (motos de carga, bicicletas eléctricas, etc.).

## Dependencias
- `VehicleRepository.create()`
- `CustomerRepository.findById()` (si ownerCustomerId)

## Mapping a UI
- **Invocación**: `VehiclesListPage` → "Nuevo vehículo" → `VehicleEditDialog`.
- **Formulario**: `VehicleForms.createVehicleForm()`.
- **Feedback**: Toast "Vehículo registrado exitosamente".
