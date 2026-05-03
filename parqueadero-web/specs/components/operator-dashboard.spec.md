# Spec: Operator Dashboard Page

## Tipo
Smart Page (orquesta UseCases de parking + lectura de estado de caja).

## Selector / Ruta
`app-operator-dashboard` · ruta `/parking` (default del feature).

## Propósito
Vista principal que usa el operador durante su turno. Tres responsabilidades:

1. Mostrar el **estado de la caja** (abierta / cerrada) de forma inequívoca.
2. Permitir **registrar entrada** cuando hay turno abierto.
3. Mostrar **vehículos en parqueadero** y permitir registrar la salida de cada uno.

Adicional: buscador por placa, comprobante post-salida, métricas en vivo.

## Audiencia objetivo (drives diseño)
Operadores adultos mayores, poca familiaridad con software. Implica:

- Texto base ≥ 16 px, números/placas ≥ 24 px (donde caben).
- Áreas de toque para acciones primarias ≥ 48 px de alto.
- Copy en español plano, sin jerga técnica.
- Estado del sistema siempre visible (nada implícito).
- Color nunca como único indicador (siempre + ícono + texto).

## Estados de la página

### A. Sin sesión / sin usuario autenticado
Redirect del guard a `/auth/login`. No aplica diseño aquí.

### B. Caja CERRADA (no hay turno abierto del usuario)
- Cinta superior **ámbar** que dice: "Caja cerrada · No puedes registrar entradas".
  Botón primario "Abrir caja" → navega a `/cashier`.
- Panel "Registrar entrada" visualmente bloqueado (opacidad 0.45, no interactivo).
  Mensaje grande: "Abre la caja para empezar el turno." + botón secundario
  "Ir a la caja".
- El resto (buscador, vehículos en parqueadero) **sí** sigue siendo legible,
  pero sin botones de acción habilitados sobre sesiones (Salida queda disabled).
  Razón: ver y consultar es seguro; modificar no.

### C. Caja ABIERTA (turno activo del usuario)
- Cinta superior **verde** discreta: "Caja abierta desde HH:MM · Saldo apertura $X".
- Todos los flujos habilitados: entrada, salida, búsqueda, comprobante.
- Métricas en vivo activas (en parqueadero, plan mensual, hora local).

### D. Cargando estado de caja
Cinta neutra: "Verificando estado de caja…" (spinner pequeño). Form de entrada
deshabilitado por seguridad hasta resolver. Duración esperada < 500 ms (1 query).

### E. Error al consultar estado de caja
Cinta roja con mensaje del `Failure` y botón "Reintentar". Form de entrada
deshabilitado.

## Componentes en pantalla

```
┌─────────────────────────────────────────────────────────────┐
│ [CINTA DE ESTADO DE CAJA]                                   │
├─────────────────────────────────────────────────────────────┤
│ Saludo · métricas en vivo (3 chips)                         │
├─────────────────────────────────────────────────────────────┤
│ Tarifas vigentes (chips: Carro $X/h · $Y/min, Moto…, Bici…) │
├─────────────────────────────────────────────────────────────┤
│ Buscador por placa (autocomplete, sección inline)           │
├─────────────────────────────────────────────────────────────┤
│ [Comprobante último · auto-dismiss 12 s · hover pausa]      │
├─────────────────────────────────────────────────────────────┤
│ Registrar entrada       │  Vehículos en parqueadero         │
│ (form bloqueado si       │  (lista; botón Salida por item)  │
│  caja cerrada)           │                                  │
└─────────────────────────────────────────────────────────────┘
```

### Panel "Tarifas vigentes"
Carga en paralelo (al `ngOnInit`) las tarifas activas de carro, moto y
bicicleta (`GetActiveTariffUseCase` × 3). Si un tipo no tiene tarifa
configurada, se omite silenciosamente (no se muestra fila vacía).

Cada chip muestra:
- Tipo de vehículo (label).
- Precio/hora destacado (`tariffPerHourCents`).
- Precio/minuto en color secundario (`tariffPerMinuteCents`).

Conversiones según `tariff.unit`:
| unit       | /hora                | /minuto              |
|------------|----------------------|----------------------|
| `minuto`   | `valueCents × 60`    | `valueCents`         |
| `hora`     | `valueCents`         | `valueCents / 60`    |
| `fraccion` | `valueCents × 2`     | `valueCents / 30`    |
| `dia`      | `valueCents / 24`    | `valueCents / 1440`  |

Sirve como referencia visible para el operador (no tiene que ir a
admin a consultar) y para el cliente que pregunta el precio.

**Decisión de diseño:** se mantiene el layout multi-columna denso (todo al
alcance, sin scroll) por preferencia explícita del usuario. Un intento de
rediseño "v2" 1-columna con buscador en overlay (2026-05-02) se revirtió
porque el operador prefiere el modelo dashboard. Ver
`feedback_dashboard_density.md` en memory.

