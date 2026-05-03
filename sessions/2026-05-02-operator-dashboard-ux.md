# Sesión: Operator dashboard — indicador de caja + pulido UX (usuarios mayores)

**Fecha:** 2026-05-02
**Subproyecto(s):** parqueadero-web
**Estado:** completada

## Objetivos
- [x] Crear `parqueadero-web/specs/components/operator-dashboard.spec.md` (no existía).
- [x] Indicador visible de estado de caja (abierta / cerrada) en la página `/parking`.
- [x] Bloqueo del formulario de entrada cuando no hay turno abierto + CTA directo a `/cashier`.
- [x] Mejoras UX para operadores mayores: tipografía más grande en placa/CTA, áreas de toque ≥ 48 px, copy en lenguaje plano, jerarquía visual más fuerte.
- [x] `tsc --noEmit` limpio (no se corren tests — política del proyecto).

## Avance

### Spec
- `parqueadero-web/specs/components/operator-dashboard.spec.md` (nuevo).

### Domain layer
- `parking.repository.ts` — agregado `getOpenShiftSummary(userId)` + tipo
  `OpenShiftSummary { shiftId, openedAt, openingBalanceCents }`.
- `parking.datasource.ts` (abstract) — método correspondiente.
- `parking-remote.datasource.ts` — query a `cashier_shifts` (id + opened_at +
  opening_balance_cents) con los mismos filtros que `getOpenCashierShiftId`.
- `parking.repository.impl.ts` — passthrough.
- `get-open-shift-status.usecase.ts` (nuevo) — envuelve y normaliza a
  `{ isOpen, shiftId, openedAt, openingBalanceCents }`.
- `injection-tokens.ts` — `GET_OPEN_SHIFT_STATUS_TOKEN`.
- `parking.routes.ts` — registra el provider.
- 6 specs `.spec.ts` actualizadas: cada `MockParkingRepository` agrega
  `getOpenShiftSummary()` para satisfacer la clase abstracta.

### Presentation layer
- `vehicle-entry-form.component.ts` — input `disabled = input(false)`. `effect`
  habilita/deshabilita el FormGroup; `onSubmit` corta si `disabled()` es true.
- `operator-dashboard.page.ts` — inyecta `GetOpenShiftStatusUseCase`. Signals
  `shiftStatusLoading`, `shiftStatus`, `shiftStatusError`. Computed
  `cashRegisterClosed` y `entryDisabled`. `loadShiftStatus()` corre en paralelo
  con `loadSessions()` en `ngOnInit`.
- `operator-dashboard.page.html` — cinta de estado de caja arriba (4 estados:
  cargando, abierta, cerrada, error). Overlay sobre el form de entrada cuando
  caja cerrada con copy "Abre la caja para empezar" + CTA a `/cashier`. Botón
  "Salida" se deshabilita en cards. Empty state reescrito a lenguaje plano.
  Saludo "Buen turno" → "Hola". "Hora local" → "Hora actual".
- `operator-dashboard.page.scss` — estilos de la cinta (4 variantes), overlay
  sobre el form, modificador `.panel--locked` (borde izquierdo ámbar). Pulido
  UX: placa del buscador 16 → 18 px bold, alto 44 → 56 px; placa de cards 16 →
  18 px; meta de session-card 12 → 14 px; subtítulos panel 14 → 16 px;
  botón Salida 40 → 52 px de alto + estados `:disabled`.

## Decisiones
- La regla de negocio "no hay caja → no hay entrada" YA existe server-side
  (`RegisterVehicleEntryUseCase` línea 64). Esta sesión solo agrega la
  retroalimentación visual previa, sin duplicar la regla.
- Reusar `ParkingRepository` (ya tenía `getOpenCashierShiftId`) en vez de
  cruzar dependencias con el feature `cashier`. Nuevo método
  `getOpenShiftSummary` para traer también `opened_at` y `opening_balance_cents`
  (necesarios para la cinta verde).
- Fuente de tamaños: ui-ux-pro-max §6 (`readable-font-size` ≥ 16 px) +
  §2 (`touch-target-size` 44–48 px). Para personas mayores subimos un nivel:
  placa input 16 → 18 px, alto 44 → 56 px; CTA "Salida" 40 → 52 px.
- El indicador de caja NO se mete en el header/`<app-layout>` global todavía;
  vive en el dashboard como una "cinta de estado" arriba del saludo. Si más
  adelante se quiere global, se promueve sin riesgo.
- Color **nunca** es el único indicador en la cinta: ícono + texto + fondo.
- Cuando la caja está cerrada, los botones Salida también se deshabilitan
  (no se duplica la lógica server-side; UX consistente: si no se puede cobrar,
  no se ofrece la acción).
- `entry-overlay` con `backdrop-filter: blur(2px)` + borde dashed para que la
  intención de "no se puede usar" sea inequívoca pero el form siga visible.

## Bloqueos / Pendientes
- Si el operador abre la caja desde otra pestaña sin recargar `/parking`, la
  cinta no se actualiza sola. Aceptado: documentado como limitación en el
  spec. Si se vuelve molesto, agregar realtime sub a `cashier_shifts`.
- No se promovió la cinta a `app.component`. Si se quisiera global, hay que
  resolver DI: el use case actual depende de providers de `parking.routes`.

## Next Steps
- (Opcional) Realtime de `cashier_shifts` para refresco instantáneo cuando el
  operador abre/cierra desde otra pestaña.
- (Opcional) Promover cinta de caja a layout global cuando varias rutas la
  necesiten (no es el caso hoy).
- Rediseño UX del `vehicle-exit-dialog` y de `/cashier` (pendiente, próxima
  sesión).

---

## Adenda — Bug fix: "Recaudado" no contabilizaba pagos en efectivo

**Síntoma:** tras registrar una salida con efectivo de $167, en `/cashier` el
total "Recaudado" seguía en $0. La fila aparecía en la tabla "Pagos del turno"
pero no en el cuadre.

**Causa raíz:** el spec `register-vehicle-exit.spec.md` (líneas 63 y 110) y la
implementación en `parking-remote.datasource.ts:302` insertaban el pago con
`status='pending'` para cualquier método no-gratis. Pero `ReconcileShiftUseCase`
filtra `status === 'completed'` para sumar al recaudado y al desglose por
método. Resultado: cash, tarjeta, transferencia → invisibles para el cuadre.

