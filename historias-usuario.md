# Historias de Usuario — Sistema de Administración de Parqueadero

**Versión:** 1.0
**Fecha:** Abril 2026
**Formato:** Cada HU sigue: Como [rol], quiero [acción], para [beneficio]
**Prioridad:** P0 = MVP obligatorio, P1 = MVP deseable, P2 = post-MVP
**Estimación:** en story points (fibonacci: 1, 2, 3, 5, 8, 13)

---

## Índice de Épicas

| # | Épica | HUs | Prioridad |
|---|---|---|---|
| E01 | Autenticación y roles | 5 | P0 |
| E02 | Gestión de tarifas | 4 | P0 |
| E03 | Operación de parqueadero (ingreso/salida) | 8 | P0 |
| E04 | Gestión de clientes | 4 | P0 |
| E05 | Mensualidades | 7 | P0 |
| E06 | Pagos y cobros | 6 | P0 |
| E07 | Caja y turnos | 5 | P0 |
| E08 | Facturación electrónica DIAN | 8 | P0 |
| E09 | Reportes | 6 | P1 |
| E10 | Notificaciones | 4 | P1 |
| E11 | Offline y sincronización | 5 | P0 |
| E12 | Auditoría | 3 | P0 |
| E13 | Configuración del sistema | 3 | P1 |

---

## E01 — Autenticación y Roles

### HU-001: Inicio de sesión
**Prioridad:** P0 | **Puntos:** 3

**Como** operario o administrador,
**quiero** iniciar sesión con mi correo y contraseña,
**para** acceder al sistema según mi rol asignado.

**Criterios de aceptación:**
- Formulario con campos email y contraseña, ambos obligatorios.
- Validación de credenciales contra Supabase Auth.
- Si las credenciales son correctas, redirigir al dashboard correspondiente al rol.
- Si son incorrectas, mostrar mensaje de error sin revelar si el email existe.
- Después de 5 intentos fallidos consecutivos, bloquear el acceso por 15 minutos.
- El token JWT se almacena de forma segura y se refresca automáticamente.

**Spec:** `specs/features/auth/login.spec.md`
**UseCase:** `LoginUseCase`

---

### HU-002: Cierre de sesión
**Prioridad:** P0 | **Puntos:** 1

**Como** usuario autenticado,
**quiero** cerrar mi sesión,
**para** proteger mi cuenta cuando termine mi turno.

**Criterios de aceptación:**
- Botón de cerrar sesión visible en el menú principal.
- Al cerrar sesión, se invalida el token JWT.
- Redirige a la pantalla de login.
- Si el operario tiene un turno de caja abierto, mostrar advertencia: "Tienes un turno de caja abierto. ¿Deseas cerrarlo antes de salir?"
- Los datos offline pendientes de sincronización NO se pierden al cerrar sesión.

**Spec:** `specs/features/auth/logout.spec.md`
**UseCase:** `LogoutUseCase`

---

### HU-003: Gestión de usuarios (admin)
**Prioridad:** P0 | **Puntos:** 5

**Como** administrador,
**quiero** crear, editar y desactivar usuarios del sistema,
**para** controlar quién tiene acceso y con qué permisos.

**Criterios de aceptación:**
- Listado de usuarios con nombre, email, rol y estado (activo/inactivo).
- Formulario de creación con campos: nombre, email, rol (admin/operador/contador), contraseña temporal.
- Al crear, se envía email de bienvenida con instrucciones para cambiar contraseña.
- Edición permite cambiar nombre, rol y estado. No permite cambiar email.
- Desactivar un usuario impide su login pero NO elimina sus registros históricos.
- Un admin no puede desactivarse a sí mismo.
- Solo el rol admin puede acceder a esta funcionalidad.

**Spec:** `specs/features/auth/manage-users.spec.md`
**UseCase:** `CreateUserUseCase`, `UpdateUserUseCase`, `DeactivateUserUseCase`

---

### HU-004: Cambio de contraseña
**Prioridad:** P1 | **Puntos:** 2

**Como** usuario autenticado,
**quiero** cambiar mi contraseña,
**para** mantener la seguridad de mi cuenta.

**Criterios de aceptación:**
- Requiere contraseña actual + contraseña nueva + confirmación.
- La nueva contraseña debe tener mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número.
- Si la contraseña actual no coincide, mostrar error.
- Después de cambiar, cerrar todas las sesiones activas excepto la actual.

**Spec:** `specs/features/auth/change-password.spec.md`
**UseCase:** `ChangePasswordUseCase`

---

### HU-005: Recuperación de contraseña
**Prioridad:** P1 | **Puntos:** 2

**Como** usuario que olvidó su contraseña,
**quiero** recibir un enlace de recuperación por correo,
**para** restablecer mi acceso.

**Criterios de aceptación:**
- Formulario con campo email.
- Si el email existe, enviar enlace de recuperación (token con expiración de 1 hora).
- Si el email no existe, mostrar el mismo mensaje genérico (no revelar si existe).
- El enlace lleva a un formulario de nueva contraseña + confirmación.
- Después de restablecer, redirigir al login.

**Spec:** `specs/features/auth/recover-password.spec.md`
**UseCase:** `RecoverPasswordUseCase`

---

## E02 — Gestión de Tarifas

### HU-006: Crear tarifa
**Prioridad:** P0 | **Puntos:** 5

**Como** administrador,
**quiero** crear tarifas de cobro para cada tipo de vehículo,
**para** definir cuánto se cobra por el servicio de parqueadero.

**Criterios de aceptación:**
- Formulario con: nombre, tipo de vehículo (carro/moto/bicicleta/otro), unidad de cobro (minuto/hora/fracción de hora/día), valor por unidad (en pesos COP), minutos de gracia, valor tope diario.
- Campos opcionales: horario de vigencia (ej: solo diurna 6am-10pm), fecha inicio y fecha fin (para promociones).
- El valor por unidad debe ser mayor a $0.
- Los minutos de gracia tienen default 0 y máximo 60.
- El tope diario es opcional; si se deja vacío, no hay tope.
- Al guardar, la tarifa queda activa inmediatamente (o en la fecha configurada).
- Solo admin puede crear tarifas.

**Spec:** `specs/features/parking/create-tariff.spec.md`
**UseCase:** `CreateTariffUseCase`

---

### HU-007: Editar tarifa
**Prioridad:** P0 | **Puntos:** 3

**Como** administrador,
**quiero** modificar una tarifa existente,
**para** ajustar precios o condiciones sin crear una nueva.

**Criterios de aceptación:**
- Mismos campos que la creación.
- Los cambios aplican a partir del momento de guardar (no retroactivos).
- Las sesiones de parqueo activas al momento del cambio NO se ven afectadas — se les aplica la tarifa que tenían al ingresar.
- Se registra en auditoría: quién cambió, qué cambió, valores anteriores y nuevos.

**Spec:** `specs/features/parking/edit-tariff.spec.md`
**UseCase:** `EditTariffUseCase`

---

### HU-008: Desactivar tarifa
**Prioridad:** P0 | **Puntos:** 2

