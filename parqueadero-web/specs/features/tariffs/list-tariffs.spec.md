# Spec: Listar Tarifas

## Identificador
`tariffs/list-tariffs`

## Descripción
UseCase que retorna la lista paginada de tarifas, con filtros opcionales por tipo de vehículo y estado activo.

## Actor
Admin (lectura + edición), Operador (solo lectura al seleccionar tarifa en entrada).

## Pre-condiciones
- Usuario autenticado con rol `admin` u `operador`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| vehicleType | VehicleType \| null | No | Enum o null para todos |
| isActive | boolean \| null | No | null = todos; por defecto `true` |
| page | number | No | ≥ 1, default 1 |
| pageSize | number | No | 10–100, default 25 |
| sort | `{field, dir}` | No | fields: name, vehicle_type, value_cents, created_at |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<{data: TariffEntity[], pagination: Pagination}>` | Lista paginada |
| Error servidor | `Left<ServerFailure>` | Error de BD |
| Error de red | `Left<NetworkFailure>` | Sin conexión |

## Reglas de Negocio

1. Por defecto solo se retornan tarifas con `is_active = true` y `_deleted = false`.
2. Admin puede pedir `isActive = null` para ver todas (incluyendo desactivadas).
3. Operador solo puede ver tarifas activas (validar en RLS).
4. Ordenación por defecto: `vehicle_type ASC, name ASC`.

## Flujo Principal

1. Validar params (page ≥ 1, pageSize en rango).
2. Llamar `TariffRepository.list(params)`.
3. Retornar `Right({data, pagination})`.

## Edge Cases

- Lista vacía → `Right({data: [], pagination: {..., total: 0}})`.
- Filtro `vehicleType = 'bicicleta'` sin tarifas activas → lista vacía, no error.

## Dependencias
- `TariffRepository.list()`

## Mapping a UI
- **Página**: `TariffsListPage` (admin) con `DataTableComponent`.
- **Columnas**: Nombre, Tipo vehículo, Unidad, Valor, Gracia, Tope, Estado.
- **Acciones fila**: Editar, Desactivar.
- **Filtros**: tipo vehículo (select), mostrar inactivas (checkbox, solo admin).
