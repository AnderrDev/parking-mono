# Spec: Actualizar Plan Mensual

## Identificador
`monthly-plans/update-monthly-plan`

## Descripción
UseCase que permite extender la fecha de vencimiento o cambiar la configuración de auto-renovación de un plan mensual activo.

## Actor
Admin.

## Pre-condiciones
- Usuario autenticado con rol `admin`.
- Plan existe, `_deleted = false`, `status IN ('active', 'expiring')`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| id | string (UUID) | Sí | Debe existir |
| endDate | Date \| null | No | > startDate del plan y > hoy |
| autoRenew | boolean | No | — |
| paymentTokenId | string \| null | No | Requerido si autoRenew = true |
| amountCents | number \| null | No | entero > 0, para ajuste de precio |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<MonthlyPlanEntity>` | Plan actualizado, status recalculado |
| No encontrado | `Left<NotFoundFailure>` | "Plan no encontrado" |
| Plan vencido/cancelado | `Left<BusinessRuleFailure>` | "No se puede modificar un plan expirado o cancelado" |
| Fecha inválida | `Left<ValidationFailure>` | "endDate debe ser posterior a la fecha de inicio" |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. Solo se pueden modificar planes con `status IN ('active', 'expiring')`.
2. Si se extiende `endDate`: recalcular `status` (si nuevo `endDate - today > 5 días` → `active`).
3. `autoRenew = true` sin `paymentTokenId` → `ValidationFailure`.
4. No se puede cambiar `vehiclePlate`, `customerId`, ni `startDate`.
5. Cambio en `audit_log`.

## Flujo Principal

1. Buscar plan por `id`. Si no existe → `NotFoundFailure`.
2. Verificar `status IN ('active', 'expiring')`.
3. Validar `endDate` si presente.
4. Si `autoRenew = true`: verificar `paymentTokenId`.
5. Aplicar patch.
6. Recalcular `status` según nueva `endDate`.
7. Registrar en `audit_log`.
8. Retornar plan actualizado.

## Edge Cases

- Plan `expiring` que se extiende a más de 5 días → `status` cambia a `active`.
- Extender plan que ya vence hoy: válido si nueva fecha > hoy.

## Dependencias
- `MonthlyPlanRepository.update()`

## Mapping a UI
- **Invocación**: Fila → "Editar" → `MonthlyPlanEditDialog` (modo edit).
- **Campos editables**: Solo fecha fin, auto-renovar, token, precio.
- **Feedback**: Toast "Plan actualizado".