**Como** administrador,
**quiero** desactivar una tarifa que ya no se usa,
**para** que no aparezca como opción al registrar vehículos.

**Criterios de aceptación:**
- La tarifa desactivada no se elimina — se marca como inactiva.
- No aparece en la selección de tarifas del operario.
- Las sesiones históricas que usaron esta tarifa mantienen su referencia.
- Se puede reactivar en cualquier momento.

**Spec:** `specs/features/parking/deactivate-tariff.spec.md`
**UseCase:** `DeactivateTariffUseCase`

---

### HU-009: Ver tarifas vigentes
**Prioridad:** P0 | **Puntos:** 2

**Como** operario o administrador,
**quiero** ver las tarifas activas del parqueadero,
**para** informar al cliente cuánto se le va a cobrar.

**Criterios de aceptación:**
- Listado de tarifas activas con: nombre, tipo de vehículo, valor, unidad, gracia, tope.
- Filtrable por tipo de vehículo.
- Ordenable por nombre o valor.
- El operario solo puede ver (no editar).

**Spec:** `specs/features/parking/list-tariffs.spec.md`
**UseCase:** `GetActiveTariffsUseCase`

---

## E03 — Operación de Parqueadero (Ingreso / Salida)

### HU-010: Registrar ingreso de vehículo
**Prioridad:** P0 | **Puntos:** 5

**Como** operario,
**quiero** registrar la entrada de un vehículo al parqueadero,
**para** iniciar el conteo de tiempo y controlar la ocupación.

**Criterios de aceptación:**
- Formulario con: placa (obligatorio, formato colombiano), tipo de vehículo (obligatorio, selector).
- La placa se normaliza automáticamente a mayúsculas sin espacios.
- Si la placa ya tiene una sesión activa, mostrar error: "El vehículo [placa] ya está en el parqueadero".
- Si la placa tiene mensualidad activa, la sesión se asocia al plan y se muestra indicador visual "MENSUAL".
- Si la placa tiene mensualidad vencida, mostrar advertencia: "Mensualidad vencida desde [fecha]. Se cobrará tarifa de rotación" y permitir continuar.
- La hora de ingreso se registra automáticamente (now()).
- El ingreso queda asociado al operario autenticado.
- Funciona offline: se guarda localmente y sincroniza después.
- Después de registrar, el formulario se limpia para el siguiente ingreso.
- Se muestra confirmación: "Vehículo [placa] ingresado a las [hora]".

**Spec:** `specs/features/parking/register-vehicle-entry.spec.md`
**UseCase:** `RegisterVehicleEntryUseCase`

---

### HU-011: Registrar salida de vehículo
**Prioridad:** P0 | **Puntos:** 8

**Como** operario,
**quiero** registrar la salida de un vehículo y cobrarle,
**para** cerrar la sesión de parqueo y generar el pago.

**Criterios de aceptación:**
- El operario busca el vehículo por placa o selecciona de la lista de sesiones activas.
- El sistema muestra: placa, tipo, hora de ingreso, tiempo transcurrido, tarifa aplicable, valor a cobrar.
- Si es mensualidad activa, el valor a cobrar es $0 y se muestra "Cubierto por mensualidad [plan]".
- Si es rotación, se calcula según la tarifa:
  - Si el tiempo es menor a los minutos de gracia, el valor es $0 y se muestra "Dentro del periodo de gracia".
  - El cálculo respeta el tope diario si está configurado.
- El operario selecciona método de pago (efectivo, tarjeta, transferencia).
- Si es efectivo: ingresa el monto recibido, el sistema calcula el cambio.
- Al confirmar, se registra el pago, se cierra la sesión y se dispara la emisión de factura electrónica.
- Se muestra confirmación con resumen: placa, tiempo, valor cobrado, método de pago.
- Funciona offline para el registro de salida y pago en efectivo. La factura se emite cuando haya conexión.

**Spec:** `specs/features/parking/register-vehicle-exit.spec.md`
**UseCase:** `RegisterVehicleExitUseCase`

---

### HU-012: Calcular valor de parqueo
**Prioridad:** P0 | **Puntos:** 5

**Como** sistema (invocado por el operario al registrar salida),
**quiero** calcular el valor a cobrar según la tarifa configurada,
**para** cobrar el precio correcto al cliente.

**Criterios de aceptación:**
- Recibe: sesión de parqueo (con hora de ingreso y tarifa asociada) + hora de salida.
- Calcula según la unidad de la tarifa:
  - **Por minuto:** (minutos transcurridos - gracia) × valor por minuto. Mínimo $0.
  - **Por hora:** horas completas o fracción × valor por hora. Fracción de hora se cobra como hora completa.
  - **Por fracción (15/30 min):** bloques completados o iniciados × valor por bloque.
  - **Por día:** días completos o fracción × valor por día.
- Aplica tope diario: si el valor calculado supera el tope, se cobra el tope.
- Para periodos que cruzan medianoche con tarifas diferenciadas (diurna/nocturna): se calcula cada tramo por separado.
- El resultado se expresa en centavos (entero) para evitar problemas de redondeo.
- Retorna: valor en centavos, desglose del cálculo, tarifa aplicada, tiempo total.

**Spec:** `specs/features/parking/calculate-parking-fee.spec.md`
**UseCase:** `CalculateParkingFeeUseCase`

---

### HU-013: Ver sesiones activas
**Prioridad:** P0 | **Puntos:** 3

**Como** operario,
**quiero** ver todos los vehículos actualmente en el parqueadero,
**para** saber la ocupación y encontrar vehículos rápidamente.

**Criterios de aceptación:**
- Tabla con: placa, tipo de vehículo, hora de ingreso, tiempo transcurrido (actualizado en tiempo real), indicador mensual/rotación.
- Ordenada por hora de ingreso (más reciente primero) por defecto.
- Filtrable por tipo de vehículo y por mensual/rotación.
- Buscable por placa (búsqueda parcial, ej: "ABC" encuentra "ABC123").
- Muestra el total de vehículos en el parqueadero y un resumen: X carros, Y motos.
- Se actualiza en tiempo real vía Supabase Realtime (cuando está online).
- Funciona offline con datos locales (puede no estar 100% actualizada).

**Spec:** `specs/features/parking/get-active-sessions.spec.md`
**UseCase:** `GetActiveSessionsUseCase`

---

### HU-014: Buscar vehículo por placa
**Prioridad:** P0 | **Puntos:** 2

**Como** operario,
**quiero** buscar un vehículo por su placa,
**para** verificar si está en el parqueadero o consultar su historial.

**Criterios de aceptación:**
- Campo de búsqueda con autocompletado al escribir 3+ caracteres.
- Busca en sesiones activas primero, luego en historial.
- Muestra: placa, estado (dentro/fuera), si tiene mensualidad, última visita.
- Si está dentro: muestra tiempo transcurrido y botón de registrar salida.
- Si tiene mensualidad: muestra estado del plan y fecha de vencimiento.

**Spec:** `specs/features/parking/search-vehicle-by-plate.spec.md`
**UseCase:** `SearchVehicleByPlateUseCase`

