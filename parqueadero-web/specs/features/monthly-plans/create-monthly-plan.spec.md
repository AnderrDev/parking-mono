# Spec: Crear Plan Mensual

## Identificador
`monthly-plans/create-monthly-plan`

## Descripción
UseCase que crea un nuevo plan mensual para una placa. Valida que no haya solapamiento con planes activos existentes para la misma placa.

## Actor
Admin.

## Pre-condiciones
- Usuario autenticado con rol `admin`.
- No existe plan activo o expiring para la misma placa con fechas solapadas.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| vehiclePlate | string | Sí | Formato colombiano; normalizar UPPER |
| customerId | string | Sí | UUID de cliente existente |
| planType | string | Sí | 'basico', 'premium', 'ilimitado' |
| startDate | Date | Sí | ≥ hoy |
| endDate | Date | Sí | > startDate |
| amountCents | number | Sí | entero > 0 |
| autoRenew | boolean | No | default false |
| paymentTokenId | string \| null | No | Token de pasarela de pago para auto-renovación |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<MonthlyPlanEntity>` | Plan creado con status='active' |
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
2. Validar fechas.
3. Verificar que el cliente existe.
4. Verificar solapamiento de fechas con planes activos/expiring de la misma placa.
5. Determinar `status` inicial ('active' o 'expiring' según días restantes).
6. Insertar plan.
7. Registrar en `audit_log`.
8. Retornar `Right(planEntity)`.

## Edge Cases

- `startDate = hoy`, `endDate = mañana`: `status = 'expiring'` (≤5 días).
- Plan vencido de la misma placa: no bloquea (solo activos/expiring solapados bloquean).
- `autoRenew = true` sin `paymentTokenId`: `ValidationFailure`.

## Dependencias
- `MonthlyPlanRepository.create()`
- `MonthlyPlanRepository.getActivePlanByPlate()` (verificar solapamiento)
- `CustomerRepository.findById()`

## Mapping a UI
- **Invocación**: `MonthlyPlansListPage` → "Nuevo plan" → `MonthlyPlanEditDialog`.
- **Formulario**: `MonthlyPlanForms.createPlanForm()`.
- **Feedback**: Toast "Plan mensual creado para placa {plate}".
