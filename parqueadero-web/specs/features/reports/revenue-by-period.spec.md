# Spec: Reporte de Ingresos por Período

## Identificador
`reports/revenue-by-period`

## Descripción
UseCase que retorna el resumen de ingresos (totales y por método de pago) para un rango de fechas. Soporta agrupación diaria, semanal o mensual. Base para el dashboard financiero del admin/contador.

## Actor
Admin, Contador. (Operador NO tiene acceso a esta ruta.)

## Pre-condiciones
- Usuario autenticado con rol `admin` o `contador`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| dateFrom | Date | Sí | UTC, no puede ser futuro |
| dateTo | Date | Sí | ≥ dateFrom; rango máximo 12 meses |
| groupBy | `'day'` \| `'week'` \| `'month'` | No | Default: `'day'` |
| operatorId | string \| null | No | Filtra por operador específico |
| vehicleType | VehicleType \| null | No | Filtra sesiones por tipo de vehículo |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<RevenueReportResult>` | Resumen financiero agrupado |
| Fechas inválidas | `Left<ValidationFailure>` | dateTo < dateFrom o rango > 12 meses |
| Sin acceso | `Left<UnauthorizedFailure>` | Operador intenta acceder |
| Error servidor | `Left<ServerFailure>` | — |

```typescript
interface RevenueReportResult {
  dateFrom: Date;
  dateTo: Date;
  groupBy: 'day' | 'week' | 'month';
  totalRevenueCents: number;
  totalSessions: number;
  byPeriod: RevenuePeriod[];
  byMethod: { method: PaymentMethod; amountCents: number; count: number }[];
}

interface RevenuePeriod {
  periodLabel: string;          // '2026-04-29', '2026-W17', '2026-04'
  periodStart: Date;
  revenueCents: number;
  sessions: number;
}
```

## Reglas de Negocio

1. Solo pagos `status = 'completed'` y `_deleted = false`.
2. Métodos `cortesia`, `error`, `mensual`: se incluyen en el conteo de sesiones pero **no** en `totalRevenueCents` ni en `byMethod.amountCents`.
3. Agrupación `'day'` → label `YYYY-MM-DD`. `'week'` → label `YYYY-Www` (ISO 8601). `'month'` → label `YYYY-MM`.
4. Períodos sin pagos **no** aparecen en `byPeriod` (omitir huecos).
5. RLS: contador ve todos los turnos; operador bloqueado a nivel de guard.

## Flujo Principal

1. Validar fechas y rango máximo.
2. Verificar rol del usuario.
3. Consultar view `v_revenue_daily` filtrando por rango (+ operador y tipo si aplica).
4. Agrupar en memoria según `groupBy`.
5. Calcular `byMethod` sumando los resultados.
6. Retornar `Right(result)`.

## Edge Cases

- Rango de 1 día: `byPeriod` con 1 ítem (si hay pagos).
- Rango sin pagos: `totalRevenueCents = 0`, `byPeriod = []`.
- Solo pagos de cortesía: `totalRevenueCents = 0`, `totalSessions > 0`.
- Rango > 12 meses → `ValidationFailure`.

## Dependencias
- `ReportRepository.getRevenue(params)` → consulta la view `v_revenue_daily`.

## Mapping a UI
- **Invocación**: `ReportsPage` → pestaña "Ingresos".
- **Visualización**: tabla `RevenuePeriod[]` + fila de totales + desglose por método.
- **Filtros**: rango de fecha, agrupación, operador, tipo de vehículo.
