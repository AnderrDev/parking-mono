# Spec: Reports Page (Reportes)

## Tipo
Smart Page (orquesta UseCases de reports + invoicing).

## Selector / Ruta
`app-reports-page` · ruta `/reports`.

## Propósito
Vista única para administradores y supervisores que centraliza información
contable y estadística del parqueadero, presentada de forma **entendible para
no-contadores**: presets de período, comparativa contra período anterior,
gráficos visuales simples, etiquetas humanas (no enums crudos), tooltips
explicando cada KPI.

## Audiencia objetivo
- Dueño del parqueadero (no técnico, no contador profesional).
- Operador supervisor que quiere entender el día.
- Admin que necesita auditar.

Implica: cero jerga técnica, comparaciones en lugar de números absolutos
desnudos, gráficos antes que tablas, descargas para llevar a contador externo.

## Estructura de la página

```
┌─────────────────────────────────────────────────────────────┐
│ Reportes                                  [⬇ Descargar CSV] │
├─────────────────────────────────────────────────────────────┤
│ FILTROS (sticky)                                            │
│ Presets: [Hoy] [Semana] [Mes] [Mes pasado] [30 días] [📅]  │
│ Personalizado: Desde [date] Hasta [date] · Agrupar: [▼]    │
│ ☐ Comparar con período anterior                             │
├─────────────────────────────────────────────────────────────┤
│ Tabs: [Resumen contable] [Ingresos] [Vehículos] [Operadores]│
├─────────────────────────────────────────────────────────────┤
│  Contenido del tab activo                                   │
│  - KPIs con delta vs período anterior                       │
│  - Gráficos (CSS bars / stack)                              │
│  - Tabla detallada (siempre disponible al final)            │
└─────────────────────────────────────────────────────────────┘
```

## Filtros

### Presets de rango (botones pill)
- **Hoy**: 00:00 → 23:59 de hoy.
- **Esta semana**: lunes 00:00 → ahora.
- **Este mes**: día 1 00:00 → ahora.
- **Mes pasado**: día 1 → último día del mes anterior.
- **Últimos 30 días**: hoy − 29 días → hoy.
- **Personalizado**: deja editables `dateFrom` / `dateTo`.

Todos en zona horaria Bogotá (UTC-5).

### Toggle "Comparar con período anterior"
Cuando está activo, calcula KPIs sobre el rango actual **y** el rango
inmediatamente anterior (mismo tamaño). Muestra delta porcentual y absoluto.

Ejemplo: rango actual = "Octubre" → período anterior = "Septiembre".
Rango actual = "Últimos 30 días" → anterior = "30 días previos a esos".

### Validaciones
- `dateFrom ≤ dateTo`.
- Rango ≤ 365 días (límite del use case).

## Tabs

### 1. Resumen contable (default; admin only)

KPIs principales con delta:
- **Total cobrado** (suma de `payments.amount_cents` en el período).
- **Total facturado** (suma de `invoices.total_cents` aceptadas DIAN).
- **Ticket promedio** (cobrado / sesiones).
- **Día más fuerte** (label + monto).

Gráficos:
- Stack horizontal "Por método de pago": efectivo / tarjeta / transferencia /
  gratis con % y monto absoluto.
- Estado DIAN (cuando hay facturas en período):
  donut/stack con: aceptadas, pendientes, rechazadas/contingencia.

Si no hay role admin → tab oculto.

### 2. Ingresos

KPIs:
- **Total ingresos** + delta.
- **Sesiones cobradas** + delta.
- **Ticket promedio** + delta.

Gráfico: barras horizontales por período (día/semana/mes según `groupBy`),
ordenadas cronológicamente, valor a la derecha.

Tabla "Detalle por período" expandible al pie.

### 3. Vehículos

KPIs:
- **Total sesiones cerradas**.
- **Tipo dominante** (label + %).
- **Duración promedio global**.

Gráfico: barras por tipo (carro, moto, bicicleta, otro) con % del total y
monto recaudado.

Tabla detallada al pie con: tipo, sesiones, duración promedio, ingresos, %.

