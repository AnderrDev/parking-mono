# Spec: Dossier histórico por placa

**ID:** HU-046
**Módulo:** Parking — Dashboard Operador
**Versión:** 1.0
**Fecha:** 2026-05-09

---

## Descripción

Cuando el operador selecciona una placa en el autocomplete del buscador, el panel de resultado se enriquece con las métricas históricas acumuladas del vehículo: cuántas veces ha entrado, cuánto ha pagado en total, su tiempo acumulado, su última visita y un listado de las últimas N sesiones. La información sale de `parking_sessions` (cerradas) más el `vehicles` ya conocido.

El propósito es darle al operador contexto inmediato del cliente recurrente sin tener que ir al historial completo.

---

## Actor
Operador (vista `/parking`).

## Pre-condiciones
- Usuario autenticado con turno abierto.
- Existe al menos una sesión cerrada para la placa (si no hay, el dossier muestra ceros y un mensaje "Sin visitas previas").

---

## Input

| Campo | Tipo | Obligatorio |
|---|---|---|
| plate | string (normalizada) | Sí |
| recentLimit | number | No (default 5) |

## Output

`Right<VehicleHistoryStats>`:

```ts
interface VehicleHistoryStats {
  totalVisits: number;            // sesiones con status='completed'
  totalPaidCents: number;         // suma de amount_due_cents (sesiones completadas)
  totalDurationMinutes: number;   // suma de duration_minutes
  averagePaidCents: number;       // 0 si totalVisits=0
  averageDurationMinutes: number; // 0 si totalVisits=0
  firstVisitAt: Date | null;      // entry_at más antiguo
  lastVisitAt: Date | null;       // exit_at más reciente
  visitsLast30Days: number;       // sesiones completadas con exit_at >= now-30d
  paidLast30DaysCents: number;    // suma amount_due_cents en últimos 30 días
  recentSessions: ParkingSessionEntity[]; // últimas N sesiones completadas
}
```

`Left<ValidationFailure>` si la placa no cumple formato.
`Left<NetworkFailure | ServerFailure>` ante problemas de red/BD.

---

## Reglas de negocio

1. **Sólo sesiones cerradas** cuentan en las métricas (`status='completed'`). Sesión activa actual NO cuenta.
2. **Sesiones canceladas** (`status='cancelled'`) se excluyen.
3. **Soft-deleted** (`_deleted=true`) se excluyen.
4. Si el vehículo no tiene sesiones cerradas, todos los valores numéricos son `0` y las fechas `null`. La UI muestra "Sin visitas previas".
5. El cálculo de `visitsLast30Days` usa `exit_at >= NOW() - 30 days` en hora local Colombia.
6. `recentSessions` se ordena por `exit_at DESC LIMIT recentLimit`.

---

## Implementación

### Datasource (Supabase)

Una sola consulta agregada + una para las recientes:

```sql
-- Métricas agregadas
SELECT
  COUNT(*)::int                                 AS total_visits,
  COALESCE(SUM(amount_due_cents), 0)::int       AS total_paid_cents,
  COALESCE(SUM(duration_minutes), 0)::int       AS total_duration_minutes,
  MIN(entry_at)                                 AS first_visit_at,
  MAX(exit_at)                                  AS last_visit_at,
  COUNT(*) FILTER (WHERE exit_at >= NOW() - INTERVAL '30 days')::int  AS visits_last_30,
  COALESCE(SUM(amount_due_cents) FILTER (WHERE exit_at >= NOW() - INTERVAL '30 days'), 0)::int AS paid_last_30
FROM parking_sessions
WHERE vehicle_plate = $1
  AND status = 'completed'
  AND _deleted = FALSE;

-- Recientes
SELECT *
FROM parking_sessions
WHERE vehicle_plate = $1
  AND status = 'completed'
  AND _deleted = FALSE
ORDER BY exit_at DESC
LIMIT $2;
```

Como Supabase no expone agregados arbitrarios desde JS, se hace vía **RPC** (`get_vehicle_history_stats(plate text)`) que retorna una fila con los agregados, complementado con un `SELECT` normal para las sesiones recientes. Si no se quiere RPC, se hace fallback en cliente: traer las últimas 90 días y agregar localmente — viable porque un vehículo recurrente típicamente tiene <500 visitas anuales.

**Decisión inicial**: implementación cliente-side (sin nueva RPC) para no sumar superficie de migraciones; si en producción crece, se mueve a RPC. Se documenta en código.

### Capas Clean Architecture

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Domain (entity) | `domain/entities/vehicle-history-stats.entity.ts` | Estructura `VehicleHistoryStats`. |
| Domain (repository) | `domain/repositories/parking.repository.ts` | `abstract getVehicleHistoryStats(plate, recentLimit)`. |
| Domain (usecase) | `domain/usecases/get-vehicle-history-stats.usecase.ts` | Validación + delegación. |
| Data (datasource) | `data/datasources/parking.datasource.ts` y `-remote` | Consulta a Supabase + agregados. |
| DI | `core/di/injection-tokens.ts` + `parking.routes.ts` | `GET_VEHICLE_HISTORY_STATS_TOKEN`. |
| UI (componente) | `presentation/components/vehicle-history-panel.component.ts` | Panel inline con stats. |
| UI (page) | `presentation/pages/operator-dashboard.page.ts` | Carga las stats al seleccionar sugerencia o resultado de búsqueda. |

---

## UI — `<app-vehicle-history-panel>`

Aparece **debajo** del bloque de resultado actual del buscador (`plateSearchResult`), reemplazando o complementando los detalles existentes. Layout en grid 2x2 con tarjetas de métrica:

```
[ Visitas totales: 24 ]   [ Pagado total: $310.000 ]
[ Tiempo total: 38h 15m ] [ Última visita: hace 3 días ]
```

Sub-bloque "Últimas visitas" con tabla compacta de 5 filas: `Entrada`, `Salida`, `Duración`, `Monto`, `Método`.

Estados:
- **loading**: skeleton de las tarjetas.
- **sin visitas**: tarjeta única "Sin visitas previas — vehículo nuevo en el sistema".
- **error**: banner rojo discreto con `failure.message`.

---

## Verificación

- [ ] Seleccionar una sugerencia con visitas previas → panel muestra métricas correctas.
- [ ] Seleccionar una placa sin sesiones cerradas → panel muestra estado "Sin visitas previas".
- [ ] Sesiones canceladas o eliminadas no influyen.
- [ ] La sesión activa actual NO cuenta en `totalPaidCents` ni en `totalVisits`.
- [ ] `visitsLast30Days` y `paidLast30DaysCents` reflejan exactamente los últimos 30 días.
- [ ] `recentSessions` está ordenado por `exit_at DESC`.
- [ ] `ng build` sin errores.
- [ ] Si el dossier está cargando, no se muestra resultado parcial confuso.