No hay edge function ni trigger que promueva `pending → completed`. El path
paralelo `payment-remote.datasource.ts:create()` (pagos manuales en
`/payments`) ya insertaba como `'completed'` directo — la asimetría dejaba
claro que el `'pending'` del exit-flow era un error de diseño, no un estado
intermedio real.

**Corrección:**
- `parking-remote.datasource.ts:302` — siempre `status: 'completed'`. Comentario
  in-line explica que `'pending'` se reserva para futura integración con
  pasarela que requiera webhook. Removido import no usado de
  `FREE_PAYMENT_METHODS`.
- `register-vehicle-exit.spec.md` reglas 6 y 8 actualizadas a
  "siempre `'completed'`" con justificación.

**Limpieza de datos en BD local (ejecutada con confirmación del usuario):**
```sql
UPDATE payments
   SET status = 'completed', updated_at = NOW()
 WHERE status = 'pending'
   AND _deleted = false;
```
- Antes: 35 completed ($215.600), 1 pending ($166.67 — el reportado).
- Después: 36 completed ($215.766,67), 0 pending.
- Ejecutado vía `psql` directo a `127.0.0.1:54322`. Solo BD local.
- Para producción (cuando aplique): requiere confirmación explícita
  adicional + `supabase --linked`.

**Verificación:** `tsc --noEmit -p tsconfig.app.json` → EXIT=0; SELECT
agrupado por status confirma 0 pending tras el UPDATE.

---

## Adenda 2 — Intento de rediseño v2 (revertido) + nueva memoria

