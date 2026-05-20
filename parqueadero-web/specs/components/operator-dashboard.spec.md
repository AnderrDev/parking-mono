# Spec: Operator Dashboard Page

## Tipo
Smart Page (orquesta UseCases de parking + lectura de estado de caja).

## Selector / Ruta
`app-operator-dashboard` · ruta `/parking` (default del feature).

## Propósito
Vista principal que usa el operador durante su turno. Tres responsabilidades:

1. Mostrar el **estado de la caja** (abierta / cerrada) de forma inequívoca.
2. Permitir **registrar entrada** desde un modal (botón primario + atajo + FAB).
3. Mostrar **vehículos en parqueadero** y permitir registrar la salida de cada uno.

Adicional: buscador por placa, comprobante post-salida, tarifas vigentes, métricas en vivo del turno.

## Audiencia objetivo (drives diseño)
Operadores adultos mayores, poca familiaridad con software. Implica:

- Texto base ≥ 16 px, números/placas ≥ 24 px.
- Áreas de toque para acciones primarias ≥ 48 px de alto.
- Copy en español plano.
- Estado del sistema siempre visible.
- Color nunca como único indicador.

## Refactor 2026-05-04 — qué cambia y por qué

El **formulario de entrada inline** (panel izquierdo del layout 2-cols anterior) **se mueve a un modal**. Razón: la entrada pasa a ser una acción discreta (no un panel siempre presente) y la lista de vehículos en parqueadero recupera el ancho completo, lo que mejora la lectura cuando hay muchas sesiones.

Esto **revierte parcialmente** la decisión previa "densidad alta sin flujo lineal" (`feedback_dashboard_density.md`): la consulta y la lista de salidas siguen siendo densas (multi-info por fila), pero el ingreso pasa a flow modal. Se reverte por petición explícita del usuario (2026-05-04) que prefiere botón → modal → ticket impreso.

## Layout post-refactor

```
┌─────────────────────────────────────────────────────────────┐
│ [CINTA DE ESTADO DE CAJA — sticky top]                      │
├─────────────────────────────────────────────────────────────┤
│ Saludo · 3 chips métricas vivo │ [+ Registrar entrada] (CTA)│
├─────────────────────────────────────────────────────────────┤
│ Quick-stats turno (4 chips: entradas · salidas · recaudo · cortesías) │
├─────────────────────────────────────────────────────────────┤
│ Tarifas vigentes (chips Carro/Moto/Bici)                    │
├─────────────────────────────────────────────────────────────┤
│ Buscador por placa (autocomplete, sección inline)           │
├─────────────────────────────────────────────────────────────┤
│ [Comprobante último — auto-dismiss 12 s]                    │
├─────────────────────────────────────────────────────────────┤
│ Vehículos en parqueadero (full-width, búsqueda + filtro)    │
│  [contador grande · agrupable carro/moto · más densidad]    │
└─────────────────────────────────────────────────────────────┘
                           [+ FAB] (mobile, bottom-right)
```

## Estados de la página

### A. Sin sesión / sin usuario autenticado
Redirect del guard a `/auth/login`. No aplica diseño aquí.

### B. Caja CERRADA (no hay turno abierto del usuario)
- Cinta superior **ámbar**: "Caja cerrada · No puedes registrar entradas". CTA "Abrir caja" → `/cashier`.
- **Botón "Registrar entrada" del header**: disabled, tooltip "Abre la caja en /cashier".
- **FAB (mobile)**: oculto.
- **Atajo `N`**: ignorado.
- Resto (buscador, lista de vehículos) sigue legible. Botones "Salida" en cada session-card quedan disabled.

### C. Caja ABIERTA (turno activo del usuario)
- Cinta superior **verde** discreta: "Caja abierta desde HH:MM · Saldo apertura $X".
- Todos los flujos habilitados: botón header, atajo `N`, FAB en mobile, salida por sesión.
- Quick-stats del turno se cargan en paralelo y se refrescan tras cada entrada/salida exitosa.

