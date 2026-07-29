# Spec: Reporte de Sesiones por Tipo de Vehículo

## Identificador
`reports/sessions-by-type`

## Descripción
UseCase que retorna el conteo y duración promedio de sesiones agrupadas por tipo de vehículo, para un rango de fechas. Permite detectar el mix de vehículos atendidos y optimizar capacidad.

## Actor
Admin, Contador, Operador.

## Pre-condiciones
- Cualquier usuario autenticado (`admin`, `contador`, `operador`).

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| dateFrom | Date | Sí | UTC |
| dateTo | Date | Sí | ≥ dateFrom; máximo 12 meses |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<SessionsByTypeResult>` | Desglose por tipo de vehículo |
| Fechas inválidas | `Left<ValidationFailure>` | — |
| Error servidor | `Left<ServerFailure>` | — |

```typescript
interface SessionsByTypeResult {
  dateFrom: Date;
  dateTo: Date;
  totalSessions: number;
  byType: VehicleTypeRow[];
}

interface VehicleTypeRow {
  vehicleType: VehicleType;           // 'carro', 'moto', 'bicicleta', 'camion'
  count: number;
  avgDurationMinutes: number;
  revenueCents: number;
  percentOfTotal: number;             // porcentaje sobre totalSessions
}
```

## Reglas de Negocio

1. Solo sesiones `status = 'completed'` y `_deleted = false`.
2. `avgDurationMinutes` = promedio de `(exit_at - entry_at)` en minutos.
3. `revenueCents` excluye métodos libres (`cortesia`, `error`, `mensual`).
4. Los tipos de vehículo sin sesiones en el período **no** aparecen en `byType`.
5. `percentOfTotal` se calcula sobre el total de sesiones de todos los tipos.

## Flujo Principal

1. Validar fechas.
2. Consultar view `v_sessions_by_type` con filtro de rango.
3. Calcular `totalSessions` y `percentOfTotal` por fila.
4. Retornar `Right(result)`.

## Edge Cases

- Sin sesiones en el período: `totalSessions = 0`, `byType = []`.
- Solo un tipo de vehículo: `percentOfTotal = 100`.

## Dependencias
- `ReportRepository.getSessionsByType(dateFrom, dateTo)`

## Mapping a UI
- **Invocación**: `ReportsPage` → pestaña "Vehículos".
- **Visualización**: tabla con columnas Tipo | Sesiones | Duración promedio | Ingresos | %.
