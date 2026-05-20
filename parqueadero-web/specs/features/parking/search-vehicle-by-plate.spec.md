# Spec: Buscar Vehículo por Placa

## Identificador
`parking/search-vehicle-by-plate`

## Descripción
UseCase que busca la información de un vehículo por su placa. Retorna el vehículo, su historial reciente, y si hay una sesión activa. Se usa en el formulario de entrada/salida para pre-llenar datos.

## Actor
Operario, Admin

## Pre-condiciones
- Usuario autenticado
- Placa es válida y normalizada

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| plate | string | Sí | Formato colombiano normalizado (ABC123) |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito: existe | `Right<{vehicle: VehicleEntity, activeSessions: ParkingSessionEntity[], lastSessions: ParkingSessionEntity[], monthlyPlan?: MonthlyPlanEntity}>` | Datos completos del vehículo |
| Éxito: no existe | `Right<{vehicle: null, activeSessions: [], lastSessions: [], monthlyPlan: null}>` | Retorna estructura vacía (es válido) |
| Error: placa inválida | `Left<ValidationFailure>` | "Placa ABC123 no cumple formato" |

## Reglas de Negocio

1. **Placa normalizada**: Entrada debe venir normalizada (mayúsculas, sin espacios)

2. **Vehicle**: Si existe vehículo con esa placa, retornarlo con datos básicos (plate, type, color, brand, createdAt)

3. **Sesiones activas**: Buscar TODAS las sesiones activas para esa placa (puede haber histórico de datos duplicados, retornar todas)

4. **Últimas 5 sesiones completadas**: Orden DESC por exit_at. Usado para ver historial rápido.

5. **Mensualidad vigente**: Si existe monthly_plan con status='active' para esa placa, incluir en response.

## Flujo Principal

1. **Validar y normalizar placa**
   - Si no cumple formato, retornar `ValidationFailure`

2. **Buscar vehículo**
   - `SELECT * FROM vehicles WHERE plate = ? AND _deleted = FALSE`

3. **Buscar sesión activa (si existe vehículo)**
   - `SELECT * FROM parking_sessions WHERE vehicle_plate = ? AND status = 'active' AND _deleted = FALSE`

4. **Buscar últimas 5 sesiones completadas**
   - `SELECT * FROM parking_sessions WHERE vehicle_plate = ? AND status = 'completed' ORDER BY exit_at DESC LIMIT 5`

5. **Buscar mensualidad activa (si existe vehículo)**
   - `SELECT * FROM monthly_plans WHERE vehicle_plate = ? AND status IN ('active', 'expiring') AND end_date >= TODAY`

6. **Enriquecer datos**
   - Calcular durationMinutes para cada sesión: (exit_at - entry_at) / 60
   - Si hay sesión activa, calcular su duración actual: (NOW() - entry_at) / 60

7. **Retornar**:
   ```
   Right<{
     vehicle: VehicleEntity | null,
     activeSessions: [ParkingSessionEntity...],
     lastSessions: [ParkingSessionEntity...],
     monthlyPlan: MonthlyPlanEntity | null
   }>
   ```

## Edge Cases

- **Vehículo sin sesiones**: Retornar vehicle con arrays vacíos (válido)
- **Vehículo borrado lógicamente**: No retornar (_deleted=true)
- **Múltiples sesiones activas anómalas**: Retornarlas todas (alertar al operario de inconsistencia)

## Dependencias

- `VehicleRepository.searchByPlate(plate)`
- `ParkingRepository.getSessionsByPlate(plate, filter?)`
- `MonthlyPlanRepository.getActivePlanByPlate(plate)`

## Mapping a UI

- **Input de búsqueda**: `PlateSearchInputComponent`
  - Sugerencias mientras escribe (autocomplete con últimas placas)
  - Enter o botón buscar → invoca use case
  - Debounce: 300ms

### Filtro contextual: "solo activas en parqueadero"

Desde el dashboard del operador (vista `/parking`), el autocomplete de sugerencias debe filtrar **solo placas con sesión activa actualmente en el parqueadero** — el operador no necesita ver vehículos históricos cuando está consultando lo que está adentro. En otras vistas (admin de vehículos, historial) las sugerencias mantienen el comportamiento general (todas las placas registradas).

Implementación: `SearchPlateSuggestionsUseCase` acepta un parámetro opcional `onlyActive: boolean` (default `false`). Cuando es `true`, el repositorio consulta `parking_sessions` con `status='active'` y deriva la información del vehículo de la propia sesión (placa, tipo, color, marca) en lugar de pegar contra la tabla `vehicles`. Esto evita una sub-consulta JOIN y aprovecha que la regla de negocio garantiza máximo una sesión activa por placa.

- **Resultados**: Modal o side-panel con:
  - Info del vehículo: placa, tipo, color, marca
  - "Sesión activa" (si existe): duración actual, tarifa
  - "Últimas entradas/salidas" (tabla con 5 últimas)
  - "Mensualidad": status y fecha de vencimiento (si existe)

- **Pre-llenado**: Si hay búsqueda anterior, usar datos para pre-llenar formulario

---
Status: Pendiente de Implementación
