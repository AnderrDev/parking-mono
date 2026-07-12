# Spec: Correcciones de pagos del turno abierto

**Versión:** 1.0
**Fecha:** 2026-07-11
**Estado:** aprobada (mandato del usuario en sesión 2026-07-11)

## Contexto

Mientras la caja está abierta, el operador puede equivocarse al registrar un pago
(método incorrecto, monto distinto al realmente cobrado) o necesitar anularlo.
Las correcciones existen para **método** (RPC `correct_shift_payment_method`,
migración 00032) y **anulación** (RPC `void_shift_payment`, migración 00028).
Esta spec las documenta y agrega la corrección de **monto**, gap detectado el
2026-07-11 (caso OCK216: cobro real $26.000 vs $36.000 calculado; hubo que
corregir a mano por SQL).

## Reglas comunes (las tres correcciones)

1. Solo sobre pagos `status='completed'`, `amount_cents > 0`, `_deleted=false`
   cuya caja (`cashier_shift_id`) siga **abierta**. Caja cerrada = inmutable
   (cualquier ajuste posterior es tarea de admin vía auditoría).
2. Cualquier rol autenticado (`admin`, `operador`, `contador`) puede corregir —
   coherente con caja global (00031/00035).
3. RPC `SECURITY DEFINER` (no se amplía RLS de `payments`); los triggers de
   `audit_log` registran before/after con el `auth.uid()` real.
4. La UI recarga el cuadre de caja tras corregir.

## Corrección de MONTO (nuevo)

### Contrato RPC

```
correct_shift_payment_amount(
  p_payment_id  UUID,
  p_amount_cents BIGINT,   -- nuevo monto en centavos, > 0
  p_reason      TEXT       -- obligatorio, >= 10 caracteres
) RETURNS jsonb            -- fila payments corregida
```

Validaciones (en orden, errores como EXCEPTION):
| Condición | Error | ERRCODE |
|---|---|---|
| rol ∉ {admin, operador, contador} | `forbidden` | 42501 |
| `p_amount_cents` NULL o ≤ 0 | `invalid_amount` | 22023 |
| `p_reason` vacío o < 10 chars (trim) | `correction_reason_required` | P0001 |
| pago no editable (ver reglas comunes) | `editable_payment_not_found` | P0002 |

Efectos:
- `payments.amount_cents = p_amount_cents`, `justification = p_reason`,
  `updated_at = now()`.
- Si el pago tiene `session_id`, sincroniza
  `parking_sessions.amount_due_cents = p_amount_cents` (coherencia sesión↔pago).
- Monto $0 NO se permite aquí: para eliminar un cobro se usa la anulación
  (`void_shift_payment`), que revierte sesión y deja rastro `refunded`.

### UseCase (web)

`CorrectPaymentAmountUseCase.execute({ paymentId, amountCents, reason, userId })
→ Either<Failure, PaymentEntity>`

- `ValidationFailure` si: falta paymentId/userId; `amountCents` no es entero > 0;
  `reason` (trim) < 10 caracteres.
- Delegación: `PaymentRepository.correctAmount` → RPC. Errores backend →
  `ServerFailure(message)`.

### UI (cashier-shift.page)

- El diálogo "Corregir pago" (antes solo método) pasa a editar **método y monto**
  en un solo modal:
  - Radio grid de métodos (igual que hoy).
  - Campo "Monto" con `appCurrencyInput` (pesos visibles, cents en el control),
    precargado con el monto actual.
  - Campo "Motivo de la corrección" (textarea): **obligatorio solo si el monto
    cambia**; mínimo 10 caracteres.
  - Guardar deshabilitado si nada cambió.
- Patrón de errores backend **inline en el diálogo** (callback `onSubmit` que
  retorna mensaje o null; el modal NO se cierra si el backend rechaza) — igual
  que exit-dialog y feedback registrado.
- Si cambian método Y monto se invocan ambos RPCs (cada uno atómico); si el
  segundo falla, el diálogo muestra el error y conserva lo digitado.
- Éxito: toast "Pago corregido" + recarga del cuadre.

## Corrección de MÉTODO (existente, 00032)

`correct_shift_payment_method(p_payment_id, p_method)` — whitelist
efectivo/tarjeta_credito/tarjeta_debito/transferencia/nequi/daviplata.
Sin motivo obligatorio (no altera totales, solo canal).

## Anulación (existente, 00028)

`void_shift_payment(p_payment_id, p_reason)` — motivo ≥ 10 chars; pago →
`refunded`, sesión asociada → `cancelled`, registro en audit_log.
