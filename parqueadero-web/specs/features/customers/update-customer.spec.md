# Spec: Actualizar Cliente

## Identificador
`customers/update-customer`

## Descripción
UseCase que actualiza los datos de contacto de un cliente. El documento de identidad es inmutable.

## Actor
Admin.

## Pre-condiciones
- Usuario autenticado con rol `admin`.
- Cliente existe y `_deleted = false`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| id | string (UUID) | Sí | Debe existir |
| name | string | No | 2–200 chars |
| email | string \| null | No | Formato válido, único si cambia |
| phone | string \| null | No | Formato colombiano |
| address | string \| null | No | max 200 chars |
| municipio | string \| null | No | max 100 chars |
| departamento | string \| null | No | max 100 chars |
| responsabilidadesFiscales | string[] | No | Códigos DIAN |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<CustomerEntity>` | Cliente actualizado |
| No encontrado | `Left<NotFoundFailure>` | "Cliente no encontrado" |
| Email duplicado | `Left<BusinessRuleFailure>` | "El email ya está en uso" |
| Validación | `Left<ValidationFailure>` | Campo inválido |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. `doc_type` y `doc_number` son **inmutables** — no se incluyen en el update.
2. Solo se actualizan los campos enviados (patch).
3. Si `email` cambia: verificar unicidad excluyendo el propio registro.
4. Cambio en `audit_log`.

## Flujo Principal

1. Buscar cliente por `id`. Si no existe → `NotFoundFailure`.
2. Validar campos recibidos.
3. Si `email` presente y distinto al actual: verificar unicidad.
4. Aplicar patch.
5. Registrar en `audit_log`.
6. Retornar cliente actualizado.

## Edge Cases

- Enviar `email = null` → elimina el email del cliente.
- Enviar solo `phone = "3001234567"` → actualiza solo teléfono.

## Dependencias
- `CustomerRepository.update()`

## Mapping a UI
- **Invocación**: Fila tabla → "Editar" → `CustomerEditDialog` (modo edit).
- **Feedback**: Toast "Cliente actualizado", cierra dialog.
