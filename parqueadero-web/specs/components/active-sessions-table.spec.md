# Spec: Active Sessions Table Component

## Tipo
Dumb Component

## Selector
`app-active-sessions-table`

## Propósito
Tabla genérica que muestra sesiones activas con información de vehículo, duración en tiempo real, tipo y acciones (cerrar sesión).

## Inputs

| Input | Tipo | Default | Descripción |
|---|---|---|---|
| sessions | ParkingSessionEntity[] | [] | Datos a mostrar |
| pagination | {page, pageSize, total, totalPages} | {page:1, pageSize:25, total:0, totalPages:0} | Metadata de paginación |
| loading | boolean | false | True mientras carga |
| sortBy | {field, direction} | {field: 'entryAt', direction: 'desc'} | Ordenamiento actual |

## Outputs

| Output | Tipo | Cuándo emite |
|---|---|---|
| rowClick | ParkingSessionEntity | Al hacer clic en una fila |
| actionClick | {action: 'exit'\|'details', session: ParkingSessionEntity} | Al hacer clic en botón de acción |
| pageChange | number | Al cambiar de página |
| sortChange | {field: string, direction: 'asc'\|'desc'} | Al hacer clic en header de columna |
| filterChange | {vehicleType?: VehicleType, minDuration?: number} | Al cambiar filtros |

## Estados Visuales

- **Loading**: Skeleton loader de 10 filas
- **Empty**: "No hay sesiones activas. El parqueadero está vacío."
- **With data**: Tabla con columnas: placa, tipo, duración actual, entrada, acciones
- **Error**: Mostrar error con botón de reintentar

## Columnas de Tabla

| Columna | Tipo | Contenido |
|---|---|---|
| Placa | string | ABC123 (clickeable → abre detalles) |
| Tipo | VehicleType | Carro / Moto / etc (con icono) |
| Entrada | DateTime | "14:30" o "14:30 (hace 2h 15m)" |
| Duración | string | "2h 15m 30s" (actualizado en tiempo real, cada 10s) |
| Acciones | buttons | Botón "Salida" (modal de cierre) |

## Comportamiento

1. Mostrar tabla con sesiones recibidas
2. Cada 10 segundos, recalcular duración actual (NOW() - entry_at)
3. Mostrar loading spinner en header si está refrescando
4. Filtros arriba de tabla: dropdown de tipo vehículo, input de duración mínima
5. Paginación abajo: controles prev/next, página actual, total
6. Ordenamiento: hacer headers clickeables, mostrar icono ↑ o ↓

## Integraciones

- Usa Pipe: `time-ago` para mostrar "hace X tiempo"
- Usa Pipe: `durationFormat` para mostrar duración en "Xh Ym"
- Usa Componente: `status-badge` para mostrar icono de sesión activa

## NO hace

- NO invoca UseCases directamente
- NO accede a BD
- NO maneja state de sesiones (es stateless)
- NO actualiza automáticamente (espera que el padre refresque via polling o Realtime)

---
Status: Pendiente de Implementación