---

### HU-015: Registrar salida sin cobro (cortesía)
**Prioridad:** P0 | **Puntos:** 3

**Como** operario,
**quiero** registrar la salida de un vehículo sin cobrar,
**para** manejar casos como cortesías, errores de registro o vehículos de servicio.

**Criterios de aceptación:**
- Solo disponible si el operario tiene permiso (configurable por admin).
- Requiere seleccionar un motivo: cortesía, error de registro, vehículo de servicio, otro.
- Si selecciona "otro", debe escribir una justificación (mínimo 10 caracteres).
- Queda registrado en auditoría: quién, cuándo, qué vehículo, motivo.
- No genera factura.
- Si se exceden 3 cortesías en un turno, se notifica al administrador.

**Spec:** `specs/features/parking/register-courtesy-exit.spec.md`
**UseCase:** `RegisterCourtesyExitUseCase`

---

### HU-016: Ver historial de sesiones
**Prioridad:** P1 | **Puntos:** 3

**Como** administrador,
**quiero** ver el historial de todas las sesiones de parqueo,
**para** auditar la operación y analizar patrones.

**Criterios de aceptación:**
- Tabla con: placa, tipo, entrada, salida, duración, valor cobrado, método de pago, operario, estado.
- Filtrable por: rango de fechas, tipo de vehículo, operario, método de pago, mensual/rotación.
- Exportable a Excel/CSV.
- Paginación de 50 registros por página.
- Por defecto muestra el día actual.

**Spec:** `specs/features/parking/session-history.spec.md`
**UseCase:** `GetSessionHistoryUseCase`

---

### HU-017: Anular sesión de parqueo
**Prioridad:** P0 | **Puntos:** 3

**Como** administrador,
**quiero** anular una sesión de parqueo registrada por error,
**para** corregir errores sin afectar la contabilidad.

**Criterios de aceptación:**
- Solo el admin puede anular.
- Requiere motivo obligatorio (mínimo 10 caracteres).
- Si la sesión tiene pago asociado, el pago también se anula.
- Si la sesión tiene factura emitida, se genera automáticamente una nota crédito.
- La sesión anulada queda visible en el historial con estado "anulada".
- Queda registrada en auditoría con todos los detalles.

**Spec:** `specs/features/parking/cancel-session.spec.md`
**UseCase:** `CancelParkingSessionUseCase`

---

## E04 — Gestión de Clientes

### HU-018: Crear cliente
**Prioridad:** P0 | **Puntos:** 3

**Como** operario o administrador,
**quiero** registrar los datos de un cliente,
**para** asociarlo a mensualidades y emitir facturas a su nombre.

**Criterios de aceptación:**
- Formulario con: tipo de documento (CC/NIT/CE/pasaporte/PPT), número de documento, dígito de verificación (solo NIT), nombre o razón social, email, teléfono, dirección, municipio, departamento.
- Los campos obligatorios para facturación DIAN son: tipo doc, número doc, nombre, email.
- Validación de formato de NIT con dígito de verificación.
- Validación de email y teléfono colombiano.
- No se permiten duplicados por tipo+número de documento.
- Si el documento ya existe, mostrar los datos y preguntar si desea actualizar.

**Spec:** `specs/features/customers/create-customer.spec.md`
**UseCase:** `CreateCustomerUseCase`

---

### HU-019: Editar cliente
**Prioridad:** P0 | **Puntos:** 2

**Como** operario o administrador,
**quiero** actualizar los datos de un cliente existente,
**para** mantener la información actualizada para facturación.

**Criterios de aceptación:**
- Permite editar todos los campos excepto tipo y número de documento.
- Los cambios se reflejan en futuras facturas (no retroactivos).
- Se registra en auditoría.

**Spec:** `specs/features/customers/edit-customer.spec.md`
**UseCase:** `UpdateCustomerUseCase`

---

### HU-020: Buscar cliente
**Prioridad:** P0 | **Puntos:** 2

**Como** operario,
**quiero** buscar un cliente por documento, nombre o placa asociada,
**para** encontrar rápidamente sus datos al momento de cobrar o crear una mensualidad.

**Criterios de aceptación:**
- Búsqueda por número de documento (parcial), nombre (parcial) o placa asociada.
- Resultados en tiempo real al escribir 3+ caracteres.
- Muestra: nombre, documento, email, planes activos, última visita.
- Al seleccionar un cliente, se cargan sus datos en el formulario activo.

**Spec:** `specs/features/customers/search-customer.spec.md`
**UseCase:** `SearchCustomersUseCase`

---

### HU-021: Consultar datos por documento (integración DIAN)
**Prioridad:** P2 | **Puntos:** 3

**Como** operario,
**quiero** que al ingresar un NIT o cédula se autocompleten los datos del cliente desde la DIAN,
**para** ahorrar tiempo y evitar errores de digitación.

**Criterios de aceptación:**
- Al ingresar tipo y número de documento, consulta el servicio de la DIAN (GetAcquirer).
- Si encuentra datos, autocompleta nombre/razón social y email.
- El operario puede editar los datos autocompletados antes de guardar.
- Si la DIAN no responde o no encuentra datos, permite ingreso manual.
- Solo funciona con conexión a internet.

**Spec:** `specs/features/customers/dian-lookup.spec.md`
**UseCase:** `LookupCustomerDianUseCase`

---

## E05 — Mensualidades

### HU-022: Crear plan de mensualidad
**Prioridad:** P0 | **Puntos:** 5

**Como** administrador u operario,
**quiero** crear un plan de mensualidad para un cliente y su vehículo,
**para** que el cliente tenga acceso al parqueadero por un periodo fijo a un precio acordado.

**Criterios de aceptación:**
- Formulario con: cliente (buscador), placa del vehículo, tipo de plan (seleccionar de planes configurados), fecha inicio, monto (pre-llenado del plan pero editable), auto-renovación (sí/no).
- La fecha fin se calcula automáticamente según la duración del plan (30 días por defecto).
- Un vehículo solo puede tener una mensualidad activa a la vez.
- Al crear, se genera el cobro y la factura electrónica.
- Si el pago es exitoso, el plan se activa inmediatamente.
- Si el pago falla, el plan queda en estado "pendiente de pago".

**Spec:** `specs/features/monthly-plans/create-monthly-plan.spec.md`
**UseCase:** `CreateMonthlyPlanUseCase`

---

### HU-023: Renovar mensualidad
**Prioridad:** P0 | **Puntos:** 5

**Como** sistema (automático) o administrador (manual),
**quiero** renovar una mensualidad próxima a vencer,
**para** que el cliente no pierda continuidad en el servicio.

**Criterios de aceptación:**
- **Renovación automática (si auto_renew = true):**
  - 3 días antes del vencimiento, intentar cobro con token de pago guardado.
  - Si el cobro es exitoso: renovar el plan, emitir factura, notificar al cliente.
  - Si el cobro falla: notificar al cliente, reintentar al día siguiente (máximo 3 intentos).
  - Si todos los intentos fallan: marcar como "expirada" y notificar al admin.
