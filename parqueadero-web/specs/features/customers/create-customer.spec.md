# Spec: Crear Cliente

## Identificador
`customers/create-customer`

## Descripción
UseCase que registra un nuevo cliente. El cliente puede luego asociarse a vehículos y planes mensuales.

## Actor
Admin.

## Pre-condiciones
- Usuario autenticado con rol `admin`.
- No existe cliente activo con mismo `(doc_type, doc_number)`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| docType | 'cedula'\|'nit'\|'pasaporte' | Sí | Enum |
| docNumber | string | Sí | 5–20 chars, solo dígitos (y letra X para NIT) |
| dv | number \| null | No | 0–9, requerido si docType = 'nit' |
| name | string | Sí | 2–200 chars |
| email | string \| null | No | Formato email válido, único si presente |
| phone | string \| null | No | Formato colombiano: 10 dígitos o +57... |
| address | string \| null | No | max 200 chars |
| municipio | string \| null | No | max 100 chars |
| departamento | string \| null | No | max 100 chars |
| responsabilidadesFiscales | string[] | No | Códigos tributarios (legado); default `['R-99-PN']` |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<CustomerEntity>` | Cliente creado |
| Documento duplicado | `Left<BusinessRuleFailure>` | "Ya existe un cliente con ese documento" |
| Email duplicado | `Left<BusinessRuleFailure>` | "El email ya está registrado" |
| Validación | `Left<ValidationFailure>` | Campo inválido |
| Error servidor | `Left<ServerFailure>` | — |

## Reglas de Negocio

1. `(doc_type, doc_number)` es UNIQUE — constraint en BD más validación en UseCase.
2. `email` es UNIQUE si presente.
3. Para docType = 'nit': `dv` es obligatorio.
4. `responsabilidadesFiscales` quedó como campo legado (FE descartada 2026-05-20); default `['R-99-PN']`.
5. Cambio en `audit_log`.

## Flujo Principal

1. Validar campos (formato doc, email, teléfono).
2. Verificar duplicado de documento.
3. Si email presente: verificar unicidad.
4. Insertar cliente.
5. Registrar en `audit_log`.
6. Retornar `Right(customerEntity)`.

## Edge Cases

- `docType = 'nit'` sin `dv` → `ValidationFailure`.
- `phone = null` → permitido.
- `responsabilidadesFiscales = []` → guardar vacío (válido).

## Dependencias
- `CustomerRepository.create()`

## Mapping a UI
- **Invocación**: `CustomersListPage` → "Nuevo cliente" → `CustomerEditDialog`.
- **Formulario**: `CustomerForms.createCustomerForm()`.
- **Feedback**: Toast "Cliente creado exitosamente".
