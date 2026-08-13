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
| endDate | Date | Sí | > startDate. Derivada: `startDate + días de la duración` |
| amountCents | number | Sí | entero > 0; múltiplo de $50 (validador en form) |
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

## Duraciones vendibles (desde 2026-08-11)

El plan se vende en dos duraciones, elegidas con un selector en el diálogo:

| Duración | Días cubiertos | Tarifa que le pone precio |
|---|---|---|
| Quincena | 15 | `tariffs.unit = 'quincena'` |
| Mensualidad | 30 | `tariffs.unit = 'mensualidad'` |

La duración **no se persiste** en `monthly_plans`: la expresan `start_date`
y `end_date`, así que la tabla no cambió. El selector solo decide la fecha
de vencimiento y qué tarifa se consulta para autocompletar el valor.

**`end_date = start_date + días − 1`** (corregido el 2026-08-12). Como
`end_date` es inclusivo y cuenta completo, sumar los días pelados vendía uno
de más: 30 días desde el 12-ago vencían el 11-sep y cubrían 31. La
discrepancia era invisible hasta que el comprobante impreso empezó a
imprimir la vigencia en días al lado de la etiqueta "30 días" del
formulario. Ahora: vendida el 12-ago, vence el 10-sep, 30 días exactos.

Si el tipo de vehículo elegido no tiene tarifa configurada para esa
duración, el valor queda editable y quien vende lo digita.

## Reglas de Negocio

1. No puede haber dos planes con `status IN ('active','expiring')` para la
   misma placa cuyas fechas se solapen. **Lo garantiza la BD**, no el cliente:
   constraint `monthly_plans_no_overlap` (EXCLUDE con `daterange`, ambos
   extremos inclusivos, migration 00040). El chequeo previo del use case
   (`hasActivePlanForPlate`) queda solo para dar un mensaje claro antes de ir
   al servidor; entre ese SELECT y el INSERT cabe otra venta de la misma placa.
   Renovar por anticipado con fechas consecutivas (p. ej. día 31 al 60 sobre
   un plan que va del 1 al 30) SÍ está permitido: no hay solapamiento.
   El chequeo previo pregunta por SOLAPAMIENTO con las fechas pedidas
   (`hasActivePlanForPlate(plate, { start, end })`); preguntar solo "¿tiene
   plan vigente hoy?" rechazaba renovaciones consecutivas y retrodataciones
   que la BD sí acepta.
2. `startDate` **puede ser anterior a hoy** (desde 2026-08-12). Se retrodata
   para registrar mensualidades que el cliente ya venía usando o que se
   cobran días después de empezadas. Lo que NO se acepta es vender un plan
   ya vencido: `endDate` ≥ hoy, porque no cubriría ninguna entrada. La misma
   regla la aplica la RPC (`plan_already_expired`); el use case solo adelanta
   el mensaje. El corte de "hoy" es el día civil de Bogotá
   (`todayDateOnlyBogota()`), no la medianoche de la máquina.
3. `endDate > startDate`.
4. Si `endDate - today ≤ 5 días`: el plan inicia con `status = 'expiring'`
   directamente. La cuenta es por DÍA CALENDARIO de Colombia, no por instante.
8. Las columnas `start_date` / `end_date` son DATE: días de calendario con
   ambos extremos inclusivos. Un plan que vence hoy está vigente TODO el día
   de hoy. Nunca convertirlas con `new Date(iso)` ni `toISOString()`, que
   pasan por UTC y corren la fecha un día; usar `parseIsoDateOnly` y
   `formatIsoDateOnly` de `shared/utils/date.utils`.
9. El paso de `active`/`expiring` a `expired` lo hace
   `refresh_monthly_plan_statuses()`, que corre por pg_cron todos los días a
   las 00:10 hora Colombia. Ningún código de cliente escribe `expired`.
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

**Atomicidad (desde 2026-08-11):** los pasos 5 a 8 los ejecuta la RPC
`create_monthly_plan_with_payment` (migration 00040) en una sola transacción
del servidor. O quedan el plan y su ingreso, o no queda ninguno de los dos.

El use case ya NO inserta el payment por separado. La versión anterior
insertaba el plan primero y, si el pago fallaba, se tragaba el error con un
`console.warn` y reportaba éxito: la mensualidad quedaba vendida, la plata
nunca entraba a caja y la UI cantaba "ingreso registrado". Por eso el
repositorio expone `createWithPayment(params, shiftId)` y no existe una
variante que solo cree el plan.

El `payments` insertado lleva `gateway_ref = 'monthly_plan:<id>'`, que es el
único vínculo entre el ingreso y el plan (`payments` no tiene FK a
`monthly_plans`).

**Idempotencia:** el cliente manda un `client_op_id` por venta. Si la misma
operación se reintenta, la RPC devuelve lo ya creado en vez de cobrar dos
veces.

**Errores de la RPC** (llegan como texto y el datasource los traduce a
Failures): `plan_overlap`, `shift_not_open`, `plan_already_expired`,
`invalid_date_range`, `invalid_plan_type`, `invalid_amount`.

**Vínculo plan ↔ payment:** `payments` no tiene `monthly_plan_id`. El
vínculo es `gateway_ref = 'monthly_plan:<id>'`, que escribe la RPC y del que
dependen la anulación y la cancelación (00044).

<!-- Facturación electrónica descartada del alcance el 2026-05-20. -->


**Tarifa por tipo de vehículo y duración:**
El monto se auto-rellena desde `tariffs` filtrando por `vehicle_type` y por
la `unit` de la duración elegida (`mensualidad` o `quincena`). Lo encapsula
`GetActivePlanTariffUseCase`. Si no hay tarifa configurada para esa
combinación, el campo queda editable y se muestra la sugerencia "Escribe el
valor que vas a cobrar por el mes".

## Edge Cases

- `startDate = hoy`, `endDate = mañana`: `status = 'expiring'` (≤5 días).
- Plan vencido de la misma placa: no bloquea (solo activos/expiring solapados bloquean).

## Dependencias
- `MonthlyPlanRepository.createWithPayment()`
- `MonthlyPlanRepository.hasActivePlanForPlate()` (verificar solapamiento)
- `CustomerRepository.findById()`
- `CashierRepository.findOpenByUser()` (resolver `cashier_shift_id`)
- `PaymentRepository.create()` (registrar ingreso de mensualidad)

## Mapping a UI
- **Invocación**: `MonthlyPlansListPage` → "Nuevo plan" → `MonthlyPlanEditDialog`.
- **Formulario**: `MonthlyPlanForms.createPlanForm()`.
- **Feedback**: Toast "Plan mensual creado para placa {plate}".
- **Comprobante impreso**: tras el `Right`, la página dispara el ticket
  térmico de la venta — ver
  `specs/features/monthly-plans/print-monthly-plan-receipt.spec.md`. No
  bloquea ni revierte la venta si la impresión falla.

## Renovación automática — retirada (2026-08-11)

Se quitó del producto. La casilla existía en el formulario pero **nada la
implementaba**: la edge function `renew-monthly` nunca estuvo desplegada, no
había cron que la disparara, buscaba un `status='expired'` que en ese momento
nadie escribía y, aunque hubiera corrido, habría creado el plan sin registrar
el ingreso en caja. Se eliminaron la casilla, el campo de token, los params
`autoRenew` / `paymentTokenId` y la función.

Las columnas `monthly_plans.auto_renew` y `payment_token_id` se conservan en
la BD (default `false` / `NULL`) para no romper datos existentes.
