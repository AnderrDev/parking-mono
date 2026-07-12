# Sesión: Fix RLS — salida de carro con entrada de día anterior (OCK216)

**Fecha:** 2026-07-11
**Subproyecto(s):** parqueadero-backend
**Estado:** completada

## Objetivos
- [x] Diagnosticar fallo crítico en producción: "Error al registrar salida: new row violates row-level security policy for table parking_sessions"
- [x] Desbloquear al operador (no podía cerrar caja porque OCK216 seguía activo)
- [x] Fix con spec + migración aplicada a producción

## Causa raíz (confirmada con repro en prod, bajo ROLLBACK)
El UPDATE de salida (`status → 'completed'`) lee la tabla (WHERE/RETURNING), y
Postgres exige que la **fila resultante** siga siendo visible por alguna política
SELECT del rol. Para `operador` solo existían:
- `sessions_operador_read_own_today` → exige `entry_at` de HOY
- `sessions_authenticated_read_active` → exige `status='active'`

Un carro que entró un día anterior (OCK216, entró 2026-07-10) produce una fila
cerrada que no cumple ninguna → `42501`. Las salidas del mismo día sí funcionaban
(read_own_today cubre la fila resultante). El bundle desplegado, los usuarios
(public.users = auth.users) y el JWT (`user_role=operador`) estaban correctos.

## Avance
1. **Diagnóstico**: bundle prod (Firebase) verificado — sí envía `exit_user_id`;
   políticas prod = migraciones (dump vía Management API); usuarios consistentes;
   repro con `SET LOCAL ROLE authenticated` + claims (patrón de memoria
   rls-test-pattern): carro de ayer falla, carro de hoy pasa → causa raíz aislada.
2. **Spec**: `specs/rls-policies.spec.md` — nueva política
   `sessions_operador_read_own_exits` documentando el requisito de visibilidad
   SELECT de la fila post-UPDATE.
3. **Migración `00034_operador_read_own_exits.sql`** aplicada a prod
   (`supabase db push --linked`): operador lee sesiones donde
   `exit_user_id = auth.uid()`, sin restricción de fecha. Cubre también el caso
   caja global (00031): operador B saca carro que ingresó operador A.
4. **Verificación en prod**: el mismo UPDATE que fallaba ahora pasa (repro con
   ROLLBACK; OCK216 y RIZ162 siguen activos para que el operador registre la
   salida real desde la app, con su pago).

## Fix 2 (misma sesión): cierre de caja por cualquier rol
Regla de negocio confirmada por el usuario: **cualquier rol autenticado (admin,
operador, contador) puede cerrar la caja abierta**, sin importar quién la abrió.
Esto además elimina la variante en `cashier_shifts` del mismo bug 42501 (cerrar
una caja abierta por otro usuario dejaba la fila cerrada fuera del SELECT visible).

- **Spec**: sección `cashier_shifts` de `rls-policies.spec.md` reescrita (caja
  global + cierre por cualquier rol + nota del requisito de visibilidad SELECT).
- **Migración `00035_any_role_close_shift.sql`** aplicada a prod:
  - `shifts_operador_close_own` → `shifts_operational_close_open`
    (UPDATE de la caja abierta para admin/operador/contador).
  - `shifts_operador_read_own` + `shifts_contador_read` → `shifts_operational_read`
    (los tres roles leen todas las cajas).
  - INSERT (abrir) queda igual: operador a su nombre (admin vía admin_all).
- **Verificado en prod (ROLLBACK)** sobre la caja abierta real `1ea6132d`:
  cierre por otro operador ✓, por contador ✓, por el dueño ✓; la caja quedó
  intacta (`open`). El web no bloquea: `/cashier` solo pide authGuard y
  `findOpenByUser` ya ignora el userId (caja global desde 5d0a3f1).

## Hallazgos pendientes (no bloqueantes)
- **`closeSession` (web) no usa el RPC `register_vehicle_exit_with_payment`**
  (00024, creado justo para atomicidad UPDATE+INSERT) — sigue en dos roundtrips.
  Nota: el RPC es SECURITY INVOKER; antes de este fix también habría fallado.
  Conectarlo en Fase 10.
- Los logs `edge_logs` del proyecto devuelven vacío vía Management API (plan free);
  el diagnóstico se hizo por repro directo.
- Tokens PAT de Supabase quedaron pegados en el chat de esta sesión → **revocar
  ambos** (cuenta ciifuentees224 y ander22425) en dashboard/account/tokens.
  El de ander22425 quedó en `~/.supabase/access-token`; el viejo en
  `~/.supabase/access-token.pos` (borrar).

## Corrección operativa OCK216 (post-fix)
El operador registró la salida desde la app a las 19:08 UTC (2:08pm) con el monto
calculado ($36.000), pero lo realmente cobrado fue **$26.000** (acordado con el
cliente porque el bug impidió la salida a tiempo y la tarifa siguió corriendo).
Corrección directa como admin (UPDATE `payments.amount_cents` y
`parking_sessions.amount_due_cents` → 2.600.000 cents, justificación en el pago);
el trigger de auditoría registró before/after con `user_id` del admin.
> Gap detectado: no existía corrección de MONTO de un pago del turno abierto
> (solo de método, 00032). Cerrado en esta misma sesión — ver Fix 3.

## Fix 3 (misma sesión): corrección de monto de pagos del turno abierto
- **Spec nueva**: `parqueadero-web/specs/features/cashier/correct-shift-payment.spec.md`
  (documenta la familia completa: método 00032, anulación 00028, monto 00036).
- **Migración `00036_correct_shift_payment_amount.sql`** aplicada a prod: RPC
  `correct_shift_payment_amount(p_payment_id, p_amount_cents, p_reason)` —
  SECURITY DEFINER, cualquier rol, solo pagos completed de caja abierta, motivo
  ≥ 10 chars obligatorio, sincroniza `parking_sessions.amount_due_cents`.
- **Web**: `CorrectPaymentAmountUseCase` + `correctAmount` en repo/datasource/impl
  + token DI + diálogo unificado `correct-payment-dialog.component.ts` (método +
  monto con `appCurrencyInput` + motivo condicional; errores backend inline con
  patrón `onSubmit`, señales espejo para OnPush). Reemplaza y elimina
  `correct-payment-method-dialog.component.ts`. Mocks de close-shift y
  create-monthly-plan completados con `correctAmount`.
- **Validado**: `ng build` limpio + `tsc --noEmit -p tsconfig.spec.json` limpio.
  RPC verificado en prod (ROLLBACK): motivo corto → `correction_reason_required`,
  monto 0 → `invalid_amount`, pago de caja cerrada → `editable_payment_not_found`.
- **Nota operativa**: la caja del 2026-07-10/11 se cerró a las 23:20 UTC — el
  ciclo completo (salida nocturna + cierre) quedó funcionando en producción.
- **Pendiente**: deploy del web a Firebase Hosting para que la UI nueva llegue
  al dispositivo (la parte backend ya está activa).

## Next Steps
- [x] Salida de OCK216 registrada (operador vía app) y monto corregido a $26.000.
- [ ] Revocar los dos PAT expuestos y limpiar `~/.supabase/access-token*`.
- [ ] Fase 10: migrar `closeSession` al RPC atómico (o SECURITY DEFINER).
- [x] Fix cierre de caja multi-rol (`cashier_shifts`) — migración 00035 aplicada.
- [ ] Commit de specs + migraciones 00034/00035 + bitácora (pendiente de orden del usuario).
