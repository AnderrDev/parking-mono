# Spec: Crear Plan Mensual

## Identificador
`monthly-plans/create-monthly-plan`

## Descripción
UseCase que crea un nuevo plan mensual para una placa. Valida que no haya solapamiento con planes activos existentes para la misma placa.

## Actor
Admin u operador (con turno de caja abierto).

## Pre-condiciones
- Usuario autenticado.
- **Turno de caja abierto**: la creación del plan registra ingreso en
  `payments` ligado al `cashier_shift_id` del usuario, así el cuadre del
  turno refleja la venta. Sin caja abierta no se puede crear plan.
- No existe plan activo o expiring para la misma placa con fechas solapadas.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| vehiclePlate | string | Sí | Formato colombiano; normalizar UPPER |
| customerId | string | Sí | UUID de cliente existente |
| planType | string | Sí | 'basico', 'premium', 'ilimitado' |
| startDate | Date | Sí | ≥ hoy |
| endDate | Date | Sí | > startDate |
| amountCents | number | Sí | entero > 0; múltiplo de $50 (validador en form) |
| autoRenew | boolean | No | default false |
| paymentTokenId | string \| null | No | Token de pasarela de pago para auto-renovación |
| paymentMethod | PaymentMethod | Sí | Método con que el cliente pagó la mensualidad (efectivo/tarjeta_*/transferencia/nequi/daviplata). El payment se registra como `status='completed'` (ver `register-vehicle-exit.spec.md` regla 6). |
| userId | string | Sí | UUID del usuario que crea el plan; se usa para resolver el `cashier_shift_id` activo. |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<MonthlyPlanEntity>` | Plan creado con status='active' + payment registrado |
| Sin caja abierta | `Left<BusinessRuleFailure>` | "No hay caja abierta. Abre un turno antes de vender mensualidades." |
| Placa con solapamiento | `Left<BusinessRuleFailure>` | "La placa {plate} ya tiene un plan activo que se solapa con las fechas indicadas" |
| Cliente no existe | `Left<NotFoundFailure>` | "Cliente no encontrado" |
| Fechas inválidas | `Left<ValidationFailure>` | "endDate debe ser posterior a startDate" |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. No puede haber dos planes con `status IN ('active','expiring')` para la misma placa cuyas fechas se solapen.
2. `startDate` ≥ hoy (no planes en el pasado).
3. `endDate > startDate`.
4. Si `endDate - today ≤ 5 días`: el plan inicia con `status = 'expiring'` directamente.
5. `autoRenew = true` solo si `paymentTokenId` presente.
6. El cliente debe existir y `_deleted = false`.
7. Cambio en `audit_log`.

## Flujo Principal

1. Normalizar `vehiclePlate`.
2. **Validar caja abierta**: `cashierRepo.findOpenByUser(userId)` debe
   retornar shift; si null → `BusinessRuleFailure`.
3. Validar fechas.
4. Verificar que el cliente existe.
5. Verificar solapamiento de fechas con planes activos/expiring.
6. Determinar `status` inicial ('active' o 'expiring' según días restantes).
7. Insertar plan en `monthly_plans`.
8. **Insertar payment** en `payments` con:
   - `cashier_shift_id`: el shift abierto del usuario.
   - `method`: `paymentMethod` recibido.
   - `amount_cents`: `amountCents` del plan.
   - `status`: `'completed'` (ver `register-vehicle-exit.spec.md` regla 6).
   - `session_id`: NULL (no es pago de sesión).
   - `paid_at`: NOW().
9. Registrar en `audit_log` (vía trigger).
10. Retornar `Right(planEntity)`.

**Atomicidad:** plan se inserta primero. Si el insert del payment falla,
el plan queda en BD sin payment registrado (caso degenerado: ingreso
"perdido" para el cuadre, pero el plan funcional). Mejora futura:
mover ambos a una RPC `create_plan_with_payment` para garantizar
atomicidad transaccional.

**Vínculo plan ↔ payment:** la tabla `payments` actualmente NO tiene
`monthly_plan_id`. El vínculo es implícito vía `cashier_shift_id`,
método y timing. Mejora futura: agregar columna `monthly_plan_id` para
reportes precisos.

<!-- Facturación electrónica descartada del alcance el 2026-05-20. -->


**Tarifa por tipo de vehículo (2026-05-02 adenda 13):**
El monto del plan se auto-rellena desde la tabla `tariffs` con
`unit='mensualidad'` filtrado por `vehicle_type`. Migration `00015`
extiende la constraint de `tariffs.unit` para aceptar `'mensualidad'` y
seedeáa 3 tarifas iniciales (carro/moto/bicicleta). Si no hay tarifa
configurada para el tipo elegido, el campo monto sigue editable
manualmente y se muestra hint "Sin tarifa configurada para este tipo".
El use case `GetActiveMonthlyTariffUseCase` (en feature `tariffs`)
encapsula el query.

## Edge Cases

- `startDate = hoy`, `endDate = mañana`: `status = 'expiring'` (≤5 días).
- Plan vencido de la misma placa: no bloquea (solo activos/expiring solapados bloquean).
- `autoRenew = true` sin `paymentTokenId`: `ValidationFailure`.

## Dependencias
- `MonthlyPlanRepository.create()`
- `MonthlyPlanRepository.hasActivePlanForPlate()` (verificar solapamiento)
- `CustomerRepository.findById()`
- `CashierRepository.findOpenByUser()` (resolver `cashier_shift_id`)
- `PaymentRepository.create()` (registrar ingreso de mensualidad)

## Mapping a UI
- **Invocación**: `MonthlyPlansListPage` → "Nuevo plan" → `MonthlyPlanEditDialog`.
- **Formulario**: `MonthlyPlanForms.createPlanForm()`.
- **Feedback**: Toast "Plan mensual creado para placa {plate}".