**Hipótesis probada:** rediseñar `/parking` a layout 1-columna ("una tarea
a la vez") con buscador en overlay y métricas removidas, basado en guía
estándar de UX para usuarios mayores ("reducir carga cognitiva, foco único").

**Resultado:** el usuario rechazó el rediseño con "no me está gustando,
estaba bien una pantalla tipo dashboard porque teníamos todo al alcance sin
hacer scroll". La guía estándar contradice su modelo mental ya formado.

**Cambios revertidos:**
- `operator-dashboard.page.html` — header con saludo + 3 métricas, buscador
  como sección inline dedicada (no overlay).
- `operator-dashboard.page.scss` — grid 2-col `minmax(360px, 420px) 1fr` con
  fallback a 1fr en `<= 960px`. Eliminados estilos de `.search-overlay`,
  `.search-trigger`, `.dashboard__count`.
- `operator-dashboard.page.ts` — restaurado `clockNow` signal, `clockTimer`
  setInterval, `monthlyCount` computed, `formatNow()` private. Eliminados
  `searchOverlayOpen`, `openSearchOverlay`, `closeSearchOverlay`,
  `onSearchBackdropClick`.
- `vehicle-entry-form.component.{ts,html,scss}` — color/marca siempre
  visibles (revertido el toggle colapsable).
- `operator-dashboard.spec.md` — sección "Componentes en pantalla" vuelve
  al diagrama 2-col original con nota explícita de la decisión.

**Cambios conservados** (mejoras compatibles con el modelo dashboard):
- Cinta de estado de caja (Adenda 1, no relacionada).
- Bug fix de pagos (Adenda 1).
- Tipografías subidas: placa cards 16→18 px, placa buscador alto 44→56 px,
  botón Salida 40→52 px, botón Abrir caja 56 px, meta cards 12→14 px,
  subtítulos panel 14→16 px.
- Copy mejorado: "Hola" en vez de "Buen turno"; empty state reescrito;
  "Hora actual" en vez de "Hora local".
- Auto-dismiss del receipt-card a 12 s con pausa en hover/focus.

**Memoria nueva:** `~/.claude/projects/.../memory/feedback_dashboard_density.md`
+ entrada en `MEMORY.md`. Para futuras sesiones: en `parqueadero-web` el
usuario prefiere densidad de información sobre rediseños 1-columna; mejorar
con tipografías y áreas táctiles dentro del layout existente, no
reestructurar.

**Verificación final:** `tsc --noEmit` → APP=0, SPEC=0.

---

## Adenda 3 — Bug fix: cierre de turno siempre exigía justificación

**Síntoma:** al cerrar turno, aunque el cajero contara el efectivo correcto,
siempre aparecía "La diferencia supera $5.000. Ingresa una justificación."

**Causa raíz:** asimetría entre UI y backend. La UI
(`ReconcileShiftUseCase:82`) calcula:
```
cashExpected = opening + cash − withdrawals
```
pero el backend (`CloseShiftUseCase:44`) calculaba:
```
expected = opening + cash       (¡SIN restar withdrawals!)
```
Si el turno tenía retiros parciales (HU-039), el cajero contaba el
efectivo según la UI (que sí descontaba el retiro), pero el backend
re-calculaba sin restarlo, creando una diferencia artificial igual al
total retirado. Si el retiro era > $5.000, siempre rechazaba el cierre.

**Datos que confirmaron:** turno abierto local
`7ce69ca8-…` con opening $50.000, cash completed $1.000,01, withdrawals
$10.000. UI mostraba expected = $41.000,01; el cajero tipea $41.000;
backend calcula expected = $51.000,01 → diff = −$10.000,01 → falla.

**Fix:**
- `close-shift.usecase.ts:44` — agrega `listWithdrawalsByShift(shiftId)`,
  suma `withdrawalsTotal`, lo resta de `expected`. Mantiene simetría con
  `ReconcileShiftUseCase`.
- `specs/features/cashier/close-shift.spec.md` — fórmula actualizada
  (regla 1), flujo principal (3 → 4 pasos extra), dependencias añade
  `listWithdrawalsByShift`, edge cases.
- Tests existentes (`close-shift.usecase.spec.ts`) siguen pasando — el
  mock `listWithdrawalsByShift` ya retornaba `[]` (sin retiros).

**Verificación:** `tsc --noEmit -p tsconfig.app.json` → APP=0;
`tsconfig.spec.json` → SPEC=0.

**Limpieza opcional de datos:** los turnos cerrados antes de este fix
quedaron con `expected_balance_cents` mal calculado (sin restar retiros)
y `difference_cents` correspondiente. Al ser históricos no afectan; si
se quiere recalcular, hay que re-correr el cálculo y ajustar las filas.
NO necesario para que el cierre actual funcione.

---

## Adenda 4 — Redondeo COP al múltiplo físico de $50

**Contexto:** el cálculo `(duration × valueCents) / 60` para tarifas en
unidad 'hora' o 'minuto' produce montos con cents fraccionados. Ej: 10
min × $1.000/h = 16.667 cents = $166,67. En Colombia no existen monedas
menores a $50, así que cobrar $166,67 imposibilita el cambio físico.

**Decisión de política (confirmada con usuario 2026-05-02):**
- Paso: $50 (5.000 cents) — mínimo físico circulante.
- Modo: half-up al múltiplo más cercano (Math.round / step).
- Hardcoded por ahora; si después se quiere ajustar a $100 o por
  parqueadero, mover a `settings`.
- Aplica al monto final del cobro Y al catálogo (tarifas + planes
  mensuales) vía validador en sus forms.

**Cambios:**
- `shared/utils/currency.utils.ts` — `COP_CASH_STEP_CENTS = 5000`,
  `roundToCopStep(cents, step)`, `isMultipleOfCopStep(cents, step)`.
- `shared/forms/validators/multiple-of-cents.validator.ts` (nuevo) —
  retorna `{ notMultipleOfCents: { stepCents } }` si el valor no es
  múltiplo. Permite null/empty (delegar a `required`).
- `shared/forms/form-error-messages.ts` — mensaje
  `notMultipleOfCents: 'Debe ser múltiplo de $50 (no hay monedas menores en Colombia)'`.
- `features/parking/domain/usecases/calculate-parking-fee.usecase.ts` —
  el monto final pasa por `roundToCopStep` después del cap. El
  `breakdown.base` se mantiene pre-redondeo para auditoría.
- `features/tariffs/presentation/forms/tariff.forms.ts` — `valueCents`
  y `dailyCapCents` añaden `multipleOfCentsValidator()`.
- `features/monthly-plans/presentation/forms/monthly-plan.forms.ts` —
  `amountCents` añade `multipleOfCentsValidator()`.
- `specs/features/parking/calculate-parking-fee.spec.md` — regla 5
  reescrita; flujo paso 6 reescrito.

**Comportamiento esperado tras el fix:**
- Tarifa $1.000/h × 10 min: base = 16.667 → redondeo = $150 (3 × 5000).
  Antes: $166,67. Ahora: $150 (cobrable con monedas reales).
- Tarifa $1.000/h × 11 min: base = 18.333 → redondeo = $200 (más
  cercano a 4 × 5000 = $200 que a 3 × 5000 = $150).
- Tarifas existentes en catálogo no múltiplos de $50: el form ahora las
  marca como inválidas al editarlas. Las que ya están en BD siguen
  funcionando hasta que el admin las edite.

**Verificación adenda 4:** `tsc --noEmit -p tsconfig.app.json` → APP=0;
`tsconfig.spec.json` → SPEC=0.

---

## Adenda 5 — Modal de salida más ancho + panel de tarifas vigentes

**Pedido:** "el modal de registrar salida se ve muy delgado" + "agrega los
precios de las tarifas por hora y minuto en la vista de parking".

**Cambios:**

### Exit dialog más ancho
- `vehicle-exit-dialog.component.scss`: `max-width 480px → 640px`,
  padding interior aumentado a `--space-6 --space-7` (cae a `--space-5`
  en móvil < 640px). `max-height 90dvh → 92dvh`.
- Añadido helper `.dialog__form-grid` con `grid-template-columns: 1fr 1fr`
  para que en pantallas ≥ 560 px los campos de pago se repartan en dos
  columnas (modificador `.form-field--full` ocupa ambas). Por ahora la
  utilidad queda disponible pero el HTML del dialog se mantiene sin
  reorganizar (otra sesión si se quiere reflow del form).

### Panel "Tarifas vigentes" en dashboard
- `operator-dashboard.page.ts`: signal `activeTariffs: Map<VehicleType, TariffEntity>`.
  En `ngOnInit`, `loadTariffs()` invoca `GetActiveTariffUseCase` para los
  tres tipos visibles (carro/moto/bicicleta) en paralelo. Tipos sin
  tarifa configurada se omiten (silently). Helpers
  `tariffPerHourCents(t)` y `tariffPerMinuteCents(t)` normalizan según
  `tariff.unit` (minuto/hora/fraccion/dia).
- `operator-dashboard.page.html`: nueva sección `.tariffs-bar` entre
  el header de métricas y el buscador. Muestra título "Tarifas vigentes"
  + chips `[Tipo  $X/h · $Y/min]` por cada vehículo con tarifa activa.
- `operator-dashboard.page.scss`: estilos `.tariffs-bar`,
  `.tariffs-bar__title`, `.tariffs-bar__list`, `.tariff-chip` con
  borde-izquierdo primary 3px para anclarlo visualmente.
- `specs/components/operator-dashboard.spec.md`: diagrama actualizado
  con el panel; tabla de conversiones por unidad documentada.

**Verificación adenda 5:** `tsc --noEmit` → APP=0, SPEC=0.

---

## Adenda 6 — Bug fix: 'No hay tarifa activa para tipo de vehículo: otro'

**Síntoma:** al cerrar una sesión de tipo `'otro'`, toast de error
"No hay tarifa activa para tipo de vehículo: otro". El operador no podía
cerrar la sesión por ningún método (ni siquiera cortesía/error).

**Causa raíz:** dos problemas en cascada:
1. `RegisterVehicleExitUseCase` consultaba `getActiveTariff(vehicleType)`
   ANTES de evaluar si el método de pago necesitaba tarifa. Si el método
   era cortesía/error/mensual, igual fallaba si no había tarifa.
2. El `vehicle-entry-form` permitía registrar tipo `'otro'` sin
   verificar si había tarifa configurada para ese tipo. Resultado:
   sesiones huérfanas que después no se podían cobrar.

**BD local confirmó:** tarifas configuradas solo para carro/moto/bici;
ninguna para 'otro'. La sesión de 'otro' del usuario quedó atrapada.

**Fix backend** (`register-vehicle-exit.usecase.ts`):
- Reordenado el flujo: primero se evalúa si la salida es mensualidad
  o método gratis (no requiere tarifa); solo en el resto de casos se
  consulta la tarifa.
- Mantiene la validación "tarifa requerida" cuando hay cobro real.
- La sesión 'otro' del usuario ahora se puede cerrar eligiendo
  cortesía / error con justificación.

**Fix frontend** (`vehicle-entry-form.component.{ts,html,scss}` +
`operator-dashboard.page.{ts,html}`):
- Nuevo input `availableTypes: VehicleType[] | null` en el form. Si
  llega con valores, los chips fuera de la lista quedan visualmente
  deshabilitados (opacidad 0.4, cursor not-allowed, tooltip
  "Sin tarifa configurada — crea una en admin"). El radio interno
  también queda `disabled`. Si `null` o vacío (carga inicial),
  todos habilitados (no bloquear durante el load).
- El dashboard ya carga las tarifas en `loadTariffs()`. Se extiende
  `visibleTariffTypes` para incluir `'otro'` (solo para detección;
  el chip 'otro' NO aparece en la barra de "Tarifas vigentes",
  filtrado en `tariffsList()`).
- Computed `availableTypesForEntry` deriva las llaves de
  `activeTariffs()` y se pasa como `[availableTypes]` al form.

**Specs actualizados:**
- `parking/register-vehicle-exit.spec.md`: nueva regla 9 explicando
  que el lookup de tarifa es condicional al método.
- `components/vehicle-entry-form.spec.md`: tabla de inputs ahora
  incluye `disabled`, `availableTypes`, `monthlyPlanWarning`.

**Comportamiento esperado:**
- Sesión 'otro' existente: cerrable con método gratis + justificación.
- Nuevas entradas: chip 'Otro' visible pero deshabilitado mientras no
  exista tarifa configurada para ese tipo. Tooltip explicativo guía al
  admin a crear una en `/tariffs`.
- Si el admin crea una tarifa de tipo 'otro', el chip se habilita y
  empieza a aparecer en el bar "Tarifas vigentes" (al recargar la
  página o tras la próxima carga del dashboard).

**Verificación:** `tsc --noEmit` → APP=0, SPEC=0.

---

## Adenda 7 — Modal de mensualidad: usabilidad

**Pedidos del usuario:**
1. "El mensaje 'Debe ser múltiplo de $50 (no hay monedas menores en
   Colombia)' es muy específico, debería ser genérico."
