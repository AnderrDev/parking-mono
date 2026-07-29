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
│ Reportes                                                     │
├─────────────────────────────────────────────────────────────┤
│ FILTROS (sticky)                                             │
│ Presets: [Hoy] [Semana] [Mes] [Mes pasado] [30 días] [📅]   │
│ Personalizado: Desde [date] Hasta [date] · Agrupar: [▼]     │
│ ☐ Comparar con período anterior                              │
├─────────────────────────────────────────────────────────────┤
│ Tabs: [Contable][Ingresos][Vehículos][Operadores][Caja]     │
├─────────────────────────────────────────────────────────────┤
│  Contenido del tab activo                                    │
│  - KPIs con delta vs período anterior                        │
│  - Gráficos (CSS bars / stack)                               │
│  - Tabla detallada (siempre disponible al final)             │
└─────────────────────────────────────────────────────────────┘
```

> **Nota (2026-07-29)**: se quitó el botón "Descargar CSV" del header (ver
> sección "Exportar CSV" más abajo) y se reemplazaron los emoji usados como
> iconos de tabs/hints/deltas por el paquete `lucide-angular` (ya era
> dependencia del proyecto, sin uso previo) — ver sección "Iconografía".

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

### 1. Resumen contable (default)

KPIs principales con delta:
- **Total cobrado** (suma de `payments.amount_cents` en el período).
- **Ticket promedio** (cobrado / sesiones).
- **Día más fuerte** (label + monto).

Gráficos:
- Stack horizontal "Por método de pago": efectivo / tarjeta / transferencia /
  gratis con % y monto absoluto.
<!-- Sección "Estado DIAN" eliminada el 2026-05-20: facturación electrónica descartada del alcance. -->

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

**Entradas por hora del día** (agregado 2026-07-29): histograma de 24 barras
(hora `00:00`..`23:00`, zona Bogotá) con el conteo de entradas de todo el rango
seleccionado — identifica horas pico. Fuente: `SessionsByTypeResult.byHour`
(ver `specs/features/reports/sessions-by-type.spec.md`), derivado 100% en el
UseCase a partir de `entry_at`, sin consulta adicional al backend.

### 4. Operadores

KPIs:
- **Operador con más turnos**.
- **Operador con más ingresos**.
- **Diferencia caja total acumulada** (con badge ámbar si > $5.000).

Tabla: operador, turnos, horas, sesiones, ingresos, diferencia caja.
Filas con diferencia > $5.000 destacadas.

### 5. Cierres de caja (agregado 2026-07-29)

Reutiliza `ListShiftsUseCase` de la feature `cashier` (mismo patrón de reuso
cross-feature que ya usa `dashboard.routes.ts` con los UseCases de `reports`)
filtrado por el mismo rango de fechas de la pantalla — sin paginación propia
(cap de 100 turnos; para historial completo con filtros y paginación, link a
`/cashier/history`).

KPIs:
- **Turnos cerrados** en el período.
- **Diferencia de caja total** (suma de valores absolutos).
- **Turnos con diferencia > $5.000** (con badge ámbar si > 0).

Tabla: operador, apertura, cierre, duración, base apertura, base cierre,
diferencia.
- **Apertura/cierre**: fecha (`EEE dd/MM`, chica y muted) sobre hora (`HH:mm`,
  grande y en negrita) en dos líneas — no un solo string `dd/MM/yy HH:mm`
  plano. Feedback de usuario (2026-07-29): con todo en una línea era difícil
  de leer y turnos consecutivos (mismo día, un cierre y la apertura siguiente
  casi al mismo minuto — regla de caja global) se confundían con cajas
  simultáneas. Separar fecha/hora + agregar duración explícita resuelve la
  ambigüedad sin tener que restar mentalmente dos timestamps.
- **Duración**: `formatDuration(durationMinutes(openedAt, closedAt))` —
  mismos helpers de `shared/utils/date.utils.ts` usados en el resto de la app.

Filas con diferencia > $5.000 destacadas (mismo umbral y estilo `.row--alert`
que el tab "Operadores"). Pie de página con link "Ver historial completo de
caja →" hacia `/cashier/history` — **visible solo para admin/contador**
(`canViewFullShiftHistory`), porque esa ruta tiene
`requireRole('admin', 'contador')` en `cashier.routes.ts` (restricción
preexistente, no forma parte de la apertura de Reportes a los 3 roles). Un
operador ve la tabla resumida de esta pestaña pero no el link, para no llevarlo
a una ruta que el guard le va a rechazar.

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

> Nota: no hay mapping de `dianStatus` — facturación electrónica DIAN está
> fuera de alcance (descartada 2026-05-20, ver `CLAUDE.md` raíz del monorepo).

## Comparativa de período

El tab activo, cuando "Comparar" está ON, recalcula:
1. Rango anterior = mismo tamaño, terminando justo antes de `dateFrom`.
2. Llama a los mismos UseCases con el rango anterior.
3. Muestra delta debajo del KPI con icono `TrendingUp`/`TrendingDown` (Lucide)
   + `+12% ($45.000)` o `−5% (−$8.000)`.

Reglas visuales del delta:
- Para métricas "más es mejor" (ingresos, sesiones, ticket): verde si sube, rojo si baja.
- Para métricas "menos es mejor" (diferencias caja): invertido.
- Si período anterior = 0: mostrar "Nuevo" en lugar de % infinito.

## KPIs con tooltip

Cada KPI tiene un botón `<button aria-label="...">` con icono `CircleHelp`
(Lucide) — antes era un `<span title="...">` no accesible por teclado; ahora
es un elemento enfocable con nombre accesible real, con `title` como fallback
de hover:

- **Total cobrado**: "Suma de todos los pagos confirmados en el período (efectivo, tarjeta y transferencia)."
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

- `loadReport()` dispara ingresos + vehículos + cierres de caja en paralelo
  (`Promise.all`) en cada carga — el tab "contable" reutiliza los datos de
  ingresos/vehículos ya cargados, no dispara consultas propias.
- Operadores se carga siempre (no lazy por tab) porque sus KPIs alimentan el
  tab "Operadores" sin bloquear el resto.
- Comparativa: cuando se activa el toggle, dispara 1× extra de ingresos y
  vehículos con el rango anterior.
- Skeleton mientras carga, no spinner bloqueante.

## Exportar CSV

Ver `specs/features/reports/export-csv.spec.md` — el botón se quitó de esta
página (2026-07-29); el UseCase y la Edge Function siguen existiendo.

## Iconografía

Paquete `lucide-angular` (`LucideAngularModule.pick({...})` vía
`importProvidersFrom` en los `providers` del componente, `LucideAngularModule`
en `imports` para declarar `<lucide-angular>`). Sin emojis como iconos
estructurales en ningún punto de la página:

| Elemento | Icono |
|---|---|
| Tab Resumen contable | `ClipboardList` |
| Tab Ingresos | `CircleDollarSign` |
| Tab Vehículos | `Car` |
| Tab Operadores | `Users` |
| Tab Cierres de caja | `History` (mismo icono que el link del sidebar a `/cashier/history`) |
| Hint de KPI (antes "?") | `CircleHelp` |
| Delta positivo/negativo (antes ▲/▼) | `TrendingUp` / `TrendingDown` |
| Alerta de diferencia de caja (antes ⚠️) | `TriangleAlert` |
| Card "Entradas por hora del día" | `Clock` |

## Errores

Toast inline para fallos de cada query (no bloqueante). El KPI/gráfico que
falló muestra estado vacío con "Error al cargar" + botón reintentar.
