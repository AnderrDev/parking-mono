# Spec: Configuración tributaria (`app_settings.tax_config`)

## Identificador
`backend/tax-config`

## Descripción
Define la **fuente de verdad** del régimen tributario del parqueadero y la fórmula correcta para calcular base gravable e IVA a partir de un total cobrado en caja. Reemplaza los literales `0.19` y `19.00` regados por specs y código.

Esta spec es referenciada por:
- `parqueadero-web/specs/features/invoicing/request-invoice.spec.md` (sección "IVA")
- Specs de reportes contables (a crear: `tax-report.spec.md`, `ica-report.spec.md`)

## Régimen actual del cliente
- **Régimen común — responsable de IVA al 19 %**.
- **Precios al público con IVA incluido** (`tariffs.value_cents` y `monthly_plans.amount_cents` son montos FINALES, no bases gravables). El cajero cobra exactamente `payments.amount_cents`; de ese total se extrae base + IVA al facturar.
- Si en el futuro entra un parqueadero "no responsable de IVA", el flag `iva_responsible=false` baja la tasa a 0 % sin tocar código.

## Estructura de `app_settings.tax_config`

Nueva clave en la tabla `app_settings` (insert idempotente — migration aparte):

```json
{
  "regimen": "comun",
  "iva_responsible": true,
  "iva_rate": 0.19,
  "price_includes_tax": true,
  "ica_municipio": "Bogotá D.C.",
  "ica_actividad_codigo": "36901",
  "ica_tarifa_por_mil": 9.66
}
```

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `regimen` | `'comun' \| 'simple' \| 'no_responsable'` | `'comun'` | Régimen tributario del establecimiento |
| `iva_responsible` | bool | `true` | `false` ⇒ tasa efectiva = 0 % y la factura no discrimina IVA |
| `iva_rate` | number | `0.19` | Tasa de IVA aplicable. Si `iva_responsible=false`, ignorada (se trata como 0) |
| `price_includes_tax` | bool | `true` | Si `true`, los `value_cents`/`amount_cents` ya incluyen IVA. Determina la fórmula de extracción |
| `ica_municipio` | string | `'Bogotá D.C.'` | Municipio donde se ejerce la actividad |
| `ica_actividad_codigo` | string | `'36901'` | Código CIIU/actividad municipal (Bogotá: 36901 servicios de parqueadero) |
| `ica_tarifa_por_mil` | number | `9.66` | Tarifa de ICA en por mil. Usado en `ica-report` (futuro) |

Solo `admin` puede leer/escribir esta clave (RLS de `app_settings` ya lo hace por la política `p_app_settings_write`).

## Fórmula canónica: extraer base + IVA de un total

**Caso 1 — `price_includes_tax = true` y `iva_responsible = true`** (caso del cliente actual):

```
total_cents = payment.amount_cents              // lo cobrado en caja, INCLUYE IVA
base_cents  = Math.round(total_cents / (1 + iva_rate))
iva_cents   = total_cents - base_cents          // residuo, garantiza base + iva = total
```

Ejemplo con tasa 19 % y total $5.000:
- `base = round(5000 / 1.19) = 4202`
- `iva  = 5000 - 4202 = 798`
- Verificación: `4202 + 798 = 5000` ✓

**Caso 2 — `price_includes_tax = false` y `iva_responsible = true`** (no aplica hoy, dejado por compatibilidad futura):

```
base_cents  = payment.amount_cents
iva_cents   = Math.round(base_cents * iva_rate)
total_cents = base_cents + iva_cents
```

**Caso 3 — `iva_responsible = false`**:

```
base_cents  = total_cents = payment.amount_cents
iva_cents   = 0
```

La factura NO discrimina IVA (queda en `tax_cents=0`, `tax_percent=0`).

### Helper a implementar

`parqueadero-backend/supabase/functions/_shared/tax/extract.ts`:

