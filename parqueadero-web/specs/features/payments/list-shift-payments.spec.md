# Spec: Listar Pagos de un Turno

## Identificador
`payments/list-shift-payments`

## Descripción
UseCase que retorna **todos** los pagos de un turno de caja específico, sin
paginar. Pensado para el detalle expandible de un cierre de caja (ver
`specs/components/reports-page.spec.md`, sección "Cierres de caja") donde se
necesita la lista completa de movimientos de un turno, no una página de un
listado genérico.

Distinto de `payments/list-payments` (`ListPaymentsUseCase`): ese es genérico,
paginado, y filtra por `shiftId` **o** rango de fechas. Este es un atajo
directo a `PaymentRepository.listByShift(shiftId)` — ya usado internamente por
`close-shift.usecase.ts` y `reconcile-shift.usecase.ts` para calcular totales,
pero sin un UseCase público hasta ahora que expusiera la lista completa a UI.

## Actor
Admin, Contador, Operador — mismo acceso que el resto de Reportes (regla de
negocio 2026-07-29).

## Pre-condiciones
- Usuario autenticado.
- RLS: el turno debe pertenecer a un pago visible por el rol del usuario.
  Para `operador`, la policy `payments_operador_read_reports` (migración
  00037) ya cubre todo el histórico — no requiere migración nueva.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| shiftId | string | Sí | UUID del turno (`cashier_shifts.id`) |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<PaymentEntity[]>` | Pagos del turno, orden `paid_at` descendente |
| Error servidor | `Left<ServerFailure>` | — |
| Sin red | `Left<NetworkFailure>` | — |

## Reglas de Negocio

1. Solo pagos con `_deleted = false` (mismo filtro que `listByShift` ya aplica).
2. Sin límite de resultados — un turno normal tiene decenas de pagos, no miles.
3. No incluye `plate`/tipo de vehículo (el modelo de pago no los tiene
   directamente, solo `sessionId`); decisión explícita del usuario
   (2026-07-31) para mantener la carga simple y rápida — se puede agregar
   después con un join si hace falta.

## Flujo Principal

1. `execute({shiftId})` → `PaymentRepository.listByShift(shiftId)`.
2. Retornar `Right(payments)`.

## Edge Cases

- Turno sin pagos (ej. turno abierto y cerrado casi de inmediato): `[]`.
- Pagos anulados (`status='refunded'`) o pendientes (`'pending'`) se incluyen
  en la lista — la UI los marca con badge, no se filtran.

## Dependencias
- `PaymentRepository.listByShift(shiftId)` (ya existente,
  `payment-remote.datasource.ts`).

## Mapping a UI
- **Invocación**: `ReportsPage` → tab "Cierres de caja" → clic en el nombre
  del operador de una fila (botón con chevron) → `toggleShiftExpand(shiftId)`.
- **Carga**: lazy, solo al expandir por primera vez esa fila; no se
  precarga para las 25 filas de la tabla.
- **Visualización**: fila de detalle con tabla compacta — hora, método,
  monto, y una columna "Notas" con badge (Anulado/Pendiente) y/o
  justificación cuando aplique.
