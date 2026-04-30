# Spec: Listar Planes Mensuales

## Identificador
`monthly-plans/list-monthly-plans`

## Descripción
UseCase que retorna la lista paginada de planes mensuales, filtrable por estado y placa.

## Actor
Admin, Operador (solo lectura al verificar mensualidad).

## Pre-condiciones
- Usuario autenticado.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| search | string \| null | No | Busca en vehicle_plate |
| status | MonthlyPlanStatus \| null | No | active, expiring, expired, cancelled; null = todos |
| customerId | string \| null | No | Filtra por cliente |
| page | number | No | ≥ 1, default 1 |
| pageSize | number | No | 10–100, default 25 |
| sort | `{field, dir}` | No | fields: vehicle_plate, end_date, status, created_at |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<{data: MonthlyPlanEntity[], pagination: Pagination}>` | Lista paginada |
| Error servidor | `Left<ServerFailure>` | — |
| Error de red | `Left<NetworkFailure>` | — |

## Reglas de Negocio

1. Por defecto `_deleted = false`.
2. Sin filtro de status → retorna todos los estados.
3. Ordenación por defecto: `end_date ASC` (los que vencen primero, primero).
4. Operador solo puede ver planes `active` y `expiring` (RLS filtra).

## Flujo Principal

1. Validar params.
2. Construir query con filtros.
3. Retornar `Right({data, pagination})`.

## Edge Cases

- Filtro `status = 'expiring'` → los próximos a vencer (≤5 días) al tope de la lista.

## Dependencias
- `MonthlyPlanRepository.list()`

## Mapping a UI
- **Página**: `MonthlyPlansListPage` con `DataTableComponent`.
- **Columnas**: Placa, Cliente, Tipo plan, Inicio, Vence, Estado, Auto-renovar.
- **Badge de estado**: verde (active), amarillo (expiring), rojo (expired), gris (cancelled).
- **Acciones fila**: Editar, Cancelar.