2. "El usuario no sabe cuál es el UUID del cliente."
3. "Por ahora no tenemos tipos de planes."
4. "No me está dejando poner placas."

**Cambios:**

### 1. Mensaje genérico
- `shared/forms/form-error-messages.ts`: `notMultipleOfCents` →
  *"El valor debe ser múltiplo de $50"* (sin la coletilla colombiana).

### 2. Customer picker (autocomplete)
- `monthly-plan-edit-dialog.component.{ts,html,scss}`: reemplazado el
  input de UUID por un buscador con autocomplete (mismo patrón que
  `vehicle-exit-dialog`). Buscar por nombre o documento (mín. 3 letras),
  debounce 300 ms, results clickeables. Al seleccionar muestra una
  "chip" con nombre + doc + botón ×. Mientras no haya cliente
  seleccionado, el `customerId` queda en null y el form falla validación.
- `monthly-plans.routes.ts`: agrega `LIST_CUSTOMERS_TOKEN` al array
  de providers (la datasource y el repo de customer ya estaban).
- Constructor del dialog migrado de `inject()` a `constructor` para
  poder inyectar via `@Inject(LIST_CUSTOMERS_TOKEN)`.

### 3. Tipo de plan oculto
- `monthly-plan-edit-dialog.component.html`: removido el `<select>` de
  `planType`. El form sigue cargando `'basico'` por defecto vía
  `MonthlyPlanForms.createPlanForm`. La constante `PLAN_TYPES` y el
  getter `planTypes` se conservan en el .ts (para cuando vuelvan a
  necesitarse). Si en algún momento hay tipos reales, basta con volver
  a renderizar el select.

### 4. Plates: pattern correcto + auto-uppercase
- `monthly-plan.forms.ts`: el validador `Validators.pattern(/^[A-Z0-9]{5,7}$/)`
  rechazaba minúsculas, y el form value no se normalizaba. Reemplazado
  por `plateValidator()` (compartido), que internamente normaliza y
  valida ABC123 / ABC12D.
- `monthly-plan-edit-dialog.component.ts`: `valueChanges` del control
  `vehiclePlate` aplica `normalizePlate(value)` y reescribe el control
  si difiere. Resultado: el operador puede teclear en cualquier case y
  el form siempre guarda mayúsculas válidas.
- `monthly-plan-edit-dialog.component.html`: input de placa con
  `autocapitalize="characters"`, `maxlength="6"`, clase
  `field__input--plate` (mono, 22+ px, centrado, tracking).
- SCSS: nueva clase `field__input--plate` con tipografía mono grande y
  centrada (consistente con `vehicle-entry-form`).

**Verificación:** `tsc --noEmit -p tsconfig.app.json` → APP=0.

---

## Adenda 8 — Crear cliente inline desde monthly-plan dialog

**Pedido:** "Deja que se cree el cliente si es uno nuevo o no existe."

**Cambios:**
- `monthly-plans.routes.ts`: agregado provider `CREATE_CUSTOMER_TOKEN`
  con `CreateCustomerUseCase`.
- `monthly-plan-edit-dialog.component.ts`: inyecta `CreateCustomerUseCase`,
  `FormBuilder`. Nuevos signals: `creatingCustomer`,
  `creatingCustomerLoading`, `creatingCustomerError`. `newCustomerForm`
  con name/docType/docNumber/dv (dv visible solo si docType='nit').
  Métodos `openCreateCustomer()` (pre-llena `name` con la query actual),
  `cancelCreateCustomer()`, `submitCreateCustomer()` (llama use case,
  on success → `selectCustomer(newOne)` y vuelve a vista normal).
- `monthly-plan-edit-dialog.component.html`: tres estados del campo
  cliente:
  1. Hay `selectedCustomer` → chip con nombre + doc + ×.
  2. `creatingCustomer` true → mini-form inline con campos requeridos
     y botones Cancelar / Crear y seleccionar.
  3. Idle → input de búsqueda. Si no hay resultados → bloque "Sin
     coincidencias" + botón "+ Crear cliente nuevo". Si hay resultados
     → lista + botón secundario "¿No encontrás al cliente? + Crear nuevo".
- `monthly-plan-edit-dialog.component.scss`: estilos
  `.new-customer-form` (fondo subtle + borde dashed), `.btn--secondary`,
  `.btn--small`, `.customer-search__empty-block`,
  `.customer-search__create-link`.

**Comportamiento:**
- Operador busca por nombre/doc → si existe lo selecciona.
- Si no existe → click en "+ Crear cliente nuevo" → mini-form con la
  query como nombre pre-llenado → completa doc → "Crear y seleccionar"
  → cliente creado + auto-asociado al plan.
- Validaciones del use case se respetan (doc duplicado, formato,
  email/phone si se llenan más adelante en /customers).
