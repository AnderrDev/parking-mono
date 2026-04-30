# Spec: Desactivar Tarifa

## Identificador
`tariffs/deactivate-tariff`

## Descripción
UseCase que desactiva (soft delete) una tarifa. La tarifa queda en BD con `is_active = false` y `_deleted = true`, visible en históricos pero no usable en nuevas entradas.

## Actor
Admin.

## Pre-condiciones
- Usuario autenticado con rol `admin`.
- Tarifa existe y `_deleted = false`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| id | string (UUID) | Sí | Debe existir |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<void>` | Tarifa desactivada |
| No encontrada | `Left<NotFoundFailure>` | "Tarifa no encontrada" |
| Ya eliminada | `Left<BusinessRuleFailure>` | "La tarifa ya está desactivada" |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. Soft delete: `is_active = false`, `_deleted = true`. **Nunca** `DELETE` físico.
2. Sesiones activas que referencian la tarifa **no se tocan** — la sesión mantiene la FK al snapshot histórico.
3. El cambio queda en `audit_log`.

## Flujo Principal

1. Buscar tarifa por `id`. Si no existe → `NotFoundFailure`.
2. Si ya tiene `_deleted = true` → `BusinessRuleFailure`.
3. Actualizar `is_active = false`, `_deleted = true`.
4. Registrar en `audit_log`.
5. Retornar `Right(void)`.

## Edge Cases

- Tarifa con sesiones activas en curso: se permite desactivar (la tarifa queda en FK de esas sesiones).
- Reactivar una tarifa desactivada: fuera de scope (usar `update-tariff` con `isActive = true` limpiando `_deleted`).

## Dependencias
- `TariffRepository.deactivate()`

## Mapping a UI
- **Invocación**: Fila → "Desactivar" → `ConfirmDialog` "¿Desactivar tarifa X? Las sesiones en curso no se verán afectadas." → confirmar.
- **Feedback**: Toast "Tarifa desactivada", fila desaparece de la lista activa.