- **Renovación manual (por admin):**
  - Permite seleccionar plan a renovar, ajustar monto si aplica, procesar pago.
  - La nueva vigencia empieza donde terminó la anterior (sin gaps).

**Spec:** `specs/features/monthly-plans/renew-monthly-plan.spec.md`
**UseCase:** `RenewMonthlyPlanUseCase`

---

### HU-024: Cancelar mensualidad
**Prioridad:** P0 | **Puntos:** 3

**Como** administrador,
**quiero** cancelar una mensualidad activa,
**para** gestionar bajas de clientes.

**Criterios de aceptación:**
- Requiere motivo de cancelación.
- La cancelación es efectiva inmediatamente.
- No genera devolución automática (si aplica, se hace nota crédito manual).
- El vehículo pasa a ser tratado como rotación en su próximo ingreso.
- Se notifica al cliente por email.
- Se registra en auditoría.

**Spec:** `specs/features/monthly-plans/cancel-monthly-plan.spec.md`
**UseCase:** `CancelMonthlyPlanUseCase`

---

### HU-025: Verificar validez de mensualidad al ingreso
**Prioridad:** P0 | **Puntos:** 3

**Como** sistema (invocado automáticamente al registrar ingreso),
**quiero** verificar si el vehículo tiene mensualidad activa,
**para** determinar si se cobra rotación o está cubierto.

**Criterios de aceptación:**
- Busca plan activo por placa.
- Si existe y está vigente: retorna el plan con estado "activa".
- Si existe pero venció en los últimos 3 días: retorna con estado "en gracia" (configurable).
- Si existe pero venció hace más de 3 días: retorna con estado "expirada".
- Si no existe: retorna null.
- El resultado se usa en RegisterVehicleEntryUseCase para decidir el tipo de sesión.

**Spec:** `specs/features/monthly-plans/check-plan-validity.spec.md`
**UseCase:** `CheckPlanValidityUseCase`

---

### HU-026: Ver mensualidades próximas a vencer
**Prioridad:** P1 | **Puntos:** 3

**Como** administrador,
**quiero** ver las mensualidades que vencen en los próximos 7 días,
**para** gestionar renovaciones proactivamente.

**Criterios de aceptación:**
- Listado con: cliente, placa, plan, fecha vencimiento, días restantes, auto-renovación.
- Ordenado por fecha de vencimiento (más próxima primero).
- Indicador visual de urgencia: verde (>5 días), amarillo (3-5 días), rojo (<3 días).
- Acción rápida: botón de renovar desde la lista.

**Spec:** `specs/features/monthly-plans/expiring-plans.spec.md`
**UseCase:** `GetExpiringPlansUseCase`

---

### HU-027: Configurar tipos de plan mensual
**Prioridad:** P0 | **Puntos:** 3

**Como** administrador,
**quiero** configurar los tipos de planes mensuales disponibles,
**para** ofrecer opciones con distintos precios y condiciones.

**Criterios de aceptación:**
- Formulario con: nombre, tipo de vehículo, precio mensual, duración (días, default 30), horario (24/7 o restringido), descripción.
- Ejemplo de planes: "Carro mensual 24/7 - $200.000", "Moto mensual diurno - $80.000".
- Se pueden activar/desactivar planes.
- Al desactivar un plan, las mensualidades existentes siguen vigentes pero no se pueden crear nuevas con ese plan.

**Spec:** `specs/features/monthly-plans/configure-plan-types.spec.md`
**UseCase:** `CreatePlanTypeUseCase`, `UpdatePlanTypeUseCase`

---

### HU-028: Ver historial de mensualidades de un cliente
**Prioridad:** P1 | **Puntos:** 2

**Como** administrador u operario,
**quiero** ver el historial de mensualidades de un cliente,
**para** consultar pagos anteriores y patrones de uso.

**Criterios de aceptación:**
- Listado con: plan, placa, vigencia desde-hasta, monto, estado, factura asociada.
- Accesible desde la ficha del cliente o buscando por placa.

**Spec:** `specs/features/monthly-plans/plan-history.spec.md`
**UseCase:** `GetPlanHistoryUseCase`

---

## E06 — Pagos y Cobros

### HU-029: Registrar pago en efectivo
**Prioridad:** P0 | **Puntos:** 3

**Como** operario,
**quiero** registrar un pago en efectivo,
**para** cobrar al cliente que sale del parqueadero.

**Criterios de aceptación:**
- Se muestra el valor a cobrar.
- El operario ingresa el monto recibido.
- El sistema calcula y muestra el cambio a devolver.
- El monto recibido debe ser mayor o igual al valor a cobrar.
- Al confirmar, el pago se registra asociado a la sesión de parqueo.
- Funciona offline.

**Spec:** `specs/features/payments/register-cash-payment.spec.md`
**UseCase:** `RegisterCashPaymentUseCase`

---

### HU-030: Registrar pago con tarjeta presencial
**Prioridad:** P1 | **Puntos:** 2

**Como** operario,
**quiero** registrar que el cliente pagó con tarjeta (datáfono externo),
**para** dejar constancia del pago y su método.

**Criterios de aceptación:**
- El operario selecciona "Tarjeta crédito" o "Tarjeta débito" como método.
- Ingresa opcionalmente los últimos 4 dígitos como referencia.
- El valor se toma del cálculo de la tarifa (no editable).
- Al confirmar, se registra el pago.
- No integra con datáfono — solo registro manual del método.

**Spec:** `specs/features/payments/register-card-payment.spec.md`
**UseCase:** `RegisterCardPaymentUseCase`

---

### HU-031: Pago en línea de mensualidad (Wompi)
**Prioridad:** P0 | **Puntos:** 8

**Como** cliente del parqueadero,
**quiero** pagar mi mensualidad en línea con tarjeta, PSE, Nequi o Daviplata,
**para** renovar mi plan sin necesidad de ir al parqueadero.

**Criterios de aceptación:**
- Desde el portal de cliente o un link de pago enviado por email/WhatsApp.
- Integración con Wompi: checkout widget embebido.
- Métodos: tarjeta crédito/débito, PSE, Nequi, Daviplata.
- Al completar el pago: se activa/renueva la mensualidad, se emite factura electrónica, se envía comprobante por email.
- Si el pago falla: se muestra error y se permite reintentar.
- El webhook de Wompi confirma el pago (no confiar solo en el front).

**Spec:** `specs/features/payments/online-payment-wompi.spec.md`
**UseCase:** `ProcessOnlinePaymentUseCase`

---

### HU-032: Tokenizar medio de pago para débito recurrente
**Prioridad:** P1 | **Puntos:** 5

**Como** cliente con mensualidad,
**quiero** guardar mi medio de pago para renovación automática,
**para** no tener que pagar manualmente cada mes.

**Criterios de aceptación:**
- Durante el pago de mensualidad, ofrecer opción "Guardar para pagos futuros".
- Se tokeniza el medio de pago vía Wompi (fuentes de pago).
- El token se almacena asociado al cliente (nunca datos de tarjeta).
- El cliente puede eliminar el token en cualquier momento.
- Para cobros recurrentes, el sistema usa el token sin intervención del cliente.

