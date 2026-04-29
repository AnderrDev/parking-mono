# Spec: Registrar Entrada de Vehículo

## Identificador
`parking/register-vehicle-entry`

## Descripción
El operario registra la entrada de un vehículo al parqueadero mediante la placa. El sistema valida que no exista ya una sesión activa para esa placa, verifica la disponibilidad de un turno de caja abierto, y determina si el vehículo tiene una mensualidad vigente.

## Actor
Operario (usuario con rol operador)

## Pre-condiciones
- El operario ha iniciado sesión en la aplicación
- El operario tiene un turno de caja abierto
- Hay conexión de red (o la operación se guarda en local para sincronización posterior)

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| plate | string | Sí | Formato placa colombiana (ABC123 o ABC12D) - normalizado a mayúsculas, sin espacios |
| vehicleType | VehicleType | Sí | Enum: `carro`, `moto`, `bicicleta`, `otro` |
| color | string | No | Observación visual (ej: "blanco", "negro") |
| brand | string | No | Marca del vehículo (ej: "Toyota", "Honda") |
| userId | string | Sí | UUID del operario autenticado (obtenido de contexto de auth) |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<ParkingSessionEntity>` | Sesión creada con id, entryAt (timestamp actual), status='active', durationMinutes=0 (hasta que se registre salida) |
| Error: placa duplicada | `Left<BusinessRuleFailure>` | "El vehículo ABC123 ya tiene una sesión activa. Cierre la sesión anterior para registrar una nueva entrada." |
| Error: sin caja abierta | `Left<BusinessRuleFailure>` | "No hay un turno de caja abierto. Abre un turno antes de registrar entradas." |
| Error: placa inválida | `Left<ValidationFailure>` | "La placa ABC123 no cumple el formato colombiano esperado (ABC123 o ABC12D)." |
| Error: sin mensualidad (aviso) | `Right<ParkingSessionEntity>` | Sesión creada como rotación (sin monthly_plan_id), con notificación: "La mensualidad del vehículo ABC123 está vencida. Se registra como rotación." |
| Error: servidor | `Left<ServerFailure>` | "Error al registrar entrada: [mensaje de error]" |
| Error: red | `Left<NetworkFailure>` | "Sin conexión a internet. Se guardará localmente y sincronizará cuando haya conexión." |

## Reglas de Negocio

1. **Unicidad de placa activa**: Una placa solo puede tener UNA sesión activa a la vez. Si ya existe una sesión con status='active' para esa placa, retornar `Left<BusinessRuleFailure>`.

2. **Placa normalizada**: La placa se normaliza a mayúsculas, se elimina espacios en blanco, se valida el formato (ABC123, ABC12D, etc.).

3. **Turno de caja obligatorio**: El operario debe tener un `CashierShift` con status='open' en la base de datos. Si no existe, retornar error.

4. **Mensualidad activa**: Si existe un `MonthlyPlan` con status='active' para esa placa y la fecha actual está dentro de [start_date, end_date], asociar `monthly_plan_id` a la sesión.

5. **Mensualidad vencida**: Si existe un `MonthlyPlan` pero ya expiró (end_date < hoy), no asociar a la sesión y crear notificación al operario. Se cobra como rotación.

6. **Timestamp en UTC**: La fecha de entrada (`entry_at`) se guarda en UTC (no en hora local colombiana).

7. **Sin sincronización en UI**: Si hay error de red, se guarda en local (IndexedDB) con `status='pending_sync'` y se sincroniza automáticamente cuando haya conexión.

## Flujo Principal

1. **Validar placa**
   - Normalizar: mayúsculas, trim, eliminar espacios
   - Validar formato contra regex: `^[A-Z]{2,3}\d{2,3}[A-Z]?$`
   - Si no cumple, retornar `ValidationFailure`

2. **Verificar sesión activa**
   - Consultar `parking_sessions` WHERE `vehicle_plate = normalized_plate` AND `status = 'active'` AND `_deleted = FALSE`
   - Si existe, retornar `BusinessRuleFailure`

3. **Verificar caja abierta**
   - Consultar `cashier_shifts` WHERE `user_id = userId` AND `status = 'open'` AND `_deleted = FALSE`
   - Si no existe, retornar `BusinessRuleFailure`

4. **Buscar mensualidad vigente**
   - Consultar `monthly_plans` WHERE `vehicle_plate = normalized_plate` AND `status IN ('active', 'expiring')` AND `end_date >= TODAY` AND `_deleted = FALSE`
   - Si existe y status='active', usar su `id` en el siguiente paso
   - Si existe pero status='expiring', crear notificación: "Mensualidad próxima a vencer el [fecha]"
   - Si la fecha ya pasó (end_date < TODAY), crear notificación: "Mensualidad vencida. Se cobra como rotación."

5. **Crear sesión**
   - Crear `ParkingSessionEntity`:
     - id: UUID generado
     - vehicle_plate: normalized_plate
     - vehicle_type: parámetro recibido
     - entry_at: NOW() en UTC
     - exit_at: NULL
     - status: 'active'
     - monthly_plan_id: id de plan si existe y está vigente; NULL si es rotación
     - amount_due_cents: NULL (se calcula en salida)
     - entry_user_id: userId
     - exit_user_id: NULL
     - durationMinutes: 0

6. **Guardar en BD**
   - Si hay conexión: insertar en `parking_sessions` via Supabase
   - Si sin conexión: guardar en IndexedDB local con `_sync_status='pending'`

7. **Retornar resultado**
   - `Right<ParkingSessionEntity>` con la entidad creada

## Edge Cases

- **Placa con caracteres especiales**: Si viene "ABC-123" o "ABC 123", normalizar (quitar guion y espacios)
- **Moto con placa corta**: "ABC12D" es válido (moto). Aceptar.
- **Carga con placa larga**: "ABC1234" es válido (carga). Aceptar.
- **Race condition**: Dos operarios registran la misma placa simultáneamente
  - Solución: Constraint UNIQUE en BD: `UNIQUE(vehicle_plate) WHERE status='active' AND _deleted=FALSE`
  - El segundo intento fallará en BD, se retorna `BusinessRuleFailure`
- **Sin conexión**: Operación se guarda en local con `_sync_status='pending'`. Cuando sincroniza, si la placa ya existe en remoto, rechazar la sincronización y notificar al operario.
- **Placa NULL o vacía**: Retornar `ValidationFailure` con mensaje: "La placa es obligatoria"
- **Tipo de vehículo inválido**: Si viene algo que no está en el enum, retornar `ValidationFailure`

## Dependencias

- `ParkingRepository.registerEntry(plate, vehicleType, color?, brand?, userId)`
- `ParkingRepository.getSessionByPlate(plate)` - verificar duplicados
- `MonthlyPlanRepository.getActivePlanByPlate(plate)`
- `CashierRepository.getCurrentShift(userId)` - verificar caja abierta
- `NotificationService.notify(message)` - para avisos de mensualidad vencida/próxima a vencer

## Mapping a UI

- **Invocación**: `OperatorDashboardPage` → `VehicleEntryFormComponent` → botón "Registrar Entrada"
- **Formulario reactivo**: `ParkingForms.createEntryForm()`
  - Control `plate` (requerido, validador de placa)
  - Control `vehicleType` (requerido, select)
  - Control `color` (opcional, text)
  - Control `brand` (opcional, text)
- **Feedback al usuario**:
  - Éxito: Toast verde "Vehículo ABC123 registrado a las 14:32"
  - Error: Dialog rojo con el mensaje del `Failure`
  - Aviso: Toast amarillo "Mensualidad vencida. Se cobra como rotación."
- **Estado de loading**: Spinner mientras se envía a servidor
- **Sin conexión**: Notificación: "Guardado localmente. Se sincronizará cuando haya conexión."

---
Status: Pendiente de Implementación
