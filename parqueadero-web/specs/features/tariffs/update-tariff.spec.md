# Spec: Actualizar Tarifa

## Identificador
`tariffs/update-tariff`

## Descripción
UseCase que actualiza los campos editables de una tarifa existente. Solo admin.

## Actor
Admin.

## Pre-condiciones
- Usuario autenticado con rol `admin`.
- Tarifa con `id` existe y no está eliminada (`_deleted = false`).

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| id | string (UUID) | Sí | Debe existir |
| name | string | No | 3–100 chars |
| valueCents | number | No | entero > 0 |
| graceMinutes | number | No | entero ≥ 0 |
| dailyCapCents | number | No | entero > 0 |
| scheduleJson | object | No | JSONB válido |
| validFrom | Date \| null | No | — |
| validTo | Date \| null | No | si hay validFrom: validTo > validFrom |
| isActive | boolean | No | toggle activación |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<TariffEntity>` | Tarifa actualizada |
| No encontrada | `Left<NotFoundFailure>` | "Tarifa no encontrada" |
| Nombre duplicado | `Left<BusinessRuleFailure>` | "Nombre ya existe para ese tipo de vehículo" |
| Validación | `Left<ValidationFailure>` | Campo inválido |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. `vehicle_type` es **inmutable** — no se puede cambiar después de crear.
2. Solo se actualizan los campos enviados (patch, no reemplazo total).
3. Si se cambia `name`: verificar que `(name, vehicleType)` no colisione con otra tarifa activa.
4. `dailyCapCents` resultante debe seguir siendo > `valueCents`.
5. Cambio queda en `audit_log`.

## Flujo Principal

1. Buscar tarifa por `id`. Si no existe → `NotFoundFailure`.
2. Validar campos enviados.
3. Si se cambia `name`: verificar duplicado.
4. Aplicar patch en BD.
5. Registrar en `audit_log`.
6. Retornar tarifa actualizada.

## Edge Cases

- Enviar solo `isActive = false` → desactiva sin tocar otros campos (alternativa a `deactivate-tariff`).
- Cambiar `valueCents` a > `dailyCapCents` actual → `ValidationFailure`.

## Dependencias
- `TariffRepository.update()`

## Mapping a UI
- **Invocación**: Fila de tabla → "Editar" → `TariffEditDialog` (modo edit).
- **Feedback**: Toast "Tarifa actualizada", cierra dialog, refresca lista.