**Spec:** `specs/features/payments/tokenize-payment.spec.md`
**UseCase:** `TokenizePaymentMethodUseCase`

---

### HU-033: Registrar pago por transferencia/QR
**Prioridad:** P1 | **Puntos:** 2

**Como** operario,
**quiero** registrar un pago por transferencia bancaria o código QR,
**para** aceptar pagos digitales presenciales.

**Criterios de aceptación:**
- El operario selecciona "Transferencia/QR" como método.
- Ingresa referencia de la transacción (número de comprobante).
- El valor se toma del cálculo de la tarifa.
- Al confirmar, se registra el pago con la referencia.

**Spec:** `specs/features/payments/register-transfer-payment.spec.md`
**UseCase:** `RegisterTransferPaymentUseCase`

---

### HU-034: Ver métodos de pago aceptados
**Prioridad:** P1 | **Puntos:** 1

**Como** operario,
**quiero** ver los métodos de pago habilitados en el parqueadero,
**para** informar al cliente sus opciones.

**Criterios de aceptación:**
- Lista de métodos habilitados con ícono y nombre.
- Configurable por el admin (activar/desactivar métodos).

**Spec:** `specs/features/payments/payment-methods.spec.md`
**UseCase:** `GetPaymentMethodsUseCase`

---

## E07 — Caja y Turnos

### HU-035: Abrir turno de caja
**Prioridad:** P0 | **Puntos:** 3

**Como** operario,
**quiero** abrir mi turno de caja al iniciar mi jornada,
**para** registrar las transacciones que realice durante mi turno.

**Criterios de aceptación:**
- Al iniciar sesión, si no hay turno abierto, se solicita abrir uno.
- Formulario de apertura con: monto base en caja (el operario cuenta e ingresa el efectivo que recibe).
- Solo se puede tener un turno abierto a la vez (por operario).
- Si ya hay un turno abierto de otro operario que no se cerró, el admin debe cerrarlo primero.
- Al abrir, se registra: operario, hora de apertura, monto base.

**Spec:** `specs/features/cashier/open-shift.spec.md`
**UseCase:** `OpenCashierShiftUseCase`

---

### HU-036: Cerrar turno de caja
**Prioridad:** P0 | **Puntos:** 5

**Como** operario,
**quiero** cerrar mi turno de caja al terminar mi jornada,
**para** hacer el arqueo y entregar cuentas.

**Criterios de aceptación:**
- El operario inicia el cierre y el sistema muestra:
  - Total de transacciones del turno (desglosado por método de pago).
  - Valor esperado en caja (base + cobros en efectivo).
  - Cantidad de vehículos atendidos.
  - Cortesías otorgadas.
- El operario ingresa el conteo real de efectivo (por denominación: billetes de 100k, 50k, 20k, 10k, 5k, 2k, 1k; monedas de 1k, 500, 200, 100, 50).
- El sistema calcula la diferencia (sobrante/faltante).
- Si hay diferencia, el operario debe ingresar una observación explicando.
- Al confirmar, el turno se cierra y no se puede modificar.
- Si hay operaciones offline pendientes de sincronizar, no se permite cerrar — se muestra advertencia.
- El cierre se envía por email al administrador.

**Spec:** `specs/features/cashier/close-shift.spec.md`
**UseCase:** `CloseCashierShiftUseCase`

---

### HU-037: Ver resumen del turno actual
**Prioridad:** P0 | **Puntos:** 3

**Como** operario,
**quiero** ver un resumen en tiempo real de mi turno actual,
**para** saber cuánto he recaudado y cuántos vehículos he atendido.

**Criterios de aceptación:**
- Panel con: hora de apertura, tiempo transcurrido, total recaudado (por método), vehículos atendidos, base de caja, valor esperado actual.
- Se actualiza automáticamente con cada transacción.
- Accesible desde el dashboard principal.

**Spec:** `specs/features/cashier/shift-summary.spec.md`
**UseCase:** `GetShiftSummaryUseCase`

---

### HU-038: Ver historial de turnos
**Prioridad:** P1 | **Puntos:** 3

**Como** administrador,
**quiero** ver el historial de turnos de caja de todos los operarios,
**para** auditar y detectar inconsistencias.

**Criterios de aceptación:**
- Tabla con: operario, fecha, hora apertura/cierre, base, esperado, real, diferencia, observaciones.
- Filtrable por operario, rango de fechas, turnos con diferencia.
- Resaltado visual en turnos con diferencia > $5.000.
- Detalle expandible con el desglose de transacciones del turno.

**Spec:** `specs/features/cashier/shift-history.spec.md`
**UseCase:** `GetShiftHistoryUseCase`

---

### HU-039: Retiro parcial de efectivo
**Prioridad:** P1 | **Puntos:** 3

**Como** operario,
**quiero** registrar un retiro parcial de efectivo de la caja durante mi turno,
**para** no acumular mucho dinero cuando llego al tope configurado por el admin.

**Criterios de aceptación:**
- El admin configura un tope de efectivo en caja (ej: $500.000).
- Cuando se supera el tope, el sistema alerta al operario.
- El operario registra el monto retirado y a quién se lo entregó.
- El retiro se descuenta del esperado en el cierre de turno.
- Se registra en auditoría.

**Spec:** `specs/features/cashier/cash-withdrawal.spec.md`
**UseCase:** `RegisterCashWithdrawalUseCase`

---

## E08 — Facturación Electrónica DIAN

### HU-040: Emitir factura electrónica de venta
**Prioridad:** P0 | **Puntos:** 13

**Como** sistema (automático al cobrar o manual por admin),
**quiero** emitir una factura electrónica válida ante la DIAN,
**para** cumplir con la obligación legal de facturación.

**Criterios de aceptación:**
- Se dispara automáticamente al registrar un pago (salida de vehículo o pago de mensualidad).
- Genera XML UBL 2.1 con toda la estructura requerida por el Anexo Técnico 1.9.
- Calcula el CUFE (SHA-384) con los 14 campos en orden estricto.
- Firma el XML con XAdES-EPES usando el certificado .p12 del facturador.
- Envía al WS DIAN vía SendBillSync y recibe respuesta.
- Si DIAN acepta: almacena el CUFE, XML, ApplicationResponse, genera PDF con QR.
- Si DIAN rechaza: registra el error, marca la factura como rechazada, notifica al admin.
- Si DIAN no responde (timeout/error 5xx): encola para reintento con backoff exponencial.
- Envía al cliente el PDF y XML por email.
- El consecutivo de numeración es asignado atómicamente por el servidor (nunca por el cliente).

**Spec:** `specs/features/invoicing/emit-invoice.spec.md` + `dian-fe-service/specs/emit-invoice.spec.md`
**UseCase:** `EmitInvoiceUseCase`

---

### HU-041: Emitir nota crédito
**Prioridad:** P0 | **Puntos:** 8

**Como** administrador,
**quiero** emitir una nota crédito que anule una factura,
**para** corregir errores o registrar devoluciones.

