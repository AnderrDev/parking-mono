# Spec: Registrar Salida de Vehículo

## Identificador
`parking/register-vehicle-exit`

## Descripción
El operario registra la salida de un vehículo (cierre de sesión activa). El sistema calcula el cobro según la tarifa vigente, minutos de gracia, tope diario. Si la salida es sin pago (cortesía, error, mensualidad), se registra con justificación.

## Actor
Operario (usuario con rol operador)

## Pre-condiciones
- El operario ha iniciado sesión
- Existe una sesión activa para la placa que se intenta cerrar
- El operario tiene un turno de caja abierto

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| plate | string | Sí | Placa normalizada (ABC123) |
| exitAt | DateTime | No | Timestamp de salida; por defecto NOW() |
| paymentMethod | PaymentMethod | No | Enum: `efectivo`, `tarjeta_credito`, `tarjeta_debito`, `transferencia`, `nequi`, `daviplata`, `cortesia`, `error`, `mensual` |
| justificationIfFree | string | Conditional | Requerido si paymentMethod es `cortesia`, `error` o `mensual`. Ej: "Cortesía del gerente", "Error en entrada" |
| userId | string | Sí | UUID del operario |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<{session: ParkingSessionEntity, payment: PaymentEntity}>` | Sesión cerrada, monto calculado, pago registrado |
| Error: sesión no encontrada | `Left<NotFoundFailure>` | "No existe sesión activa para la placa ABC123" |
| Error: justificación faltante | `Left<ValidationFailure>` | "Cuando la salida es sin pago, la justificación es obligatoria" |
| Error: servidor | `Left<ServerFailure>` | "Error al registrar salida: [mensaje]" |
| Error: sin caja | `Left<BusinessRuleFailure>` | "No hay caja abierta. No se puede registrar salida." |

## Reglas de Negocio

1. **Cierre de sesión**: Se debe encontrar una sesión con status='active' para la placa. Si no existe, retornar `NotFoundFailure`.

2. **Duración en minutos**: `durationMinutes = (exit_at - entry_at) en minutos`

3. **Minutos de gracia**: Si `durationMinutes < tariff.grace_minutes`, no se cobra. Retornar con monto=0 y método='mensual'.

4. **Tarifa aplicable**: Si la sesión tiene `monthly_plan_id`, usar `monthlyPlan.planType.price` como tope diario. Si es rotación, aplicar tarifa horaria/por minuto según configuración.

5. **Cálculo de monto**:
   ```
   Si durationMinutes < graceMinutes:
     amountDue = 0
   Sino:
     Si es mensualidad activa:
       amountDue = 0 (gratis dentro de vigencia)
     Sino (rotación):
       amountDue = calcularTarifa(durationMinutes, vehicleType)
       amountDue = Math.min(amountDue, tariff.dailyCap)  // Aplicar tope diario
   ```

6. **Pago registrado**: Se crea un `PaymentEntity` con:
   - invoiceId: NULL (se emite factura después si hay cobro)
   - method: parámetro recibido
   - amount_cents: amountDue
   - status: **siempre `'completed'`**. El cajero solo registra cuando ya
     recibió el dinero (efectivo en mano, tarjeta deslizada, transferencia
     validada). No hay flujo asíncrono de confirmación. Reservar `'pending'`
     para cuando exista integración con pasarela que requiera webhook.
   - paidAt: NOW()

7. **Justificación obligatoria**: Si method es `cortesia`, `error` o `mensual`, el campo `justificationIfFree` es obligatorio. Si no viene, retornar `ValidationFailure`.

8. **Timestamp UTC**: `exit_at` se convierte a UTC antes de guardar.

9. **Tarifa solo si hay cobro real**: el lookup de
   `repo.getActiveTariff(session.vehicleType)` se hace **únicamente** si
   el método de pago no es gratis y la sesión no es mensualidad activa.
   Esto permite cerrar sesiones de tipos sin tarifa configurada
   (ej. `'otro'`) usando un método gratis (cortesía/error) con
   justificación. Si el método requiere cobro y no hay tarifa,
   retorna `ValidationFailure('No se encontró tarifa activa', 'tariff')`.

## Flujo Principal

1. **Encontrar sesión activa**
   - Consultar `parking_sessions` WHERE `vehicle_plate = normalized_plate` AND `status = 'active'` AND `_deleted = FALSE`
   - Si no existe, retornar `NotFoundFailure`

2. **Calcular duración**
   - `durationMinutes = (exitAt || NOW() - session.entry_at) / 60`
   - Redondear al minuto superior (Math.ceil)

3. **Buscar tarifa vigente**
   - Consultar `tariffs` WHERE `vehicle_type = session.vehicle_type` AND `is_active = TRUE`
   - Seleccionar la tarifa que coincida con el schedule actual (horario de operación)

4. **Aplicar minutos de gracia**
   - Si `durationMinutes < tariff.grace_minutes`:
     - `amountDue = 0`
     - Crear notificación: "Vehículo ABC123 salió dentro de los [X] minutos de gracia. Sin cobro."

5. **Verificar si es mensualidad activa**
   - Si `session.monthly_plan_id` NO es NULL:
     - Si `monthly_plan.status = 'active'` y fecha dentro de vigencia:
       - `amountDue = 0` (incluido en la mensualidad)
       - `paymentMethod = 'mensual'`
     - Si `monthly_plan.status = 'expired'`:
       - Cobrar como rotación (siguiente paso)

6. **Calcular tarifa si es rotación**
   - Si `amountDue` sigue siendo NULL (no es mensualidad):
     - `baseAmount = calculateFeeByTariff(durationMinutes, tariff)`
     - `amountDue = Math.min(baseAmount, tariff.dailyCap)`

7. **Validar justificación**
   - Si `paymentMethod` IN ['cortesia', 'error', 'mensual'] Y `justificationIfFree` es vacio:
     - Retornar `ValidationFailure`

8. **Crear pago**
   - Crear `PaymentEntity`:
     - method: paymentMethod
     - amount_cents: amountDue
     - status: **siempre `'completed'`** (ver regla 6).
     - paid_at: NOW()
     - cashier_shift_id: shift actual del operario

9. **Actualizar sesión**
   - UPDATE `parking_sessions` SET:
     - `exit_at = exitAt || NOW()`
     - `status = 'completed'`
     - `amount_due_cents = amountDue`
     - `exit_user_id = userId`
     - `updated_at = NOW()`

10. **Retornar resultado**
    - `Right<{session: ParkingSessionEntity, payment: PaymentEntity}>`

## Edge Cases

- **Sesión sin tarifa**: Si no se encuentra tarifa vigente, retornar `ServerFailure`
- **Mensualidad en transición**: Si la mensualidad vence EN LA HORA DE LA SALIDA
  - Si falta < 1 minuto para vencer, cobrar como rotación
  - Sino, cobrar como mensualidad
- **Operario sin caja abierta**: Retornar `BusinessRuleFailure`
- **Sin conexión**: Guardar en local con `_sync_status='pending'`. Al sincronizar, verificar que la sesión siga existiendo en remoto.

## Dependencias

- `ParkingRepository.registerExit(plate, exitAt, paymentMethod, justification?, userId)`
- `ParkingRepository.getSessionByPlate(plate)`
- `TariffRepository.getActiveTariff(vehicleType)`
- `CalculateParkingFeeUseCase.execute(durationMinutes, tariff, monthly_plan?)`
- `PaymentRepository.registerPayment(payment)`
- `MonthlyPlanRepository.getActivePlanByPlate(plate)` - verificar vigencia

## Mapping a UI

- **Invocación**: `OperatorDashboardPage` → búsqueda de placa activa → `VehicleExitDialogComponent`
- **Formulario**: `ParkingForms.createExitForm()`
  - Control `plate` (lectura: viene pre-llenada)
  - Control `vehicleType` (lectura: viene del registro de entrada)
  - Control `paymentMethod` (requerido, select)
  - Control `justificationIfFree` (conditional: aparece si método es cortesía/error/mensual)
- **Feedback**:
  - Éxito: Dialog con resumen "Vehículo ABC123 salido. Cobro: $5.000 (COP)"
  - Error: Mostrar mensaje de error con opción de reintentar
- **Cálculo en tiempo real**: Mostrar monto aproximado mientras se edita el formulario
- **Sin conexión**: Guardar localmente y notificar sincronización pendiente

---
Status: Implementado · Última corrección 2026-05-02 (status pago siempre `completed`).
