# Spec: Obtener Sesiones Activas

## Identificador
`parking/get-active-sessions`

## Descripción
Trae todas las sesiones de parqueadero activas (status='active') del turno actual, paginadas y filtradas opcionalmente por tipo de vehículo. Usado en dashboard del operario y vista de reportes.

## Actor
Operario, Admin, Contador

## Pre-condiciones
- Usuario autenticado
- Hay un turno de caja abierto (para operario)

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| pagination | {page, pageSize} | Sí | page >= 1, pageSize en [10, 25, 50, 100] |
| filters | {vehicleType?, minDuration?, status?} | No | vehicleType: VehicleType enum; minDuration: minutos entero > 0 |
| sortBy | {field, direction} | No | field: 'entryAt', 'plate', 'duration'; direction: 'asc', 'desc' |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<{data: ParkingSessionEntity[], pagination: {page, pageSize, total, totalPages}}>` | Lista de sesiones + metadata de paginación |
| Error: sin sesiones | `Right<{data: [], pagination: {...}}>` | Lista vacía es éxito, no error |
| Error: acceso | `Left<UnauthorizedFailure>` | Usuario no tiene permiso para ver activas |

## Reglas de Negocio

1. **Filtro status**: Solo retornar sesiones con status='active' y `_deleted=FALSE`.

2. **Por turno**: Operario solo ve sus propias sesiones (entrada_user_id = userId). Admin y Contador ven todas.

3. **Duración en tiempo real**: `durationMinutes = (NOW() - entry_at) / 60` — se calcula dinámicamente.

4. **Paginación**: Default page=1, pageSize=25. Max pageSize=100.

5. **Ordenamiento**: Default ordenar por entryAt DESC (más recientes arriba).

## Flujo Principal

1. **Validar acceso**: Si rol='operario', filtrar por userId. Si rol IN ['admin', 'contador'], ver todas.

2. **Aplicar filtros**
   - Status: always 'active'
   - vehicleType: si viene, WHERE vehicle_type = ?
   - minDuration: si viene, WHERE (NOW() - entry_at) >= minDuration
   - Bitácora de cambios: excluir _deleted=true

3. **Contar total**: SELECT COUNT(*) con los mismos filtros

4. **Aplicar sort** y paginación (LIMIT, OFFSET)

5. **Cargar sesiones** con mapper de DTO a Entity

6. **Enriquecer datos**:
   - Calcular durationMinutes = (NOW() - entry_at) / 60
   - Buscar monthly_plan si session.monthly_plan_id no NULL
   - Si hay monthly_plan, incluir status y end_date

7. **Retornar**:
   ```
   Right<{
     data: [ParkingSessionEntity...],
     pagination: { page, pageSize, total, totalPages }
   }>
   ```

## Edge Cases

- **Sin sesiones activas**: Retornar list vacía es válido (no es error)
- **Page > totalPages**: Retornar list vacía (sin error)
- **Cambios en tiempo real**: Si otra pestaña cierra una sesión, esta query sigue viéndola hasta refrescar

## Dependencias

- `ParkingRepository.getActiveSessions(filter, pagination, sort)`

## Mapping a UI

- **Componente**: `ActiveSessionsTableComponent` (dumb)
- **Inputs**: @Input sessions, @Input pagination, @Input loading
- **Outputs**: @Output pageChange, @Output sortChange, @Output filterChange
- **Actualización**: Cada 5-10 segundos (polling) o via Supabase Realtime

---
Status: Pendiente de Implementación