### D. Cargando estado de caja
Cinta neutra: "Verificando estado de caja…". Botón header disabled. Duración esperada < 500 ms.

### E. Error al consultar estado de caja
Cinta roja con mensaje del `Failure` y botón "Reintentar". Botón header disabled.

## Botón primario "Registrar entrada"

| Aspecto | Detalle |
|---|---|
| Ubicación desktop | Header, lado derecho del título. Botón primario sólido, alto 56 px, ícono `+`. |
| Ubicación mobile (<768 px) | FAB flotante bottom-right, círculo 64 px, icono `+`. |
| Atajo de teclado | `N` (case-insensitive). Ignorado si el foco está en `<input>`/`<textarea>` o el modal ya está abierto. |
| Disabled si | `cashRegisterClosed() === true` o `shiftBannerState() === 'loading'`. |
| Acción | Abre `<app-vehicle-entry-modal>` (CDK Dialog). |
| A11y | `aria-keyshortcuts="N"` en el botón header; tooltip visible para screen readers. |

## Quick-stats del turno (chips nuevos)

Cuatro chips compactos debajo del header (solo visible si caja abierta):

| Chip | Valor | Origen |
|---|---|---|
| Entradas hoy | `count(parking_sessions WHERE entry_user_id=me AND DATE(entry_at)=hoy)` | repo método `getShiftEntryCount` |
| Salidas hoy | `count(parking_sessions WHERE exit_user_id=me AND DATE(exit_at)=hoy AND status='completed')` | repo método `getShiftExitCount` |
| Recaudo turno | `sum(payments.amount_cents)` del `cashier_shift_id` actual, métodos no libres | reusa cálculo existente del cashier |
| Cortesías | `count(payments WHERE method='cortesia' AND cashier_shift_id=actual)` | reusa cálculo |

Refresh: tras `RegisterVehicleEntryUseCase` éxito o `RegisterVehicleExitUseCase` éxito, re-consulta los 4 valores. Si la consulta falla, el chip muestra `—` sin romper la página.

## Cinta de estado de caja

Sin cambios respecto a versión anterior — ver tabla original.

## Comportamiento al cargar

1. `ngOnInit` → `loadShiftStatus()`, `loadSessions()`, `loadTariffs()`, `loadShiftStats()` en paralelo.
2. Mientras shiftStatus no resuelve: cinta "Verificando…" + botón disabled.
3. Al resolver: render del estado correcto.
4. Refresco tras navegar de vuelta de `/cashier`: re-ejecuta en `ngOnInit` (page lazy-loaded).

## NO hace (restricciones explícitas)

- NO crea ni cierra turno (eso vive en `/cashier`).
- NO duplica validación server-side de "turno requerido".
- NO incluye el form de entrada inline en su HTML (vive solo en el modal).
- NO maneja la impresión del ticket de entrada (la maneja el modal — ver `print-entry-ticket.spec.md`).
- NO toca el `vehicle-exit-dialog`.

## Dependencias técnicas

- `ParkingRepository.getShiftEntryCount(shiftId)` — nuevo, retorna number.
- `ParkingRepository.getShiftExitCount(shiftId)` — nuevo.
- `CashierRepository.getShiftRevenue(shiftId)` — ya existe (reusa).
- `CashierRepository.getShiftCourtesyCount(shiftId)` — nuevo o derivado del existente.
- `<app-vehicle-entry-modal>` (nuevo, ver spec dedicada).

## Mejoras UX previas (se mantienen)

| Elemento | Aplicado |
|---|---|
| Tamaño de placa en cards | `--text-lg` (18) bold |
| Tamaño de placa en buscador | `--text-lg` (18) bold, alto 56 px |
| Alto botón "Salida" / "Registrar entrada" | 52-56 px |
| Subtítulos | `--text-md` (16) |
| Comprobante post-salida | auto-dismiss 12 s, pausa en hover |

---
Status: Refactor especificado 2026-05-04 — implementación pendiente.
