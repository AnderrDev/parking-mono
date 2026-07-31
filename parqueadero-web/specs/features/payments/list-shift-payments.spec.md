# Spec: Listar Pagos de un Turno (con vehículo)

## Identificador
`payments/list-shift-payments`

## Descripción
UseCase que retorna **todos** los pagos de un turno de caja específico, sin
paginar, enriquecidos con la placa y la hora de entrada de la sesión de
parqueo asociada. Pensado para el detalle expandible de un cierre de caja
(ver `specs/components/reports-page.spec.md`, sección "Cierres de caja")
donde se necesita el contexto completo de cada movimiento — qué vehículo,
cuánto estuvo parqueado, qué cobró — no solo hora/monto/método.

Distinto de `payments/list-payments` (`ListPaymentsUseCase`): ese es genérico,
paginado, retorna `PaymentEntity[]` plano y filtra por `shiftId` **o** rango
de fechas. Este siempre trae el turno completo y el join a la sesión.

Distinto de `PaymentRepository.listByShift(shiftId)` (usado internamente por
`close-shift.usecase.ts`/`reconcile-shift.usecase.ts` para calcular totales):
ese devuelve `PaymentEntity[]` sin placa. Este UseCase llama a
`listByShiftWithVehicle(shiftId)`, un método nuevo del mismo repositorio
específico para exponer el detalle a UI.

## Actor
Admin, Contador, Operador — mismo acceso que el resto de Reportes (regla de
negocio 2026-07-29).

## Pre-condiciones
- Usuario autenticado.
- RLS: el turno debe pertenecer a un pago visible por el rol del usuario.
  Para `operador`, la policy `payments_operador_read_reports` (migración
  00037) ya cubre todo el histórico — no requiere migración nueva. El join a
  `parking_sessions` vía PostgREST hereda el mismo SELECT ya permitido para
  reportes (no es una tabla nueva a la que el rol no tuviera acceso).

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| shiftId | string | Sí | UUID del turno (`cashier_shifts.id`) |

## Output (Result)

```typescript
interface PaymentWithVehicle {
  payment: PaymentEntity;
  plate: string | null;   // null si el pago no viene de una sesión (ej. mensualidad, ajuste manual)
  entryAt: Date | null;   // hora de entrada de esa sesión; null junto con plate
}
```

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<PaymentWithVehicle[]>` | Pagos del turno + vehículo, orden `paid_at` descendente |
| Error servidor | `Left<ServerFailure>` | — |
| Sin red | `Left<NetworkFailure>` | — |

## Reglas de Negocio

1. Solo pagos con `_deleted = false` (mismo filtro que `listByShift`).
2. Sin límite de resultados — un turno normal tiene decenas de pagos, no miles.
3. `plate`/`entryAt` vienen de un **nested select** de PostgREST
   (`payments.select('*, parking_sessions:session_id ( vehicle_plate, entry_at )')`),
   una sola consulta — no N+1. Si `session_id` es `null` (pago sin sesión) o
   la sesión no tiene esas columnas visibles, ambos quedan `null` — la UI
   muestra "—", no falla.
4. `tiempo parqueado` (duración) se calcula en el componente
   (`durationMinutes(entryAt, payment.paidAt)` + `formatDuration`), no se
   persiste ni se calcula en el UseCase — es derivado de dos timestamps ya
   presentes en el resultado.

## Flujo Principal

1. `execute({shiftId})` → `PaymentRepository.listByShiftWithVehicle(shiftId)`.
2. Retornar `Right(paymentsWithVehicle)`.

## Edge Cases

- Turno sin pagos (ej. turno abierto y cerrado casi de inmediato): `[]`.
- Pagos anulados (`status='refunded'`) o pendientes (`'pending'`) se incluyen
  en la lista — la UI los marca con badge, no se filtran.
- Pago sin sesión asociada (`session_id = null`, ej. venta de mensualidad):
  `plate = null`, `entryAt = null` → UI muestra "—" en esas columnas, el resto
  del movimiento (hora de pago, método, monto) se ve normal.

## Dependencias
- `PaymentRepository.listByShiftWithVehicle(shiftId)` (nuevo método,
  `payment-remote.datasource.ts` — nested select sobre `payments` con join a
  `parking_sessions:session_id`).

## Mapping a UI
- **Invocación**: `ReportsPage` → tab "Cierres de caja" → clic en el nombre
  del operador de una fila (botón con chevron) → `toggleShiftExpand(shiftId)`.
- **Carga**: lazy, solo al expandir por primera vez esa fila; no se
  precarga para las 25 filas de la tabla.
- **Visualización**: fila de detalle con tabla compacta — Placa | Entrada |
  Tiempo parqueado | Hora pago | Método (atenuado + tag "no cajón"/"sin
  cobro" si no es efectivo, ver reports-page.spec.md) | Monto | Notas (badge
  Anulado/Pendiente + justificación si aplica).