## Cinta de estado de caja — detalle

Componente inline (no se extrae a shared todavía; si reusable, se promueve).

| Estado     | Color de fondo            | Ícono       | Texto                                                | CTA                       |
|------------|---------------------------|-------------|------------------------------------------------------|---------------------------|
| Abierta    | `--color-success-soft`    | check       | "Caja abierta · saldo apertura $X · desde HH:MM"     | (none)                    |
| Cerrada    | `--color-warning-soft`    | alert       | "Caja cerrada — no puedes registrar entradas."       | "Abrir caja" → `/cashier` |
| Cargando   | `--color-bg-subtle`       | spinner     | "Verificando estado de caja…"                        | (none)                    |
| Error      | `--color-danger-soft`     | error       | mensaje del failure                                  | "Reintentar"              |

- A11y: `role="status"` para abierta/cargando, `role="alert"` para cerrada/error.
- Color **no** es el único indicador: siempre lleva ícono + texto.

## Bloqueo del formulario de entrada cuando caja cerrada

- El componente `<app-vehicle-entry-form>` recibe input nuevo `disabled`.
- Cuando `disabled=true`:
  - Inputs y selector de tipo deshabilitados (`pointer-events: none`, opacidad 0.45).
  - Botón submit deshabilitado.
  - Por encima del form se renderiza un overlay con copy:
    "Abre la caja para empezar el turno." + botón secundario "Ir a la caja".
- Razón: la entrada ya fallaría server-side (`BusinessRuleFailure`), pero el
  bloqueo previo elimina el viaje fallido y la frustración.

## Mejoras UX para usuarios mayores (concretas)

| Elemento                              | Original           | Aplicado                           |
|---------------------------------------|--------------------|------------------------------------|
| Tamaño de placa en cards              | `--text-md` (16)   | `--text-lg` (18) bold              |
| Tamaño de placa en buscador (input)   | `--text-md` (16)   | `--text-lg` (18) bold, alto 56 px  |
| Alto botón "Salida" / "Registrar"     | 40 px              | 52 px                              |
| Alto botón "Abrir caja"               | n/a                | 56 px                              |
| Subtítulos de panel                   | `--text-sm` (14)   | `--text-md` (16)                   |
| Etiqueta hora local                   | "Hora local"       | "Hora actual"                      |
| Mensaje vacío parqueadero             | "Parqueadero vacío"| "Aún no hay vehículos. Cuando registres una entrada aparecerá aquí." |
| Saludo                                | "Buen turno, X"    | "Hola, X" (más directo)            |
| Comprobante post-salida               | persistente        | auto-dismiss 12 s, pausa en hover  |
| Tooltip de ícono solo                 | (varía)            | Siempre visible o aria-label       |

Mantener: tipografía actual (Inter), paleta, espaciado base 8 px.

## NO hace (restricciones explícitas)

- NO crea ni cierra turno (eso vive en `/cashier`). Solo lee y enlaza.
- NO duplica la validación server-side de "turno requerido para entrada".
- NO promueve la cinta a `app.component` global todavía.
- NO toca el `vehicle-exit-dialog` (es otro spec).
- NO agrega telemetría / tracking.

## Dependencias técnicas

- `ParkingRepository.getOpenCashierShiftId(userId)` — ya existe.
- Nuevo UseCase delgado: `GetOpenShiftStatusUseCase` →
  `Either<Failure, { isOpen: boolean; shiftId: string | null; openedAt: Date | null; openingBalanceCents: number | null }>`.
  - Para los datos opcionales (`openedAt`, `openingBalance`) habrá que extender
    el método del repo o agregar un segundo método `getOpenShiftSummary(userId)`.
  - **Decisión simple**: agregar `getOpenShiftSummary(userId)` al
    `ParkingRepository` y al datasource remoto. Nombre evita ambigüedad con
    el método existente.
- DI: `GET_OPEN_SHIFT_STATUS_TOKEN` en `injection-tokens.ts`.

## Comportamiento al cargar

1. `ngOnInit` → `loadShiftStatus()` y `loadSessions()` en paralelo.
2. Mientras shiftStatus no resuelve: cinta "Verificando…" + form disabled.
3. Al resolver: render del estado correcto.
4. Refresco: tras navegar de vuelta de `/cashier`, recargar shiftStatus.
   Implementación simple: re-ejecutar en `ngOnInit` (ya pasa al re-montar la
   page por estar lazy-loaded). Si el usuario cierra/abre la caja sin salir
   de `/parking` (no es flujo soportado hoy), no hay refresh automático;
   se documenta como limitación aceptada.

---
Status: Implementado (2026-05-02) — ver `sessions/2026-05-02-operator-dashboard-ux.md`
