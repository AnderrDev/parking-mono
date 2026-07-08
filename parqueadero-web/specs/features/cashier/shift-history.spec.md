# Spec: Historial de Turnos de Caja

## Identificador
`cashier/shift-history`

## Descripción
Página de auditoría (`/cashier/history`) que lista los turnos de caja con su
cuadre de efectivo, el recaudo digital y el desglose por método de pago.
Permite filtrar por rango de fechas, operador y turnos con diferencia.

## Actor
Admin, Contador (ruta protegida con `requireRole('admin','contador')`).

## Filtros

| Filtro | Control | Comportamiento |
|---|---|---|
| Rango de fechas | 2 inputs `date` + chips rápidos **Hoy / 7 días / 30 días** | Filtra por `opened_at` en UTC-5. Chips setean el rango y aplican de inmediato |
| Operador | `select` con operadores activos | Filtra `user_id`. Opción por defecto "Todos" |
| Solo con diferencia | checkbox | `difference_cents ≠ 0` |

- Al cambiar cualquier filtro se vuelve a página 1.
- El select de operadores se llena con `CashierRepository.listOperators()`
  (usuarios `is_active=true`, orden alfabético). Si falla, el select se
  deshabilita sin bloquear la tabla.

## Columnas de la tabla

| Columna | Fuente | Nota |
|---|---|---|
| Operario | `users.nombre` (join) | — |
| Apertura / Cierre | `opened_at`, `closed_at` | — |
| Base | `opening_balance_cents` | — |
| Efectivo esperado | `expected_balance_cents` | — |
| Efectivo contado | `closing_balance_cents` | — |
| Diferencia | `difference_cents` | Verde sobrante / rojo faltante; resaltado si `|diff| > $5.000` |
| Digital | `digital_collected_cents` | "—" si `NULL` (turnos previos al desglose) |
| Detalle | expandir fila | — |

## Detalle expandido (por turno)

1. **Desglose por método** desde `totals_by_method` (snapshot del cierre):
   método, transacciones, monto. Agrupado Efectivo / Digital / Sin cobro.
2. **Digital verificado**: `digital_verified_cents` y diferencia digital
   calculada (`verified − collected`) si el operador lo registró; si no,
   "No verificado".
3. **Justificación** del cierre (o "Sin observaciones registradas").
4. ID del turno.
5. Turnos sin snapshot (`totals_by_method IS NULL`): mensaje
   "Turno cerrado antes del desglose por método — sin detalle disponible".

## Reglas de Negocio

1. Solo turnos `_deleted = false`. Se listan cerrados y abiertos (el abierto
   muestra "—" en columnas de cierre).
2. Orden: `opened_at DESC`.
3. Paginación servidor: 25 por página.
4. Los montos usan `currencyCop` (COP sin decimales) y fuente tabular (`mono`).

## Dependencias
- `ListShiftsUseCase` → `CashierRepository.listShifts(params)`
  (`params.userId` para filtro de operador — ya existía en el contrato).
- `CashierRepository.listOperators()` — **nuevo** en el contrato.

## Mapping a UI
- Página: `shift-history.page.ts/html/scss`.
- Empty state con acción: "Sin turnos en el rango — amplía las fechas o quita filtros".
- Filtros accesibles: labels visibles, targets ≥ 44px, estado activo del chip marcado.
