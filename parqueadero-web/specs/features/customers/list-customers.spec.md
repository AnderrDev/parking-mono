# Spec: Listar Clientes

## Identificador
`customers/list-customers`

## Descripción
UseCase que retorna la lista paginada de clientes, con búsqueda por nombre o documento.

## Actor
Admin, Operador (lectura al crear plan mensual).

## Pre-condiciones
- Usuario autenticado.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| search | string \| null | No | Busca en name, doc_number |
| includeDeleted | boolean | No | Solo admin, default false |
| page | number | No | ≥ 1, default 1 |
| pageSize | number | No | 10–100, default 25 |
| sort | `{field, dir}` | No | fields: name, doc_number, created_at |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<{data: CustomerEntity[], pagination: Pagination}>` | Lista paginada |
| Error servidor | `Left<ServerFailure>` | — |
| Error de red | `Left<NetworkFailure>` | — |

## Reglas de Negocio

1. Por defecto `_deleted = false`.
2. Búsqueda case-insensitive (ILIKE) en `name` y `doc_number`.
3. Operador no puede ver clientes eliminados.
4. Ordenación por defecto: `name ASC`.

## Flujo Principal

1. Validar params.
2. Construir query con filtros.
3. Retornar `Right({data, pagination})`.

## Edge Cases

- Sin resultados → lista vacía, no error.
- `search = "123"` → busca en `doc_number` y en `name`.

## Dependencias
- `CustomerRepository.list()`

## Mapping a UI
- **Página**: `CustomersListPage` con `DataTableComponent`.
- **Columnas**: Nombre, Tipo doc, Número doc, Email, Teléfono.
- **Acciones fila**: Editar, Ver planes mensuales, Desactivar.
