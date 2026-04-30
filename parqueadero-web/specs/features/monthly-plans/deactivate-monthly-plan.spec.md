# Spec: Cancelar Plan Mensual

## Identificador
`monthly-plans/deactivate-monthly-plan`

## Descripción
UseCase que cancela un plan mensual activo (status = 'cancelled'). No es hard delete — el historial se conserva.

## Actor
Admin.

## Pre-condiciones
- Usuario autenticado con rol `admin`.
- Plan existe y `_deleted = false`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| id | string (UUID) | Sí | Debe existir |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<void>` | Plan cancelado |
| No encontrado | `Left<NotFoundFailure>` | "Plan no encontrado" |
| Ya cancelado/expirado | `Left<BusinessRuleFailure>` | "El plan ya está cancelado o expirado" |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. Soft cancel: `status = 'cancelled'`, `_deleted = true`. **Nunca** DELETE físico.
2. Solo se puede cancelar planes `active` o `expiring`.
3. Si la placa tiene una sesión activa en curso y tenía `monthly_plan_id = id`: la sesión activa NO se toca (la sesión mantiene su estado). La próxima vez que el operador registre la placa no tendrá plan.
4. Cambio en `audit_log`.

## Flujo Principal

1. Buscar plan por `id`. Si no existe → `NotFoundFailure`.
2. Si `status IN ('expired', 'cancelled')` → `BusinessRuleFailure`.
3. Actualizar `status = 'cancelled'`, `_deleted = true`.
4. Registrar en `audit_log`.
5. Retornar `Right(void)`.

## Edge Cases

- Placa con sesión activa asociada al plan: sesión NO se cancela (la sesión paga según la tarifa normal al salir).
- Plan ya `expired` (venció naturalmente): usar `BusinessRuleFailure` con mensaje claro.

## Dependencias
- `MonthlyPlanRepository.deactivate()`

## Mapping a UI
- **Invocación**: Fila → "Cancelar plan" → `ConfirmDialog` "¿Cancelar el plan de placa {plate}? Las sesiones en curso no se verán afectadas."
- **Feedback**: Toast "Plan mensual cancelado".