**Criterios de aceptación:**
- Se asocia a una factura existente por su CUFE.
- Motivo obligatorio: anulación, error, devolución parcial, devolución total.
- Genera XML CreditNote UBL 2.1 referenciando la factura original.
- Mismo flujo de firma, envío DIAN y almacenamiento que la factura.
- Si es devolución parcial, permite especificar líneas y montos a anular.
- Se envía al cliente por email.

**Spec:** `specs/features/invoicing/emit-credit-note.spec.md`
**UseCase:** `CancelInvoiceUseCase`

---

### HU-042: Consultar estado de factura
**Prioridad:** P0 | **Puntos:** 2

**Como** administrador,
**quiero** consultar el estado de una factura ante la DIAN,
**para** verificar si fue aceptada, rechazada o está pendiente.

**Criterios de aceptación:**
- Búsqueda por número de factura o CUFE.
- Muestra: número, fecha, cliente, total, estado DIAN (pendiente/enviada/aceptada/rechazada/contingencia).
- Si está rechazada, muestra el código y mensaje de error DIAN.
- Botón de reintentar envío si está en estado fallido.
- Link para descargar XML y PDF.

**Spec:** `specs/features/invoicing/invoice-status.spec.md`
**UseCase:** `GetInvoiceStatusUseCase`

---

### HU-043: Reintentar facturas pendientes
**Prioridad:** P0 | **Puntos:** 3

**Como** sistema (automático) o administrador (manual),
**quiero** reintentar el envío de facturas que no se pudieron transmitir a la DIAN,
**para** regularizar la facturación cuando hay problemas de conexión.

**Criterios de aceptación:**
- Job automático cada 15 minutos que busca facturas con dian_status = 'pending' o 'failed'.
- Reintenta el envío con backoff exponencial (15min, 30min, 1h, 2h, 4h).
- Después de 48 horas sin poder enviar, marca como contingencia y alerta al admin.
- El admin puede forzar reintento manual desde la UI.
- Muestra un contador de facturas pendientes de transmisión en el dashboard.

**Spec:** `specs/features/invoicing/retry-pending.spec.md`
**UseCase:** `RetryPendingInvoicesUseCase`

---

### HU-044: Manejar contingencia de facturación
**Prioridad:** P0 | **Puntos:** 5

**Como** sistema,
**quiero** manejar la contingencia cuando la DIAN está caída,
**para** que el parqueadero pueda seguir operando sin dejar de facturar.

**Criterios de aceptación:**
- Si la DIAN no responde después de 3 intentos en 1 hora, activar modo contingencia.
- En contingencia: se usa la numeración de talonario de contingencia (prefijo diferente, ej: "FC").
- Se genera un comprobante de contingencia con los datos de la operación.
- Cuando la DIAN vuelve: se transmiten las facturas de contingencia referenciando el talonario.
- Se notifica al admin cuando se entra y sale de contingencia.
- El admin puede activar/desactivar contingencia manualmente.

**Spec:** `specs/features/invoicing/contingency.spec.md`
**UseCase:** `HandleContingencyUseCase`

---

### HU-045: Ver listado de facturas
**Prioridad:** P0 | **Puntos:** 3

**Como** administrador o contador,
**quiero** ver todas las facturas emitidas con sus estados,
**para** llevar control de la facturación.

**Criterios de aceptación:**
- Tabla con: número, fecha, cliente, total, estado DIAN, CUFE, acciones (ver PDF, ver XML).
- Filtrable por: rango de fechas, estado DIAN, cliente, rango de valores.
- Exportable a Excel/CSV para integrar con el contador.
- Totalizadores: total facturado, total IVA, facturas emitidas, facturas pendientes.

**Spec:** `specs/features/invoicing/list-invoices.spec.md`
**UseCase:** `GetInvoicesByDateRangeUseCase`

---

### HU-046: Descargar XML y PDF de factura
**Prioridad:** P0 | **Puntos:** 2

**Como** administrador, contador o cliente,
**quiero** descargar el XML y PDF de una factura,
**para** archivar o procesar en mi sistema contable.

**Criterios de aceptación:**
- Desde el listado de facturas, botones de descarga individual (PDF, XML).
- Desde el detalle de la factura, botones de descarga.
- El PDF incluye: datos del facturador, datos del adquiriente, líneas con descripción/cantidad/valor, subtotal, IVA, total, CUFE, QR, nota legal.
- El XML es el documento firmado enviado a la DIAN.

**Spec:** `specs/features/invoicing/download-invoice.spec.md`
**UseCase:** `DownloadInvoiceUseCase`

---

### HU-047: Consultar rangos de numeración
**Prioridad:** P1 | **Puntos:** 2

**Como** administrador,
**quiero** ver los rangos de numeración autorizados por la DIAN y cuántos consecutivos quedan,
**para** solicitar nuevos rangos antes de que se agoten.

**Criterios de aceptación:**
- Consulta vía GetNumberingRange al WS DIAN.
- Muestra: resolución, prefijo, rango desde-hasta, vigencia, consecutivos usados, consecutivos restantes.
- Alerta cuando queden menos de 100 consecutivos.
- Alerta cuando la vigencia esté a menos de 30 días de vencer.

**Spec:** `specs/features/invoicing/numbering-range.spec.md`
**UseCase:** `GetNumberingRangeUseCase`

---

## E09 — Reportes

### HU-048: Reporte de ingresos diarios
**Prioridad:** P1 | **Puntos:** 3

**Como** administrador,
**quiero** ver un reporte de ingresos del día,
**para** conocer la recaudación diaria del parqueadero.

**Criterios de aceptación:**
- Total recaudado por método de pago.
- Total de vehículos atendidos por tipo.
- Ticket promedio.
- Comparativa con el día anterior y el mismo día de la semana pasada.
- Gráfico de ingresos por hora del día.
- Filtrable por rango de fechas.

**Spec:** `specs/features/reports/daily-revenue.spec.md`
**UseCase:** `GetDailyRevenueReportUseCase`

---

### HU-049: Reporte de ocupación
**Prioridad:** P1 | **Puntos:** 3

**Como** administrador,
**quiero** ver un reporte de ocupación del parqueadero,
**para** identificar horarios pico y optimizar la operación.

**Criterios de aceptación:**
- Ocupación actual (vehículos dentro / capacidad total si está configurada).
- Gráfico de ocupación por hora del día (heatmap o línea).
- Tiempo promedio de permanencia por tipo de vehículo.
- Días/horas de mayor ocupación de la semana.
- Porcentaje de rotación vs mensualidades.

**Spec:** `specs/features/reports/occupancy.spec.md`
**UseCase:** `GetOccupancyReportUseCase`

---

### HU-050: Reporte de cartera de mensualidades
**Prioridad:** P1 | **Puntos:** 3

**Como** administrador,
**quiero** ver el estado de la cartera de mensualidades,
**para** conocer ingresos recurrentes y morosidad.

