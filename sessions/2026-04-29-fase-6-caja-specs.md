# Sesión: Fase 6 — Cierre de caja + payments (specs)

**Fecha:** 2026-04-29  
**Estado:** en progreso  
**Rama:** main

---

## Objetivos

Crear los 5 specs de Fase 6 y confirmar antes de implementar:
- `cashier/open-shift.spec.md`
- `cashier/close-shift.spec.md`
- `cashier/reconcile.spec.md`
- `payments/register-payment.spec.md`
- `payments/list-payments.spec.md`

---

## Contexto previo

- `cashier_shifts` tabla en BD con `uq_shifts_open_per_user` (un turno open por usuario) ✅ ya existe en migration
- `payments` tabla con método de pago enum: efectivo, tarjeta_credito, tarjeta_debito, transferencia, nequi, daviplata, cortesia, error, mensual
- Los pagos de salidas de parking se crean en `RegisterVehicleExitUseCase`
- El cashier_shift_id es requerido en payments (operador debe tener turno abierto)

---

## Avance

### Specs creados

- [ ] cashier/open-shift
- [ ] cashier/close-shift
- [ ] cashier/reconcile
- [ ] payments/register-payment
- [ ] payments/list-payments

---

## Next Steps

Confirmar specs con usuario → implementar.
