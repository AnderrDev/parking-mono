# Spec: Listar Pagos

## Identificador
`payments/list-payments`

## Descripción
UseCase que retorna los pagos de un turno o rango de fechas, filtrable por método. Usado para el cuadre de caja y revisión histórica.

## Actor
Operador (solo su turno), Admin/Contador (cualquier turno o rango).

## Pre-condiciones
- Usuario autenticado.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| shiftId | string \| null | No | Filtra por turno específico |
| dateFrom | Date \| null | No | Inicio del rango (UTC) |
| dateTo | Date \| null | No | Fin del rango (UTC); >= dateFrom |
| method | PaymentMethod \| null | No | Filtro por método de pago |
| status | 'completed' \| 'pending' \| null | No | Default: null (todos) |
| page | number | No | ≥ 1, default 1 |
| pageSize | number | No | 10–100, default 50 |

*Al menos uno de `shiftId` o `dateFrom` debe estar presente.*

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<{data: PaymentEntity[], pagination: Pagination, totalCents: number}>` | Lista + total acumulado |
| Parámetros insuficientes | `Left<ValidationFailure>` | "Se requiere shiftId o dateFrom" |
| Fechas inválidas | `Left<ValidationFailure>` | "dateTo debe ser ≥ dateFrom" |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. `totalCents = Σ(amount_cents)` de los resultados filtrados (excluye cortesía/error/mensual si el contexto es ingreso real — pero sí los incluye en el listado).
2. Operador solo ve pagos de sus propios turnos (RLS en BD).
3. Admin/Contador ven todos.
4. Ordenación por defecto: `paid_at DESC`.
5. `_deleted = false` por defecto.

## Flujo Principal

1. Validar que `shiftId` o `dateFrom` estén presentes.
2. Validar fechas si presentes.
3. Construir query con filtros.
4. Calcular `totalCents` como suma del conjunto filtrado.
5. Retornar `Right({data, pagination, totalCents})`.

## Edge Cases

- `shiftId` sin pagos → lista vacía, `totalCents = 0`.
- `method = 'cortesia'` → muestra pagos de cortesía con `amountCents = 0`.
- Rango de 1 mes sin `shiftId` → puede ser grande; respetar paginación.

## Dependencias
- `PaymentRepository.list(params)`

## Mapping a UI
- **Invocación**: `CashierShiftPage` → tabla de pagos del turno en curso.
- **Columnas**: Hora | Placa | Método | Monto.
- **Footer**: Total recaudado en efectivo / Total tarjeta / Total digital.
- **Admin**: `ReportsPage` → filtro por fecha/método/operador (Fase 7).
