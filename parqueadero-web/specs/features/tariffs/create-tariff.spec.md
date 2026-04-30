# Spec: Crear Tarifa

## Identificador
`tariffs/create-tariff`

## Descripción
UseCase que crea una nueva tarifa en el sistema. Solo admin puede crear tarifas.

## Actor
Admin.

## Pre-condiciones
- Usuario autenticado con rol `admin`.
- No existe otra tarifa activa con el mismo `name` y `vehicle_type`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| name | string | Sí | 3–100 chars, no vacío |
| vehicleType | VehicleType | Sí | carro, moto, bicicleta, otro |
| unit | TariffUnit | Sí | minuto, hora, fraccion, dia |
| valueCents | number | Sí | entero > 0 |
| graceMinutes | number | Sí | entero ≥ 0, default 0 |
| dailyCapCents | number | Sí | entero > 0, > valueCents |
| scheduleJson | object | No | JSONB; si omite, `{"todos": "00:00-23:59"}` |
| validFrom | Date \| null | No | fecha o null |
| validTo | Date \| null | No | fecha o null, si hay validFrom: validTo > validFrom |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<TariffEntity>` | Tarifa creada con id generado |
| Nombre + tipo duplicado | `Left<BusinessRuleFailure>` | "Ya existe una tarifa activa con ese nombre para ese tipo de vehículo" |
| Validación falla | `Left<ValidationFailure>` | Mensaje específico del campo |
| Error servidor | `Left<ServerFailure>` | Error de BD |

## Reglas de Negocio

1. `dailyCapCents` debe ser mayor que `valueCents` (tope mayor que una unidad).
2. Si `validFrom` y `validTo` presentes: `validTo > validFrom`.
3. No puede haber dos tarifas activas con mismo `(name, vehicle_type)`.
4. Nueva tarifa inicia con `is_active = true`, `_deleted = false`.
5. El cambio queda registrado en `audit_log`.

## Flujo Principal

1. Validar campos (nombre, rango de fechas, tope > valor).
2. Verificar duplicado `(name, vehicleType)` en tarifas activas.
3. Insertar en BD con `id = gen_random_uuid()`.
4. Registrar en `audit_log`.
5. Retornar `Right(tariffEntity)`.

## Edge Cases

- `graceMinutes = 0`: válido (sin gracia).
- `scheduleJson` con horarios restringidos → se guarda tal cual, validación de formato básica.
- `valueCents = 1` (mínimo): válido.

## Dependencias
- `TariffRepository.create()`

## Mapping a UI
- **Invocación**: `TariffsListPage` → botón "Nueva tarifa" → `TariffEditDialog` (modo create).
- **Formulario**: `TariffForms.createTariffForm()`.
- **Feedback**: Toast "Tarifa creada exitosamente", cierra dialog.