```typescript
export interface TaxConfig {
  regimen: 'comun' | 'simple' | 'no_responsable';
  iva_responsible: boolean;
  iva_rate: number;
  price_includes_tax: boolean;
}

export interface InvoiceAmounts {
  base_cents: number;
  iva_cents: number;
  total_cents: number;
  iva_rate_applied: number;
}

export function extractInvoiceAmounts(
  paymentAmountCents: number,
  config: TaxConfig
): InvoiceAmounts {
  if (!config.iva_responsible) {
    return {
      base_cents: paymentAmountCents,
      iva_cents: 0,
      total_cents: paymentAmountCents,
      iva_rate_applied: 0,
    };
  }
  if (config.price_includes_tax) {
    const total = paymentAmountCents;
    const base = Math.round(total / (1 + config.iva_rate));
    return {
      base_cents: base,
      iva_cents: total - base,
      total_cents: total,
      iva_rate_applied: config.iva_rate,
    };
  }
  const base = paymentAmountCents;
  const iva = Math.round(base * config.iva_rate);
  return {
    base_cents: base,
    iva_cents: iva,
    total_cents: base + iva,
    iva_rate_applied: config.iva_rate,
  };
}
```

Cargar config: `getTaxConfig(supabase)` lee `app_settings WHERE key='tax_config'` y hace fallback a defaults si la fila no existe (defensivo).

## Snapshot histórico en facturas

Cada `invoice_lines` ya almacena `tax_percent` por línea — esto es crítico para que cambios futuros de régimen/tasa NO afecten facturas históricas. **Reglas:**

1. La EF que emite escribe `invoice_lines.tax_percent = iva_rate_applied * 100` (ej: 19.00 si responsable, 0.00 si no).
2. `invoices.tax_cents` se llena con la suma de `invoice_lines.tax_cents` (no recalcular después).
3. Reportes contables deben agregar **desde `invoice_lines`** (que tiene la tasa histórica), no desde `payments` con la tasa actual.

## Migration requerida (a crear, no en esta spec)

`00016_tax_config_settings.sql`:

```sql
INSERT INTO app_settings (key, value, description) VALUES (
  'tax_config',
  '{"regimen":"comun","iva_responsible":true,"iva_rate":0.19,"price_includes_tax":true,"ica_municipio":"Bogotá D.C.","ica_actividad_codigo":"36901","ica_tarifa_por_mil":9.66}'::jsonb,
  'Configuración tributaria del establecimiento (IVA, ICA, régimen). Ver specs/tax-config.spec.md.'
) ON CONFLICT (key) DO NOTHING;
```

Y opcionalmente: `ALTER TABLE invoice_lines ALTER COLUMN tax_percent DROP DEFAULT;` para forzar que la EF escriba siempre la tasa explícita (evita fallback silencioso a 19 cuando el cliente sea no responsable).

## Cambios derivados (a aplicar tras aprobar esta spec)

| Archivo | Cambio |
|---|---|
| `parqueadero-web/specs/features/invoicing/request-invoice.spec.md` §"IVA" | Reemplazar fórmula por la canónica (`total = payment.amount`, `base = round(total/(1+rate))`, `iva = total - base`) |
| `parqueadero-web/specs/features/settings/tax-config.spec.md` (nuevo) | UI admin para editar `tax_config` (Fase 5/Settings) |
| `parqueadero-web/specs/features/reports/tax-report.spec.md` (nuevo) | Reporte IVA bimestral basado en `invoice_lines` |
| `parqueadero-web/specs/features/reports/ica-report.spec.md` (nuevo) | Reporte ingresos brutos por mes para declaración municipal |

## Out of scope (follow-ups)

- Reporte de retenciones sufridas (necesita captura de retenciones aplicadas por el cliente al pagar — no hay flujo aún).
- Régimen Simple: declaraciones bimestrales SIMPLE quedan fuera por ahora; cuando aplique, agregar `simple_grupo` y `simple_tarifa` a `tax_config`.
- Notas crédito (`tipo_documento='91'`): existe la columna pero no hay flujo. Cuando se implemente, debe reusar el mismo `extractInvoiceAmounts` con signo invertido.