**Criterios de aceptación:**
- Total mensualidades activas y su valor mensual.
- Mensualidades por vencer en los próximos 7/15/30 días.
- Mensualidades vencidas (morosas).
- Tasa de renovación (últimos 3 meses).
- Desglose por tipo de plan y tipo de vehículo.

**Spec:** `specs/features/reports/monthly-portfolio.spec.md`
**UseCase:** `GetMonthlyPortfolioReportUseCase`

---

### HU-051: Reporte de facturación
**Prioridad:** P1 | **Puntos:** 3

**Como** contador,
**quiero** un reporte de facturación del periodo,
**para** hacer la declaración de IVA y la contabilidad.

**Criterios de aceptación:**
- Total facturado, base gravable, IVA, retenciones.
- Desglose por tipo de documento (facturas, notas crédito).
- Cantidad de documentos emitidos.
- Documentos pendientes de transmisión a DIAN.
- Exportable a Excel con formato compatible con el software contable del cliente.

**Spec:** `specs/features/reports/invoicing-report.spec.md`
**UseCase:** `GetInvoicingReportUseCase`

---

### HU-052: Reporte de operarios
**Prioridad:** P1 | **Puntos:** 2

**Como** administrador,
**quiero** ver métricas de desempeño por operario,
**para** evaluar la operación y detectar anomalías.

**Criterios de aceptación:**
- Por operario: vehículos atendidos, total recaudado, cortesías otorgadas, diferencias de caja, turnos trabajados.
- Filtrable por rango de fechas y operario.
- Ranking de operarios por recaudación.

**Spec:** `specs/features/reports/operator-performance.spec.md`
**UseCase:** `GetOperatorPerformanceReportUseCase`

---

### HU-053: Dashboard ejecutivo
**Prioridad:** P1 | **Puntos:** 5

**Como** administrador,
**quiero** ver un dashboard con los indicadores clave del parqueadero,
**para** tener una vista rápida del estado del negocio.

**Criterios de aceptación:**
- KPIs en tarjetas: ingresos hoy, ingresos mes, vehículos hoy, ocupación actual, mensualidades activas, facturas pendientes.
- Gráfico de ingresos de los últimos 7 días.
- Gráfico de ocupación del día.
- Alertas activas: mensualidades por vencer, facturas rechazadas, diferencias de caja.
- Se actualiza en tiempo real cuando hay conexión.

**Spec:** `specs/features/reports/executive-dashboard.spec.md`
**UseCase:** Compuesto de varios UseCases

---

## E10 — Notificaciones

### HU-054: Notificación de factura al cliente por email
**Prioridad:** P1 | **Puntos:** 3

**Como** sistema,
**quiero** enviar la factura electrónica al cliente por email,
**para** cumplir con la obligación de entrega del documento electrónico.

**Criterios de aceptación:**
- Se envía automáticamente después de que la DIAN valida la factura.
- El email incluye: PDF adjunto, XML adjunto, link para consultar en portal DIAN (QR URL).
- Template del email con branding del parqueadero.
- Si el envío falla, reintentar hasta 3 veces.
- Registrar si el email fue enviado exitosamente.

**Spec:** `specs/features/notifications/email-invoice.spec.md`

---

### HU-055: Notificación de vencimiento de mensualidad
**Prioridad:** P1 | **Puntos:** 3

**Como** sistema,
**quiero** notificar al cliente que su mensualidad está por vencer,
**para** que renueve a tiempo y no pierda el servicio.

**Criterios de aceptación:**
- Enviar notificación 7 días, 3 días y 1 día antes del vencimiento.
- Canales: email y WhatsApp (si tiene número registrado).
- El mensaje incluye: plan, placa, fecha de vencimiento, link de pago en línea.
- No enviar si la mensualidad tiene auto-renovación activada (excepto el recordatorio de 1 día como cortesía).

**Spec:** `specs/features/notifications/plan-expiry.spec.md`

---

### HU-056: Notificación de alerta al admin
**Prioridad:** P1 | **Puntos:** 2

**Como** sistema,
**quiero** notificar al admin sobre eventos importantes,
**para** que pueda actuar oportunamente.

**Criterios de aceptación:**
- Eventos que generan alerta: factura rechazada por DIAN, diferencia de caja > $5.000, operario con 3+ cortesías en un turno, modo contingencia activado, rangos de numeración por agotarse, certificado digital por vencer.
- Canal: email al admin.
- Panel de alertas en el dashboard con indicador de no leídas.

**Spec:** `specs/features/notifications/admin-alerts.spec.md`

---

### HU-057: Envío de cierre de caja por email
**Prioridad:** P1 | **Puntos:** 2

**Como** sistema,
**quiero** enviar el resumen del cierre de caja al admin por email,
**para** que tenga control sin estar presente en el parqueadero.

**Criterios de aceptación:**
- Se envía automáticamente al cerrar un turno de caja.
- Incluye: operario, hora apertura/cierre, desglose por método, base, esperado, real, diferencia, observaciones.
- Formato claro y legible en el email.

**Spec:** `specs/features/notifications/shift-close-email.spec.md`

---

## E11 — Offline y Sincronización

### HU-058: Operar sin conexión a internet
**Prioridad:** P0 | **Puntos:** 8

**Como** operario,
**quiero** seguir registrando entradas, salidas y cobros aunque se caiga internet,
**para** que el negocio no se detenga.

**Criterios de aceptación:**
- Las siguientes operaciones funcionan offline: registrar ingreso, registrar salida, calcular tarifa, cobrar en efectivo, ver sesiones activas.
- Los datos se almacenan localmente en IndexedDB.
- Indicador visual de estado de conexión (verde = online, rojo = offline).
- Indicador de operaciones pendientes de sincronización.
- No se puede: emitir factura electrónica, procesar pagos en línea, consultar datos que no estén en cache local.

**Spec:** `specs/infrastructure/offline-sync.spec.md`

---

### HU-059: Sincronizar datos al recuperar conexión
**Prioridad:** P0 | **Puntos:** 5

**Como** sistema,
**quiero** sincronizar automáticamente los datos locales con el servidor cuando regrese la conexión,
**para** que no se pierda información.

**Criterios de aceptación:**
- Al detectar conexión, se inicia sincronización automática.
- Las operaciones pendientes se envían en orden cronológico.
- Si hay conflicto (ej: misma placa registrada desde dos dispositivos), last-write-wins para la mayoría de tablas.
- Las transacciones financieras (pagos, facturas) usan idempotencia por UUID para evitar duplicados.
- Progreso de sincronización visible en la UI.
- Si la sincronización falla parcialmente, reintenta las operaciones fallidas.

**Spec:** `specs/infrastructure/sync-recovery.spec.md`

---

### HU-060: Precarga de datos para offline
**Prioridad:** P0 | **Puntos:** 3

**Como** sistema,
**quiero** descargar al cache local los datos necesarios para operar offline,
**para** que el operario tenga la información disponible si se cae internet.

**Criterios de aceptación:**
- Al iniciar la app (o al abrir turno), se sincronizan: tarifas activas, mensualidades activas, sesiones activas del día, clientes mensualizados.
- Los datos pesados (historial, reportes) NO se precargan — solo bajo demanda y con conexión.
- Si la precarga falla, mostrar advertencia pero permitir operar con datos en cache anterior.
- Indicar "última sincronización: hace X minutos" en la UI.

