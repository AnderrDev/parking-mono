# Spec: Reporte de Rendimiento por Operador

## Identificador
`reports/operator-performance`

## Descripción
UseCase que retorna el rendimiento de cada operador (sesiones atendidas, ingresos gestionados, turnos trabajados) para un rango de fechas. Útil para gerencia y nómina.

## Actor
Admin, Contador, Operador. (Regla de negocio 2026-07-29: Reportes se habilita para los 3 roles, incluyendo el desempeño por operador.)

## Pre-condiciones
- Cualquier usuario autenticado (`admin`, `contador`, `operador`).

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| dateFrom | Date | Sí | UTC |
| dateTo | Date | Sí | ≥ dateFrom; máximo 12 meses |
| operatorId | string \| null | No | Si se pasa, devuelve detalle de 1 operador |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<OperatorPerformanceResult>` | Lista de operadores con sus métricas |
| Fechas inválidas | `Left<ValidationFailure>` | — |
| Error servidor | `Left<ServerFailure>` | — |

```typescript
interface OperatorPerformanceResult {
  dateFrom: Date;
  dateTo: Date;
  operators: OperatorRow[];
}

interface OperatorRow {
  operatorId: string;
  operatorName: string;
  shiftsWorked: number;
  totalHoursWorked: number;          // suma de (closed_at - opened_at) en horas
  sessionsAttended: number;           // entradas registradas
  revenueCents: number;              // solo métodos de pago real
  avgSessionsPerShift: number;
  cashDifferenceCents: number;        // suma de |difference_cents| de sus turnos
}
```

## Reglas de Negocio

1. `shiftsWorked` = turnos `status = 'closed'` del período (o `open` si aún en curso, marcado como "en curso").
2. `totalHoursWorked` = Σ(closed_at - opened_at). Turnos abiertos usan `now()` como cierre provisional.
3. `revenueCents` incluye solo pagos en turnos del operador, `status='completed'`, método no libre.
4. `cashDifferenceCents` es suma de valores absolutos de `difference_cents` (indicador de disciplina).
5. Los 3 roles ven este reporte (guard + RLS en `v_operator_performance` view).

## Flujo Principal

1. Validar fechas.
3. Consultar `v_operator_performance` con filtro de rango (y operadorId si aplica).
4. Retornar `Right(result)`.

## Edge Cases

- Sin turnos en el período: `operators = []`.
- Operador con turnos pero sin sesiones: `sessionsAttended = 0`.
- Turno abierto (operador aún trabajando): `totalHoursWorked` calculado hasta `now()`.

## Dependencias
- `ReportRepository.getOperatorPerformance(dateFrom, dateTo, operatorId?)`

## Mapping a UI
- **Invocación**: `ReportsPage` → pestaña "Operadores".
- **Columnas**: Nombre | Turnos | Horas | Sesiones | Ingresos | Diferencia caja.
- **Visible para los 3 roles** (guard `requireRole('admin', 'contador', 'operador')`).