### 4. Operadores (admin only)

KPIs:
- **Operador con más turnos**.
- **Operador con más ingresos**.
- **Diferencia caja total acumulada** (con badge ámbar si > $5.000).

Tabla: operador, turnos, horas, sesiones, ingresos, diferencia caja.
Filas con diferencia > $5.000 destacadas.

Si no hay role admin → tab oculto.

## Lenguaje humano (mappings)

### payment.method
| valor crudo | etiqueta UI       |
|-------------|-------------------|
| `cash`      | Efectivo          |
| `card`      | Tarjeta           |
| `transfer`  | Transferencia     |
| `free`      | Gratis (cortesía/mensualidad) |

### vehicleType
| valor crudo  | etiqueta UI |
|--------------|-------------|
| `carro`      | Carro       |
| `moto`       | Moto        |
| `bicicleta`  | Bicicleta   |
| `otro`       | Otro        |

### dianStatus
| valor crudo   | etiqueta UI         |
|---------------|---------------------|
| `accepted`    | Aceptada            |
| `sent`        | Enviada             |
| `pending`     | Pendiente           |
| `rejected`    | Rechazada           |
| `contingency` | Contingencia        |

## Comparativa de período

El tab activo, cuando "Comparar" está ON, recalcula:
1. Rango anterior = mismo tamaño, terminando justo antes de `dateFrom`.
2. Llama a los mismos UseCases con el rango anterior.
3. Muestra delta debajo del KPI: `▲ +12% ($45.000)` o `▼ −5% (−$8.000)`.

Reglas visuales del delta:
- Para métricas "más es mejor" (ingresos, sesiones, ticket): verde si ▲, rojo si ▼.
- Para métricas "menos es mejor" (diferencias caja): invertido.
- Si período anterior = 0: mostrar "Nuevo" en lugar de % infinito.

## KPIs con tooltip

Cada KPI tiene un ícono `?` (o `aria-describedby`) con explicación corta:

- **Total cobrado**: "Suma de todos los pagos confirmados en el período (efectivo, tarjeta y transferencia)."
- **Total facturado**: "Suma del total de las facturas electrónicas emitidas y aceptadas por la DIAN."
- **Ticket promedio**: "Promedio de plata recaudada por sesión cerrada."
- **Día más fuerte**: "Día con mayor recaudo dentro del período."
- **Diferencia caja**: "Suma de faltantes y sobrantes reportados al cerrar turno (en valor absoluto)."

## Empty states

Cuando el rango no devuelve datos:

> 📊 No hay datos para este rango.
> Probá ampliar el período o cambiar de pestaña.
>
> [Botón: Ampliar a últimos 30 días]

## Accesibilidad

- KPIs en `<article>` con `aria-label` que incluye valor + delta legible.
- Gráficos: barras con `role="img"` y `aria-label` descriptivo (label + valor).
- Sección de resultados con `aria-live="polite"` para anunciar al cambiar filtros.
- Tablas con `<caption>` describiendo qué muestran.
- Sticky filter no debe tapar tooltip ni focus visible.
- Tabs implementados con `role="tablist"`, `role="tab"`, `aria-selected`.

## Performance

- Disparar consultas en paralelo (`Promise.all`) por tab activo.
- Tab "contable" suma 2 consultas extra (invoices); ejecutar solo cuando se
  selecciona ese tab por primera vez (lazy por tab).
- Comparativa: cuando se activa el toggle, dispara 1× extra del use case
  actual con el rango anterior; cachear en memoria por (tab, rango).
- Skeleton mientras carga, no spinner bloqueante.

## Exportar CSV

Botón en header: descarga el dataset del **tab activo** + período actual.
- Tab Ingresos / Resumen contable → entity `payments`.
- Tab Vehículos → entity `sessions`.
- Tab Operadores → no expone CSV (futuro).

## Errores

Toast inline para fallos de cada query (no bloqueante). El KPI/gráfico que
falló muestra estado vacío con "Error al cargar" + botón reintentar.