- Para NIT, aparece el campo DV obligatorio (validador del use case).

**Verificación adenda 8:** `tsc --noEmit -p tsconfig.app.json` → APP=0.

---

## Adenda 9 — Botón "Crear cliente" siempre visible

**Síntoma:** "No me aparece el botón de crear nuevo."

**Causa:** el botón estaba dentro de las ramas condicionales del @if/@else
(solo visible si había resultados o si la búsqueda devolvía 0). Si el
operador abría el modal sin haber buscado, ninguna rama se activaba y
el botón nunca aparecía.

**Fix:** sacar el botón "+ Crear cliente nuevo" fuera de las ramas para
que esté siempre visible debajo del input/resultados, mientras no haya
cliente seleccionado y no esté en modo crear.

**Cambios:**
- `monthly-plan-edit-dialog.component.html`: el botón vive ahora fuera
  del bloque condicional. Eliminado el bloque
  `customer-search__empty-block` (la "sin coincidencias" queda como hint
  plano) y el link `customer-search__create-link` redundante.
- `monthly-plan-edit-dialog.component.scss`: nueva clase
  `.customer-search__create-btn` con `align-self: flex-start; margin-top`.
  Eliminadas `.customer-search__empty-block` y
  `.customer-search__create-link` ya no usadas.

**Verificación adenda 9:** `tsc --noEmit -p tsconfig.app.json` → APP=0.

---

## Adenda 10 — Modal mensualidad: timezone, dates auto, errores inline + sweep

**Pedidos del usuario:**
1. "Me sale 'La fecha de inicio no puede ser anterior a hoy' y se cierra
   el modal."
2. "Revisa todo el proyecto para evitar estos errores."
3. "Deja la fecha de inicio deshabilitado lo anterior al día de hoy."
4. "La fecha fin que sea automática y esté deshabilitada."

**Causas (3 problemas combinados):**
1. **Timezone:** la page hacía `new Date('2026-05-02')` que JS interpreta
   como UTC midnight = 2026-05-01 19:00 Bogotá. El backend con
   `today.setHours(0,0,0,0)` (local) lo veía como ayer → rechazaba.
2. **Modal cerraba antes del backend:** `dialogRef.close(value)` →
   página llamaba use case → toast en error, datos perdidos.
3. **Patrón replicado:** mismo bug en customer-edit, tariff-edit,
   vehicle-edit (cualquier rechazo backend cierra modal y pierde datos).

**Cambios:**

### Monthly-plan dialog
- `parseLocalDate(iso)` en `monthly-plans-list.page.ts`: parsea
  `YYYY-MM-DD` como Date local (sin caer en UTC).
- `MonthlyPlanDialogData.onSubmit?: (value) => Promise<string|null>`:
  callback que retorna `null` (éxito) o `string` (error msg).
- Dialog: signals `submitting`, `submitError`. `submit()` async que
  llama callback, mantiene abierto si hay error y muestra inline.
- Start input: `[min]="todayIso"` (browser bloquea fechas anteriores).
- End input: deshabilitado en form (`disable({emitEvent:false})`),
  auto-actualizado por subscribe a `startDate.valueChanges` (start+30d).
- Hint inline en label: "Fecha fin (automática: 30 días)".

### Patrón aplicado a otros dialogs admin
Mismo `onSubmit?: callback` + signals `submitting`/`submitError`:
- `customer-edit-dialog.{ts,html}` + `customers-list.page.ts`.
- `tariff-edit-dialog.{ts,html}` + `tariffs-list.page.ts`.
- `vehicle-edit-dialog.{ts,html}` + `vehicles-list.page.ts`.

Todos los pages refactorizados de `subscribe → use case` a
`onSubmit → use case → return failureMsg|null`. El `subscribe` ahora
solo recibe valor en éxito (toast success + reload).

### Estilos compartidos
- `shared/styles/global.scss`: nueva clase `.submit-error`
  (banner ámbar con ícono ⚠) reutilizable por todos los dialogs.
  Eliminada la copia inline de `monthly-plan-edit-dialog.scss`.

### Memoria + práctica
- Nueva memoria `feedback_dialog_inline_errors.md`: documenta el patrón
  para futuros dialogs + recordatorio de validar con `ng build` no solo
  `tsc --noEmit` (Angular strict templates es más estricto).
- Entry agregada a `MEMORY.md`.

**Comportamiento esperado tras los fixes:**
- Modal mensualidad: fecha inicio defaultea hoy (Bogotá), no se puede
  elegir anterior; fecha fin = inicio + 30 días auto; modal NO cierra
  en error backend, muestra el mensaje inline; submit con loading state.
- Modales customer/tariff/vehicle: mismo comportamiento (NO cierran en
  error, muestran mensaje inline, mantienen datos).

**Verificación adenda 10:** `ng build --configuration development` → BUILD=0
(Angular strict templates pasa). `tsc --noEmit -p tsconfig.app.json` → APP=0.

---

## Adenda 11 — Mensualidad registra ingreso en caja (opción A elegida)

**Pedido:** "Cuando creo una mensualidad debería dar una factura y contar
el ingreso, ¿cómo lo hacemos? ¿en parking o en mensualidad?"
→ Usuario eligió **opción A**: todo en el modal de "Nuevo plan mensual",
en una sola transacción.

**Cambios:**

### Spec
- `specs/features/monthly-plans/create-monthly-plan.spec.md`:
  pre-condiciones agregan "turno de caja abierto"; nuevos params
  `paymentMethod` y `userId`; flujo principal pasa de 8 a 10 pasos
  (incluye validar shift, crear plan, insertar payment); dependencias
  añade `CashierRepository.findOpenByUser` y `PaymentRepository.create`;
  documentado caso degenerado (plan creado pero payment falla) +
  TODO de RPC atómica + TODO factura electrónica.

### Backend
- `monthly-plan.repository.ts`: `CreateMonthlyPlanParams` extendido
  con `paymentMethod: PaymentMethod` y `userId: string`.
- `create-monthly-plan.usecase.ts`:
  - Inyecta `CashierRepository` y `PaymentRepository`.
  - Valida shift abierto antes de crear (BusinessRuleFailure si no).
  - Tras crear el plan, llama `paymentRepository.create` con
    `cashier_shift_id`, `method`, `amount_cents`, `gateway_ref =
    monthly_plan:{id}` (vínculo implícito hasta que se agregue
    `monthly_plan_id` a payments).
  - Si el payment falla, plan queda creado y se loggea warn (degenerado).