**Spec:** `specs/infrastructure/data-preload.spec.md`

---

### HU-061: Instalar PWA
**Prioridad:** P0 | **Puntos:** 2

**Como** operario,
**quiero** instalar la app en mi celular o tablet como si fuera una app nativa,
**para** acceder rápidamente sin abrir el navegador.

**Criterios de aceptación:**
- La app muestra el prompt de instalación de PWA en dispositivos compatibles.
- Una vez instalada, se abre en pantalla completa sin barra de navegador.
- Funciona offline después de la primera carga.
- El ícono y nombre del parqueadero aparecen en la pantalla de inicio.
- Se actualiza automáticamente cuando hay nueva versión (service worker).

**Spec:** `specs/infrastructure/pwa-install.spec.md`

---

### HU-062: Manejo de conflictos de sincronización
**Prioridad:** P0 | **Puntos:** 5

**Como** sistema,
**quiero** manejar correctamente los conflictos cuando dos operarios modifican los mismos datos offline,
**para** no perder información ni generar inconsistencias.

**Criterios de aceptación:**
- Estrategia por tabla:
  - `parking_sessions`: last-write-wins + constraint UNIQUE en placa activa (la BD rechaza duplicados).
  - `payments`: idempotencia por UUID — si ya existe un pago con ese UUID, ignorar el duplicado.
  - `cashier_shifts`: solo un turno abierto por operario — el segundo intento falla con error claro.
  - `invoices`: numeración asignada por servidor — nunca conflicto de consecutivos.
- Si un conflicto no se puede resolver automáticamente, marcar el registro y notificar al admin.
- Log de conflictos resueltos disponible para auditoría.

**Spec:** `specs/infrastructure/conflict-resolution.spec.md`

---

## E12 — Auditoría

### HU-063: Registrar acciones sensibles en bitácora
**Prioridad:** P0 | **Puntos:** 3

**Como** sistema,
**quiero** registrar automáticamente todas las acciones sensibles en una bitácora inmutable,
**para** tener trazabilidad completa de la operación.

**Criterios de aceptación:**
- Acciones que se registran: login/logout, apertura/cierre de caja, anulación de sesión, cortesía, cambio de tarifa, cambio de datos de cliente, emisión/anulación de factura, creación/cancelación de mensualidad, cambios de usuario/rol, retiro de efectivo, cambio de configuración.
- Cada registro tiene: timestamp, usuario, acción, entidad afectada, id de la entidad, valores anteriores (JSON), valores nuevos (JSON).
- La tabla audit_log es append-only: no se permite UPDATE ni DELETE (enforced por RLS).
- Solo admin y contador pueden consultar la auditoría.

**Spec:** `specs/features/audit/audit-log.spec.md`

---

### HU-064: Consultar bitácora de auditoría
**Prioridad:** P0 | **Puntos:** 3

**Como** administrador,
**quiero** consultar la bitácora de auditoría,
**para** investigar eventos, errores o irregularidades.

**Criterios de aceptación:**
- Tabla con: fecha/hora, usuario, acción, entidad, resumen del cambio.
- Filtrable por: rango de fechas, usuario, tipo de acción, entidad.
- Detalle expandible mostrando antes/después (diff visual).
- Buscable por texto libre (busca en todos los campos).
- No editable por nadie.

**Spec:** `specs/features/audit/view-audit-log.spec.md`
**UseCase:** `GetAuditLogUseCase`

---

### HU-065: Exportar auditoría
**Prioridad:** P1 | **Puntos:** 2

**Como** administrador,
**quiero** exportar la bitácora de auditoría a Excel/CSV,
**para** compartirla con el contador o archivo.

**Criterios de aceptación:**
- Exporta los registros filtrados (no todos, para evitar archivos enormes).
- Formato CSV o Excel.
- Incluye todos los campos incluyendo before/after JSON.

**Spec:** `specs/features/audit/export-audit.spec.md`
**UseCase:** `ExportAuditLogUseCase`

---

## E13 — Configuración del Sistema

### HU-066: Configurar datos del parqueadero
**Prioridad:** P1 | **Puntos:** 3

**Como** administrador,
**quiero** configurar los datos generales del parqueadero,
**para** que aparezcan en facturas, comprobantes y el sistema.

**Criterios de aceptación:**
- Campos: razón social, NIT + DV, dirección, municipio, departamento, teléfono, email, logo, capacidad total (opcional), horario de operación.
- Estos datos se usan para: emisión de facturas (datos del emisor), representación gráfica del PDF, encabezado de comprobantes.
- Cambios se registran en auditoría.

**Spec:** `specs/features/config/parking-settings.spec.md`

---

### HU-067: Configurar parámetros de facturación
**Prioridad:** P1 | **Puntos:** 3

**Como** administrador,
**quiero** configurar los parámetros de facturación electrónica,
**para** que el sistema emita facturas correctamente.

**Criterios de aceptación:**
- Campos: prefijo de facturación, rango de numeración, resolución DIAN, clave técnica, prefijo de contingencia, rango de contingencia.
- ID y PIN del software registrado ante DIAN.
- Estos datos se usan para el cálculo del CUFE y el envío al WS DIAN.
- Campos sensibles (clave técnica, PIN) se almacenan cifrados.
- Solo admin puede acceder.

**Spec:** `specs/features/config/invoicing-settings.spec.md`

---

### HU-068: Configurar parámetros operativos
**Prioridad:** P1 | **Puntos:** 2

**Como** administrador,
**quiero** configurar parámetros operativos del parqueadero,
**para** personalizar el comportamiento del sistema.

**Criterios de aceptación:**
- Parámetros configurables: tope de efectivo en caja (para alertas), días de gracia de mensualidad vencida (default 3), máximo de cortesías por turno antes de alerta (default 3), email del admin para notificaciones, activar/desactivar métodos de pago.
- Los cambios aplican inmediatamente.
- Se registran en auditoría.

**Spec:** `specs/features/config/operational-settings.spec.md`

---

## Resumen cuantitativo

| Prioridad | Cantidad HUs | Story Points |
|---|---|---|
| P0 (MVP obligatorio) | 38 | ~170 |
| P1 (MVP deseable) | 24 | ~65 |
| P2 (post-MVP) | 1 | ~3 |
| **Total** | **63** | **~238** |

### Velocidad estimada y timeline

Asumiendo un equipo de 2-3 desarrolladores con velocidad de 20-30 story points por sprint (2 semanas):

| Fase | Sprints | Duración |
|---|---|---|
| P0 (MVP obligatorio) | 6-9 sprints | 12-18 semanas |
| P1 (MVP deseable) | 3-4 sprints | 6-8 semanas |
| **MVP completo (P0+P1)** | **9-13 sprints** | **18-26 semanas** |

---

*Historias de usuario v1.0 — 63 HUs organizadas en 13 épicas. Actualizar según retroalimentación del cliente piloto.*
