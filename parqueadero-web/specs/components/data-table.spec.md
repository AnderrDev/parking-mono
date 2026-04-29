# Spec: Data Table Component (Generic)

## Tipo
Dumb Component

## Selector
`app-data-table`

## Propósito
Componente genérico reutilizable para mostrar cualquier array de datos en formato tabla. Soporta paginación, ordenamiento, filtrado, y acciones por fila.

## Generics

```typescript
DataTableComponent<T>
```

## Inputs

| Input | Tipo | Default | Descripción |
|---|---|---|---|
| data | T[] | [] | Array de datos a mostrar |
| columns | {key: string, header: string, width?: string, formatter?: (value) => string}[] | [] | Definición de columnas |
| pagination | {page, pageSize, total, totalPages} | {page:1, pageSize:25, total:0, totalPages:0} | Metadata |
| loading | boolean | false | Estado de carga |
| actions | {label: string, icon?: string, disabled?: (row) => boolean}[] | [] | Botones por fila |
| emptyMessage | string | "No hay datos" | Mensaje cuando está vacío |

## Outputs

| Output | Tipo | Cuándo emite |
|---|---|---|
| rowClick | T | Al hacer clic en una fila (si no está deshabilitada) |
| actionClick | {action: string, row: T} | Al hacer clic en un botón de acción |
| pageChange | number | Al cambiar de página |
| sortChange | {field: string, direction: 'asc'\|'desc'} | Al hacer clic en header |

## Comportamiento

1. Mostrar tabla con columnas especificadas
2. Cada fila clickeable (a menos que `rowDisabled()` retorne true)
3. Headers clickeables para ordenar (mostrar ↑↓)
4. Paginación: prev/next, dropdown de pageSize, saltos a página específica
5. Acciones por fila: buttons con icono + label
6. Responsive: en mobile, mostrar vista de tarjetas en lugar de tabla

## Ejemplos de Uso

```typescript
// En ParkingSessionsPage
<app-data-table
  [data]="sessions"
  [columns]="[
    {key: 'vehicle_plate', header: 'Placa', width: '100px'},
    {key: 'vehicle_type', header: 'Tipo', formatter: (v) => formatVehicleType(v)},
    {key: 'entry_at', header: 'Entrada', formatter: (v) => formatTime(v)},
    {key: 'duration_minutes', header: 'Duración', formatter: (v) => formatDuration(v)}
  ]"
  [pagination]="pagination"
  [loading]="loading"
  [actions]="[
    {label: 'Salida', icon: 'exit', disabled: (row) => !row.active}
  ]"
  (rowClick)="onSessionClick($event)"
  (actionClick)="onAction($event)"
  (pageChange)="onPageChange($event)"
  (sortChange)="onSortChange($event)">
</app-data-table>
```

---
Status: Pendiente de Implementación