- `monthly-plans.routes.ts`: providers añaden
  `CASHIER_REMOTE_DATASOURCE_TOKEN`, `CASHIER_REPOSITORY_TOKEN`,
  `PAYMENT_REMOTE_DATASOURCE_TOKEN`, `PAYMENT_REPOSITORY_TOKEN`.
- `create-monthly-plan.usecase.spec.ts`: agregados `MockCashierRepository`
  + `MockPaymentRepository` con defaults felices; baseParams incluye
  `paymentMethod: 'efectivo'`, `userId: 'user-1'`. Constructor del
  use case actualizado en beforeEach.

### UI
- `monthly-plan.forms.ts`: `paymentMethod` con default `'efectivo'`
  y validator required.
- `monthly-plan-edit-dialog.component.ts`: constante `PAYMENT_METHODS`
  + signal expuesta. `MonthlyPlanFormValue` extendido con `paymentMethod`.
- `monthly-plan-edit-dialog.component.html`: nuevo `<select>` "Método de
  pago" (solo en modo crear), debajo del campo Valor; hint inline
  "El ingreso se contabiliza en tu turno de caja".
- `monthly-plans-list.page.ts`: inyecta `AuthStateService`. `openCreate`
  resuelve `userId` del current user (toast error si null) y lo pasa
  junto con `paymentMethod` al use case. Mensaje de éxito ahora dice
  "Plan creado para X · ingreso registrado".

