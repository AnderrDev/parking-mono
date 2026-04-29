---
name: ui-ux-parqueadero
description: UX designer specialized in operator-facing POS-style interfaces for the parqueadero project. Use when designing screens, flows, components, color/spacing/typography systems, microinteractions, error states, empty states, offline states, or operator workflows (entrada, salida, cobro, cierre de caja, mensualidades). Triggers on prompts like "diseña la pantalla X", "UX del operario", "qué color uso para Y", "estado vacío", "feedback de error", "design system", "tokens de diseño", "operator dashboard".
---

# ui-ux-parqueadero — Operator-First UX Design System

This skill encodes the **design philosophy** for `parqueadero-web`. It is *complementary* to the generic `frontend-design` skill — this one is opinionated for the **specific user (operario), specific context (caseta de parqueadero), specific device (tablet 10", a veces sol directo, a veces lluvia, manos sucias)**.

## The User: Operario de Parqueadero

Mental model:
- Está parado, no sentado. La tablet está montada o en la mano.
- Tiene **un cliente esperando**. Cada toque de más es un cliente molesto.
- **No es power user de software.** Asume rotación de personal.
- Conexión intermitente (caseta con WiFi pobre). El sistema debe sentirse igual online u offline.
- Idioma: español Colombia. Sin jerga técnica.

Implicación de diseño: **velocidad > belleza, claridad > densidad, perdón > castigo** (siempre se puede deshacer en los primeros 30s).

## North-Star Principles

1. **Una mano, un toque, un segundo.** El flujo crítico (entrada/salida) debe lograrse con una mano y ≤ 3 toques.
2. **Estado siempre visible.** ¿Hay caja abierta? ¿Estoy online? ¿Cuántas sesiones activas? Visible sin scroll.
3. **Errores prevenibles, no punitivos.** Disable un botón antes que mostrar un error. Si error: explica qué hacer.
4. **Feedback inmediato.** Acción → respuesta visual en < 100ms (skeleton, ripple, toast). Nunca pantalla "muerta".
5. **Reversible por defecto.** Toda operación crítica tiene "Deshacer" 30s (toast con CTA o snackbar).
6. **Datos primero, decoración después.** Sin ilustraciones decorativas en flujo operativo. La UI es una herramienta.

## Design Tokens (canónicos para este proyecto)

Define en `parqueadero-web/src/app/shared/styles/tokens.scss` (cuando exista):

### Color
```scss
:root {
  /* Brand */
  --color-primary:       #0B5CFF;  /* azul confiable, alto contraste */
  --color-primary-fg:    #FFFFFF;
  --color-primary-soft:  #E8F0FF;

  /* Semánticos (acción/estado) */
  --color-success:       #0E8A3E;  /* verde >4.5:1 sobre blanco */
  --color-success-soft:  #E6F5EC;
  --color-warning:       #B45309;  /* ámbar oscuro, no amarillo flojo */
  --color-warning-soft:  #FEF3C7;
  --color-danger:        #B42318;
  --color-danger-soft:   #FEE4E2;
  --color-info:          #0050B3;
  --color-info-soft:     #E6F0FA;

  /* Neutros */
  --color-bg:            #FAFAFA;
  --color-surface:       #FFFFFF;
  --color-surface-2:     #F4F4F5;
  --color-border:        #E4E4E7;
  --color-text:          #0A0A0A;
  --color-text-muted:    #52525B;
  --color-text-disabled: #A1A1AA;

  /* Estados de sesión (badges) */
  --color-status-active:    var(--color-success);
  --color-status-monthly:   #6D28D9;  /* violeta = mensualidad */
  --color-status-completed: var(--color-text-muted);
  --color-status-cancelled: var(--color-danger);
}
```

Nunca uses rojo solo para errores. Acompaña con icono y copy (a11y).

### Spacing (4-pt grid)
```scss
--space-0: 0;
--space-1: 0.25rem;   /* 4 */
--space-2: 0.5rem;    /* 8 */
--space-3: 0.75rem;   /* 12 */
--space-4: 1rem;      /* 16 */
--space-5: 1.5rem;    /* 24 */
--space-6: 2rem;      /* 32 */
--space-7: 3rem;      /* 48 */
--space-8: 4rem;      /* 64 */
```

### Typography
```scss
--font-sans: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;  /* placas, montos */

/* Escala fluida */
--text-xs:  clamp(0.75rem, 0.72rem + 0.15vw, 0.8125rem);
--text-sm:  clamp(0.875rem, 0.84rem + 0.2vw, 0.9375rem);
--text-md:  clamp(1rem, 0.95rem + 0.25vw, 1.0625rem);
--text-lg:  clamp(1.125rem, 1.05rem + 0.4vw, 1.25rem);
--text-xl:  clamp(1.375rem, 1.25rem + 0.6vw, 1.625rem);
--text-2xl: clamp(1.75rem, 1.5rem + 1vw, 2.25rem);    /* placa en dialog de salida */
--text-3xl: clamp(2.25rem, 2rem + 1.5vw, 3rem);       /* monto a cobrar */
```

**Placas y montos en monospace.** Lee mejor (`ABC-123`, `$5.000` alineado).

### Radius / Elevation / Motion
```scss
--radius-sm:  6px;
--radius-md:  10px;
--radius-lg:  16px;
--radius-pill: 999px;

--shadow-1: 0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.08);
--shadow-2: 0 4px 8px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.06);
--shadow-3: 0 16px 24px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.08);

--motion-fast:    120ms;
--motion-base:    200ms;
--motion-slow:    320ms;
--ease-standard:  cubic-bezier(.2, 0, 0, 1);
--ease-emphasized: cubic-bezier(.3, 0, 0, 1);
```

Respeta `prefers-reduced-motion: reduce` → 0ms en todo lo que no sea feedback de cambio de estado.

## Touch & Density

| Contexto | Tamaño mínimo | Padding | Gap entre acciones |
|---|---|---|---|
| Botones operario (entrada/salida) | 64×64 | 24 | 16 |
| Botones secundarios | 48×48 | 16 | 12 |
| Filas de tabla (active sessions) | 56 alto | 12 | — |
| Inputs | 48 alto | 16 | — |
| Iconos tap | 44×44 hit area (icono visual puede ser 24) | — | — |

## Estados — todos diseñados, no solo el feliz

Para **cada componente con datos** define cinco estados:

1. **Loading** — skeleton específico (no spinner genérico). Forma similar al contenido real.
2. **Empty** — qué hacer ahora. CTA primaria. Ej: "No hay sesiones activas. Registra una entrada."
3. **Error** — qué pasó + qué puede hacer. Nunca "Error 500".
4. **Offline** — banner persistente arriba; acciones se permiten y se encolan; aviso "Se sincronizará".
5. **Success** — toast 3s con "Deshacer" cuando aplique.

## Patrones específicos del flujo

### Pantalla de Entrada
- **Input de placa enorme** (text-2xl, monospace, autofocus, autocomplete de placas frecuentes).
- Tipo de vehículo como **chips grandes** (Carro / Moto / Camión), no dropdown.
- Botón "Registrar entrada" — full width, color-primary, 64 alto, sticky bottom en móvil.
- Si placa tiene mensualidad activa: badge violeta "Mensual" antes de tocar el botón. Confirma sin segundo paso.

### Pantalla de Salida y Cobro
- Buscador de placa con resultados en grid de 2 columnas (tarjetas, no lista).
- Selección de sesión → **dialog full-screen** con:
  - Placa enorme (text-3xl mono).
  - Tiempo transcurrido (`2h 35m`).
  - **Monto a cobrar** en text-3xl, color-primary. Si es mensualidad: `$ 0` + texto "Plan mensual vigente".
  - 4 botones de método de pago, grid 2×2 (Efectivo · Tarjeta · Nequi · Otros).
  - Confirmar → toast verde "Salida registrada · Deshacer".

### Tabla de Sesiones Activas
- Una fila por sesión. Columnas: placa (mono) · tipo · entrada (hace X) · acción.
- En móvil, las filas se vuelven cards (un container query, no media query).
- Status badge a la izquierda con color del token correspondiente.
- Tap en fila → dialog de salida (no menú contextual).

### Banner Offline
- Sticky top, fondo `--color-warning-soft`, borde inferior `--color-warning`.
- Texto: `⚠ Sin conexión. Las operaciones se sincronizan automáticamente cuando vuelva.`
- No se cierra. Solo desaparece cuando vuelve la red.
- Pequeño contador opcional: "3 operaciones pendientes de sincronizar".

### Cierre de caja
- Página dedicada, no dialog (es un momento serio).
- Resumen visual (cards): total efectivo · total tarjeta · cortesías · total general.
- Botón "Cerrar caja" requiere **confirmación con monto contado** (input numeric) — si difiere, mostrar diferencia y campo de "Justificación".

## Microinteracciones (sin exagerar)

- **Botón tap**: ripple sutil, escala 0.98 al press, vuelve en `--motion-fast`.
- **Toast**: entra desde abajo (`translateY(16px) → 0`) en `--motion-base`.
- **Dialog**: scale 0.96 → 1 + fade, en `--motion-base`, ease-emphasized.
- **Badge cambio de estado**: cross-fade de color, no salto.
- **Skeleton**: shimmer 1.4s linear infinite (apagar con reduced-motion).
- **Toda animación**: respeta `prefers-reduced-motion: reduce`.

## Copy guidelines (español Colombia)

- **Tuteo profesional**, no "usted" ni "vos". Ej: "Registra una entrada".
- **Acciones en imperativo**: "Cobrar", "Cancelar", "Cerrar caja".
- **Errores en humano**: ❌ "Error: VALIDATION_FAILURE" → ✅ "La placa ABC123 ya tiene una sesión activa. Ciérrala primero."
- **Montos**: `$ 5.000` (separador de miles con punto, COP, sin decimales).
- **Tiempo relativo**: "hace 5 min", "entró a las 14:32".
- Sin emojis en flujos operativos. Sí iconos (Lucide / Material Symbols).

## What NOT to do

- ❌ Modal sobre modal.
- ❌ Toast con CTA crítica (úsalo solo para "Deshacer" y avisos).
- ❌ Color como única señal (rojo + ✕ + texto, no solo rojo).
- ❌ Form de 2 columnas en operario (siempre 1 columna, full width).
- ❌ Dropdown nativo en tablet — usa bottom-sheet o radio chips.
- ❌ Loading bloqueante full-screen para operaciones < 1s (usa optimistic UI).
- ❌ Iconografía mezclada (elige *un* icon set y mantenlo).
- ❌ Negar la operación offline. **Siempre** se puede operar; se sincroniza luego.

## Self-check antes de declarar UI lista

- [ ] Diseñé los 5 estados (loading/empty/error/offline/success).
- [ ] Touch targets ≥ 56px en operator pages.
- [ ] Probé el flujo crítico en 3 toques o menos.
- [ ] Copy en español natural, sin jerga técnica.
- [ ] Funciona offline (probado con DevTools).
- [ ] Tokens de color/spacing/type, sin hex hardcoded.
- [ ] Respetado `prefers-reduced-motion`.
- [ ] Usable con una sola mano en tablet vertical.
