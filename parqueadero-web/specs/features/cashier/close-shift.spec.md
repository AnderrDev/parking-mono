# Spec: Cerrar Turno de Caja

## Identificador
`cashier/close-shift`

## Descripción
UseCase que cierra el turno de caja activo. El cierre distingue dos canales:

- **Efectivo**: dinero físico en el cajón. Se cuenta y se compara contra el esperado.
- **Digital**: transferencias, Nequi, Daviplata y tarjetas. No están en el cajón;
  se muestran como total esperado por canal y el operador puede (opcionalmente)
  registrar el valor que verificó en las cuentas.

Al cerrar se **persiste el desglose por método de pago** en el turno, para que el
historial y la auditoría puedan responder "¿cuánto entró por transferencia en este
turno?" sin reconstruir los pagos.

## Actor
Operador, Admin.

## Pre-condiciones
- Usuario autenticado.
- Existe turno `open` (caja única global).

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| shiftId | string (UUID) | Sí | Debe ser turno `open` |
| closingBalanceCents | number | Sí | ≥ 0 (efectivo físico contado) |
| digitalVerifiedCents | number \| null | No | ≥ 0 si se envía. Total digital verificado por el operador en apps/cuentas |
| justification | string \| null | Condicional | Requerido si `|diff efectivo| > 500000` (=$5.000 COP) |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<CashierShiftEntity>` | Turno cerrado con totales y desglose persistidos |
| No encontrado | `Left<NotFoundFailure>` | "Turno no encontrado o ya cerrado" |
| Falta justificación | `Left<ValidationFailure>` | "La diferencia supera $5.000. Ingresa una justificación." |
| Validación | `Left<ValidationFailure>` | Saldo negativo (contado o digital verificado) |
| Error servidor | `Left<ServerFailure>` | — |

## Clasificación de métodos de pago

| Grupo | Métodos | Participa en |
|---|---|---|
| Efectivo | `efectivo` | Cuadre físico del cajón |
| Digital | `transferencia`, `nequi`, `daviplata`, `tarjeta_credito`, `tarjeta_debito` | Verificación en cuentas |
| Sin cobro | `cortesia`, `error`, `mensual` | Solo conteo (amount = 0) |

Fuente de verdad en código: `FREE_PAYMENT_METHODS` y `DIGITAL_PAYMENT_METHODS`
en `payment.entity.ts`.

## Reglas de Negocio

1. Solo pagos `status = 'completed'` del turno participan en los totales.
2. `cash_collected_cents = Σ(payments.amount_cents WHERE method='efectivo')`.
3. `digital_collected_cents = Σ(payments.amount_cents WHERE method IN digital)`.
4. `expected_balance_cents = opening_balance_cents + cash_collected_cents
     + Σ(entradas manuales) − Σ(salidas manuales)` (movimientos de `cash_withdrawals`,
   HU-039). Los movimientos manuales solo afectan efectivo, nunca digital.
5. `difference_cents = closing_balance_cents − expected_balance_cents` (solo efectivo).
6. Si `|difference_cents| > 500_000` y `justification` es null o vacío → `ValidationFailure`.
7. `digital_verified_cents` es opcional: si el operador no lo digita queda `NULL`
   (no se asume 0 — "no verificado" ≠ "verificado en $0"). La diferencia digital
   (`digital_verified_cents − digital_collected_cents`) se calcula en la entidad,
   no se persiste, y NO bloquea el cierre (informativa).
8. `totals_by_method` guarda el snapshot completo del desglose al momento del cierre:
   `[{ method, count, amount_cents }]`, incluyendo métodos sin cobro con amount 0.
9. Al cerrar: `status='closed'`, `closed_at=now()`, y se persisten
   `closing_balance_cents`, `expected_balance_cents`, `difference_cents`,
   `cash_collected_cents`, `digital_collected_cents`, `digital_verified_cents`,
   `totals_by_method`.
10. Un turno cerrado NO puede reabrirse ni modificarse.

## Flujo Principal

1. Buscar turno por `shiftId`. Verificar `status = 'open'`.
2. Validar `closingBalanceCents ≥ 0` y `digitalVerifiedCents ≥ 0` (si viene).
3. Listar pagos del turno (`PaymentRepository.listByShift`) y agrupar por método.
4. Listar movimientos manuales (`listWithdrawalsByShift`).
5. Calcular `cash_collected`, `digital_collected`, `expected`, `difference`.
6. Si `|difference| > 500_000`: verificar `justification` presente.
7. Actualizar turno con totales, desglose y `status='closed'`.
8. Retornar `Right(shiftEntity)`.

## Edge Cases

- Cierre exacto (`difference = 0`): no requiere justificación.
- Turno sin pagos digitales: `digital_collected_cents = 0`; el bloque digital de la
  UI se muestra igualmente con $0 para que el operador sepa que no falta nada.
- Operador no verifica digital: `digital_verified_cents = NULL`, cierre procede.
- Turno con solo pagos digitales: `expected = opening ± movimientos manuales`.
- Turnos cerrados ANTES de esta spec: columnas de desglose en `NULL`; la UI de
  historial muestra "—" (no $0).

## Dependencias
- `CashierRepository.findById()`
- `CashierRepository.close()` — ahora recibe el desglose completo
- `CashierRepository.listWithdrawalsByShift(shiftId)`
- `PaymentRepository.listByShift(shiftId)` — reemplaza a `sumCashByShift` en este flujo

## Mapping a UI

- **Invocación**: `CashierShiftPage` → card "Cerrar caja" con dos bloques:
  1. **Efectivo en caja**: esperado (read-only), contado (input + conteo por
     denominación HU-036), diferencia en vivo.
  2. **Pagos digitales**: esperado por canal (lista), total digital, input opcional
     "Verificado en cuentas" con diferencia informativa en vivo.
- **Confirmación**: el botón abre el **modal "Resumen de cierre"**
  (`CloseShiftSummaryDialogComponent`) con el desglose completo. El cierre solo se
  ejecuta al confirmar en el modal. Errores del backend se muestran inline en el
  modal sin cerrarlo (patrón `onSubmit` callback).
- **Feedback**: toast "Caja cerrada. Diferencia efectivo: ±$X" y UI vuelve a
  estado "sin turno".