### Comportamiento esperado
- Crear plan en `/monthly-plans` → use case valida shift abierto
  (sino "No hay caja abierta. Abre un turno antes de vender
  mensualidades." inline en el modal).
- En éxito: plan creado + payment row en `payments` con `cashier_shift_id`,
  método elegido, status='completed' → aparece en "Recaudado" del cuadre
  del turno de quien lo vendió.

### Pendientes documentados
- **Factura electrónica:** TODO Fase 11+ — toggle "emitir factura"
  llamará `siigo-emit-invoice` con `customer_id` + `amount_cents`.
- **Atomicidad:** mover plan + payment a RPC `create_plan_with_payment`
  para garantizar transacción (hoy: secuencial con warn si payment falla).
- **Vínculo plan ↔ payment:** agregar columna `monthly_plan_id` a
  `payments` para reportes precisos. Por ahora `gateway_ref =
  monthly_plan:{id}` sirve como pista textual.

**Verificación adenda 11:** `ng build --configuration development` → BUILD=0.

---

## Adenda 12 — Mensualidad: render en /cashier + comprobante imprimible

**Pedidos:**
1. "En la vista de caja no sale en pagos del turno el pago de la
   mensualidad solo sale una hora."
2. "Debería haber una opción para imprimir factura."

**Causa del bug "solo sale una hora":**
- `PaymentEntity.sessionId` estaba tipado como `string` (no nullable),
  pero el pago de mensualidad lo inserta como NULL en BD.
- En la tabla "Pagos del turno", `{{ shortId(p.sessionId) }}` con
  `shortId(id) = id.length > 8 ? ...` → llamar `.length` sobre null
  fallaba silenciosamente y la celda Sesión quedaba vacía. Al ver solo
  Hora visible "antes" del fallo, parecía que solo se mostraba la hora.

**Cambios:**

### Fix render
- `payment.entity.ts`: `sessionId: string | null`. Comentario explica
  que es null para pagos sin sesión (mensualidades, ajustes, futuros).
- `payment.model.ts`: `session_id: string | null` + `m.session_id ?? null`.
- `cashier-shift.page.ts`: `shortId(id: string | null)` retorna '—' si null.
- `cashier-shift.page.html`: en la columna Sesión, si `p.sessionId` es
  null muestra chip violeta `<span class="payments-table__tag">Mensualidad</span>`
  (mismo color del badge de mensualidad en otras vistas).
- `cashier-shift.page.scss`: clase `.payments-table__tag` con
  `--color-monthly-soft / --color-monthly`, pill, font 10px bold uppercase.

### Comprobante imprimible
- `MonthlyPlanFormValue` extendido con `customerSnapshot?: { name,
  docType, docNumber }` (snapshot del cliente para imprimir sin
  re-consultar BD).
- Dialog adjunta el snapshot al value antes de cerrar (toma
  `selectedCustomer()`).
- `monthly-plans-list.page.ts.openCreate`: tras éxito, llama
  `askPrintReceipt(value)` que abre `ConfirmDialog`
  ("¿Imprimir comprobante para {plate}?" con botones Imprimir/No).
- `printReceipt(v)`: abre nueva ventana con HTML estilo ticket POS
  (mono, ancho 420 px) — placa, cliente + doc, plan, vigencia desde/hasta,
  método, total. Auto-llama `window.print()`.
- Mismo patrón visual que el comprobante de salida del parking
  (`operator-dashboard.page.ts.buildReceiptHtml`).

### Pendiente fuera de scope
- Factura electrónica DIAN/Siigo: queda como TODO Fase 11+ (toggle
  separado del comprobante físico). El comprobante actual es solo
  recibo interno, NO factura fiscal.

**Verificación adenda 12:** `ng build --configuration development` → BUILD=0.

---

## Adenda 13 — Tarifas de mensualidad por tipo de vehículo

**Pedido:** "Las mensualidades también deberían tener su propia tarifa
para moto, carro, bicicleta o otros."

**Decisión de diseño:** reutilizar la tabla `tariffs` existente
agregando un nuevo `unit='mensualidad'`, en vez de crear una tabla
nueva. Pros: cero work mayor de schema, admin reutiliza el dialog de
tarifas, parking lookup queda aislado vía `.neq('unit', 'mensualidad')`.
Contras: 'mensualidad' es semánticamente distinto a minuto/hora/etc;
los campos `grace_minutes` y `daily_cap_cents` no aplican (quedan en
0/valor irrelevante). Aceptado.

**Cambios:**
- `migrations/00015_monthly_tariff_unit.sql` (aplicado a BD local):
  ALTER drop+add constraint para aceptar `'mensualidad'`; INSERT seed
  de 3 tarifas (carro $150.000, moto $80.000, bicicleta $30.000).
- `parking-remote.datasource.getActiveTariff`: agrega
  `.neq('unit', 'mensualidad')` para no mezclar con parking.
- `tariff.entity.ts`: `TariffUnit` extendido con `'mensualidad'`.
- `tariffs/domain/repositories/tariff.repository.ts`: nuevo método
  `getActiveMonthlyTariff(vehicleType)`.
- `get-active-monthly-tariff.usecase.ts` (nuevo) + token DI
  `GET_ACTIVE_MONTHLY_TARIFF_TOKEN`.
- Datasource + impl con query filtrado por `unit='mensualidad' AND is_active`.
- `monthly-plans.routes.ts`: providers añaden Tariff repo + use case.
- `monthly-plan.forms.ts`: nuevo control `vehicleType` (default carro).
- `monthly-plan-edit-dialog`:
  - Inyecta el use case + signal `tariffNotConfigured`.
  - `loadTariffForType(t)` en cambio de `vehicleType.valueChanges`
    rellena `amountCents` (silencioso si no existe).
  - HTML: chips radiogroup "Tipo de vehículo" debajo de la placa con
    hint "El precio se ajusta según el tipo".
  - HTML: hint warn "Sin tarifa configurada para este tipo · ingresá
    el monto manualmente" debajo del campo monto cuando aplica.
  - SCSS: estilos `.vehicle-types` / `.vt-chip` (mismo patrón que el
    entry-form de parking).
  - `MonthlyPlanFormValue` extendido con `vehicleType: string`.
- `tariff-edit-dialog.component.ts`: `UNITS` añade
  `{ value: 'mensualidad', label: 'Mensualidad (mes completo)' }`.
- `operator-dashboard.page.ts.tariffPerHourCents` y `tariffPerMinuteCents`:
  `case 'mensualidad': return 0` para satisfacer exhaustividad TS tras
  ampliar el union type.
- `specs/features/monthly-plans/create-monthly-plan.spec.md`: nota al
  final documenta el auto-fill desde `tariffs.unit='mensualidad'`.

**Comportamiento esperado:**
- Crear plan: chip "Carro" viene seleccionado por defecto, monto se
  rellena con $150.000 de la tarifa seed. Cambias a Moto → monto cae a
  $80.000. Si elegís "Otro" (sin tarifa) → hint warn + monto editable
  manualmente.
- Admin en `/tariffs`: las 3 mensualidades aparecen junto con las de
  parking. Puede crear nuevas mensualidades por tipo o ajustar precios
  (multipleOfCentsValidator se aplica como a cualquier tarifa).

**Verificación adenda 13:** `psql ALTER+INSERT` ok local;
`ng build --configuration development` → BUILD=0.

---

## Adenda 14 — Tariff dialog: ocultar campos irrelevantes + bloqueo de DI route

**Pedidos:**
1. "El valor [del plan mensual] debería estar inhabilitado ya que viene
   de la tarifa."
2. "Al crear una tarifa por mensualidad ocultar los inputs no necesarios
   como el minuto de gracia."
3. "Al crear tarifa que no sea mensualidad no mostrar los inputs de las
   fechas porque esos son de la mensualidad."

**Cambios:**

### Monthly plan dialog: amountCents disabled cuando hay tarifa
- `monthly-plan-edit-dialog.component.ts.loadTariffForType`: si encuentra
  tarifa para el tipo seleccionado, además de llenar `amountCents`,
  llama `amountCtrl.disable({ emitEvent: false })`. Si no hay tarifa
  (o falla la consulta), `amountCtrl.enable()` para permitir override
  manual. El `getRawValue()` del form sigue retornando el monto incluso
  estando disabled, así que el use case lo recibe sin cambios.

### Tariff edit dialog: visibilidad condicional según unit
- `tariff-edit-dialog.component.ts`: nueva signal `isMonthly`. Método
  `applyUnitVisibility(unit)` se ejecuta al ngOnInit + en cada cambio
  de unit:
  - `unit === 'mensualidad'` → `isMonthly.set(true)` + `graceMinutes=0` +
    `dailyCapCents = valueCents` (subscribe valueCents para mantener
    sincronizado mientras siga en mensualidad).
  - `unit !== 'mensualidad'` → `isMonthly.set(false)` + `validFrom=null`,
    `validTo=null`.
- `tariff-edit-dialog.component.html`: 
  - `dailyCapCents` ahora vive dentro de `@if (!isMonthly())`.
  - `graceMinutes` también dentro de `@if (!isMonthly())`.
  - El bloque de fechas (`validFrom` / `validTo`) ahora dentro de
    `@if (isMonthly())`.
  - El label "Valor (COP)" muestra hint inline "precio mensual" cuando
    `isMonthly()`.
- `tariff-edit-dialog.component.scss`: clase `.field__hint-inline`
  agregada para el hint del label.

**Comportamiento esperado:**
- Crear "Mensualidad carro" $150.000 → no aparecen minutos de gracia ni
  tope diario; sí aparecen las fechas de validez. Si cambias el valor,
  el cap se sincroniza automáticamente para no chocar con el constraint
  `daily_cap > 0` del backend.
- Crear "Carro por hora" $5.000 → aparecen tope diario + minutos de
  gracia; las fechas se ocultan (default null en BD).
- Editar plan mensual: monto pre-rellenado y disabled; si el tipo
  elegido no tiene tarifa configurada, el campo queda editable con el
  hint warn "Sin tarifa configurada · ingresá el monto manualmente".

**Verificación adenda 14:** `ng build --configuration development` → BUILD=0.

---

## Adenda 14b — Bloqueo de DI route: providers en el dialog

**Síntoma:** `NullInjectorError: No provider for InjectionToken
GetActiveMonthlyTariffUseCase` al abrir el modal de plan mensual.

**Investigación:**
- `GET_ACTIVE_MONTHLY_TARIFF_TOKEN` provisto solo en
  `monthly-plans.routes.ts`.
- `dialog.open(component, config)` por defecto usa el ROOT injector.
- Probé pasar `injector: this.injector` → seguía fallando (NodeInjector
  no traversa fiable al EnvironmentInjector del route).
- Probé pasar `viewContainerRef: this.vcr` → seguía fallando.

**Fix bulletproof:** declarar los providers DIRECTAMENTE en el
`@Component({ providers: [...] })` del
`MonthlyPlanEditDialogComponent`:
```ts
providers: [
  { provide: CUSTOMER_REMOTE_DATASOURCE_TOKEN, useClass: CustomerRemoteDataSource },
  { provide: CUSTOMER_REPOSITORY_TOKEN, useClass: CustomerRepositoryImpl },
  { provide: LIST_CUSTOMERS_TOKEN, useClass: ListCustomersUseCase },
  { provide: CREATE_CUSTOMER_TOKEN, useClass: CreateCustomerUseCase },
  { provide: TARIFF_REMOTE_DATASOURCE_TOKEN, useClass: TariffRemoteDataSource },
  { provide: TARIFF_REPOSITORY_TOKEN, useClass: TariffRepositoryImpl },
  { provide: GET_ACTIVE_MONTHLY_TARIFF_TOKEN, useClass: GetActiveMonthlyTariffUseCase },
],
```

Self-contained: no depende del injector del padre. Tradeoff: instancias
nuevas por cada apertura (aceptable para servicios stateless;
SupabaseService sigue siendo singleton de root).

**Memoria actualizada:** `feedback_dialog_inline_errors.md` documenta
que ni `injector` ni `viewContainerRef` resuelven fiable; el patrón es
declarar providers en el componente del dialog directamente.

**Verificación adenda 14b:** `ng build --configuration development` → BUILD=0.

---

## Adenda 15 — Tariff list/dialog: cleanup de UI muerta

**Pedidos:**
1. "La tarifa por día es innecesaria."
2. "Hay un check de inactivos que no funciona porque no dejamos
   inactivas las tarifas."

**Cambios:**

### Eliminado "Por día" del select de unit
- `tariff-edit-dialog.component.ts.UNITS`: removida la entrada
  `{ value: 'dia', label: 'Por día' }`. El tipo `TariffUnit` conserva
  `'dia'` para no romper la display de tarifas legacy ya en BD; solo
  se quita del selector al crear/editar.
- `tariffs-list.page.ts.UNIT_LABEL`: añadida entrada `mensualidad`
  (faltaba para mostrar el label correcto en la columna Unidad).

### Eliminado filtro "Mostrar inactivas"
- `tariffs-list.page.html`: removido el `<label class="filter-group--checkbox">`
  con el checkbox.
- `tariffs-list.page.ts`: removido `showInactive` field, método
  `onShowInactive`, y el `isActive: this.showInactive ? null : true`
  reemplazado por `isActive: true` fijo. El comentario explica que si
  en el futuro se vuelve a usar el flujo de desactivar, restaurar el
  filtro.

**Decisión:** el botón de desactivar tarifa (icono ✕ en cada fila) se
**conserva**. El admin puede usarlo eventualmente para limpiar tarifas
viejas; lo único que se quita es el filtro de UI que el usuario nunca
explota porque en su workflow no se desactivan.

**Verificación adenda 15:** `ng build --configuration development` → BUILD=0.

---

## Adenda 16 — Una tarifa activa por (tipo, categoría)

**Pregunta del usuario:** "¿qué pasa si creo dos tarifas de carro, cuál
tomaría el programa?"

**Respuesta corta:** sin ORDER BY explícito, Postgres devuelve cualquiera.
Bug latente.

**BD inspeccionada:** ya había duplicados (2 carro/hora activas en local
`ac8ede53…` "Carro por hora" y `be1ddc3c…` "carro" — el seed + un test
del usuario). El admin debe limpiarlas manualmente.

**Decisión:** validación a nivel de use case. Una sola tarifa activa
por (`vehicle_type`, categoría) donde categoría = parking (cualquier
unit excepto mensualidad) o mensualidad. Sin constraint en BD por ahora
porque hay datos sucios; se puede agregar en una migration futura
después de limpiar.

**Cambios:**

### Repositorio
- `tariff.repository.ts` (abstract): nuevo método
  `existsActiveSameCategory(vehicleType, isMonthly, excludeId?)`.
- `tariff.datasource.ts` (abstract): firma equivalente.
- `tariff-remote.datasource.ts`: query que filtra por type + active +
  not deleted + (mensualidad o no según `isMonthly`) + excluye `id`.
  Usa `head:true, count:'exact'` para no traer filas, solo el conteo.
- `tariff.repository.impl.ts`: passthrough.

### Use cases
- `create-tariff.usecase.ts`:
  - Antes del insert, valida con `existsActiveSameCategory`. Si hay
    dup → `BusinessRuleFailure("Ya existe una tarifa activa de
    {parking|mensualidad} para {tipo}. Desactivá la actual antes de
    crear una nueva.")`.
  - Skip del check `dailyCap > value` cuando `unit='mensualidad'`
    (en mensualidad cap = value, no es un tope sino un sentinel).
- `update-tariff.usecase.ts`:
  - Mismo skip de cap > value para mensualidad.
  - Si se está reactivando (`isActive: true && !tariff.isActive`),
    valida la misma regla con `excludeId` para no chocar consigo mismo.
- `create-tariff.usecase.spec.ts.MockTariffRepository`: agregados los
  métodos `existsActiveSameCategory` y `getActiveMonthlyTariff` para
  satisfacer el contrato abstracto.

**Comportamiento esperado tras el fix:**
- Crear una segunda "Carro por hora" mientras hay otra activa →
  el dialog mantiene el modal abierto y muestra inline el error
  (gracias al patrón `onSubmit` callback).
- Reactivar una tarifa antigua mientras hay otra activa de la misma
  categoría → mismo error.

**Pendiente para el usuario:** limpiar duplicados existentes desde
`/tariffs` (desactivar la que sobre). Una vez limpio, podemos agregar
una migration con `CREATE UNIQUE INDEX … WHERE is_active AND _deleted = false`
parcial para garantizar la regla a nivel de BD.

**Verificación adenda 16:** `ng build` → BUILD=0;
`tsc --noEmit -p tsconfig.spec.json` → SPEC=0.

## Decisiones
- La regla de negocio "no hay caja → no hay entrada" YA existe server-side
  (`RegisterVehicleEntryUseCase` línea 64). Esta sesión solo agrega la
  retroalimentación visual previa, sin duplicar la regla.
- Reusar `ParkingRepository.getOpenCashierShiftId(userId)` (ya existe) en vez
  de cruzar dependencias con el feature `cashier`. Un nuevo
  `GetOpenShiftStatusUseCase` lo envuelve para mantener clean arch.
- Fuente de tamaños: ui-ux-pro-max §6 (`readable-font-size` ≥ 16 px) +
  §2 (`touch-target-size` 44–48 px). Para personas mayores subimos un nivel:
  placa 22 px → 28 px; CTA principal 48 px → 56 px.
- El indicador de caja NO se mete en el header/`<app-layout>` global todavía;
  vive en el dashboard como una "cinta de estado" arriba del saludo. Si más
  adelante se quiere global, se promueve sin riesgo.

## Bloqueos / Pendientes
(none)

## Next Steps
- Pendiente confirmación del spec con el usuario.
