# Spec: Exportar Reporte a CSV

## Identificador
`reports/export-csv`

## Descripción
UseCase que solicita la generación de un CSV de pagos o sesiones a través de la Edge Function `report-export`. La función genera el archivo server-side, lo sube a Supabase Storage y retorna una URL firmada de descarga (válida 15 min).

## Actor
Admin, Contador.

## Pre-condiciones
- Usuario autenticado con rol `admin` o `contador`.

## Input (Params)

| Campo | Tipo | Obligatorio | Validaciones |
|---|---|---|---|
| entity | `'payments'` \| `'sessions'` | Sí | — |
| dateFrom | Date | Sí | UTC |
| dateTo | Date | Sí | ≥ dateFrom; máximo 3 meses para CSV |
| operatorId | string \| null | No | Filtro opcional |

## Output (Result)

| Caso | Tipo | Descripción |
|---|---|---|
| Éxito | `Right<{ downloadUrl: string; expiresAt: Date }>` | URL firmada (15 min) |
| Rango > 3 meses | `Left<ValidationFailure>` | "El rango máximo para CSV es 3 meses" |
| Sin acceso | `Left<UnauthorizedFailure>` | Operador intenta exportar |
| Timeout/Error servidor | `Left<ServerFailure>` | Edge Function falló o tardó > 30 s |

## Reglas de Negocio

1. Rango máximo = 3 meses (> 3 meses puede exceder timeout de Edge Function).
2. Columnas CSV para `payments`: `paid_at`, `plate`, `vehicle_type`, `method`, `amount_cop`, `operator`, `shift_id`.
3. Columnas CSV para `sessions`: `entry_at`, `exit_at`, `plate`, `vehicle_type`, `duration_min`, `amount_cop`, `operator`.
4. Encoding: UTF-8 con BOM (compatibilidad Excel Colombia).
5. URL firmada válida 15 minutos; el archivo en Storage se elimina tras 24 h (lifecycle rule).
6. Nombre del archivo: `export-{entity}-{dateFrom}-{dateTo}.csv`.

## Flujo Principal

1. Validar rol y rango de fechas (≤ 3 meses).
2. Llamar Edge Function `report-export` vía HTTP con JWT del usuario.
3. Edge Function: consulta BD, genera CSV, sube a Storage bucket `exports/`, retorna URL firmada.
4. UseCase recibe URL y `expiresAt` → retornar `Right({downloadUrl, expiresAt})`.

## Edge Cases

- Sin datos en el período: CSV con solo headers, descargable.
- Edge Function lenta (> 30 s): `ServerFailure` con mensaje "Exportación tardó demasiado, intenta con un rango menor".
- Segundo export antes de que expire el primero: genera un nuevo archivo (no reutiliza).

## Dependencias
- `ReportRepository.requestCsvExport(params)` → invoca Edge Function via `SupabaseService.functions.invoke('report-export')`

## Mapping a UI
- **Invocación**: `ReportsPage` → botón "Exportar CSV" en cada pestaña.
- **Feedback**: spinner + "Generando CSV…" → al recibir URL, descarga automática vía `<a href download>`.
- **Error**: toast con mensaje del failure.
