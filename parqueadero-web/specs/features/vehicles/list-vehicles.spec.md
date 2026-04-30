# Spec: Listar Vehículos

## Identificador
`vehicles/list-vehicles`

## Descripción
UseCase que retorna la lista paginada de vehículos registrados, con búsqueda por placa y filtros por tipo.

## Actor
Admin, Operador (al buscar vehículo en entrada — ver también `search-vehicle-by-plate`).

## Pre-condiciones
- Usuario autenticado.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| search | string \| null | No | Busca por placa (ILIKE) |
| vehicleType | VehicleType \| null | No | Filtro por tipo |
| customerId | string \| null | No | Filtra vehículos de ese cliente |
| includeDeleted | boolean | No | Solo admin, default false |
| page | number | No | ≥ 1, default 1 |
| pageSize | number | No | 10–100, default 25 |
| sort | `{field, dir}` | No | fields: plate, type, created_at |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<{data: VehicleEntity[], pagination: Pagination}>` | Lista paginada |
| Error servidor | `Left<ServerFailure>` | — |
| Error de red | `Left<NetworkFailure>` | — |

## Reglas de Negocio

1. Por defecto `_deleted = false`.
2. Búsqueda de placa normalizada (UPPER, sin espacios) antes de ILIKE.
3. Ordenación por defecto: `plate ASC`.

## Flujo Principal

1. Normalizar `search` si presente.
2. Construir query con filtros.
3. Retornar `Right({data, pagination})`.

## Edge Cases

- `customerId` con cliente que no existe → lista vacía, no error.
- Sin resultados → `Right({data: [], pagination: {...}})`.

## Dependencias
- `VehicleRepository.list()`

## Mapping a UI
- **Página**: `VehiclesListPage` con `DataTableComponent`.
- **Columnas**: Placa, Tipo, Color, Marca, Cliente propietario.
- **Acciones fila**: Editar, Ver historial, Desactivar.
