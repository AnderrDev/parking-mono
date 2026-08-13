# Sesión: Comprobante impreso al vender mensualidad

**Fecha:** 2026-08-12
**Subproyecto(s):** parqueadero-web
**Estado:** completada

## Objetivos
- [x] Emparejar el tamaño de los botones Corregir / Ticket / Salida
- [x] Imprimir un ticket térmico al vender una mensualidad

## Avance

### Botones del operator-dashboard

`Corregir` medía 40px de alto contra 52px de `Ticket` y `Salida`, y `Salida`
además usaba padding y tipografía más grandes y sin borde. Se unificó la
métrica en el placeholder `%session-action-btn`
(`operator-dashboard.page.scss`): 52px, `padding: var(--space-2)
var(--space-4)`, `--text-sm` y `1px solid transparent` + `box-sizing:
border-box` para que el que no tiene borde visible mida igual que los otros.
Aplica también al panel de resultado de búsqueda, donde el desnivel era el
mismo.

### Ticket de mensualidad

Hasta hoy la venta de mensualidad no dejaba ningún soporte físico: el cliente
pagaba un mes y se iba sin papel. Se agregó el comprobante térmico, con spec
previa (`specs/features/monthly-plans/print-monthly-plan-receipt.spec.md`).

Decisiones acordadas con el usuario antes de codear:
- Se imprime automático al confirmar la venta **y** queda un botón de
  reimpresión por fila en `/monthly-plans`.
- Si la impresión falla, la venta queda intacta y solo se muestra un toast:
  el plan y el ingreso ya están confirmados por la RPC atómica, el papel es
  un subproducto.

Implementación:
- `TicketRendererPort` (parking/domain) suma `MonthlyPlanReceiptData` y
  `printMonthlyPlanReceipt()`. No se duplicó renderer: `monthly-plans.routes`
  provee `TicketRendererService`, igual que ya hacen `payments` e
  `invoicing`.
- `buildEscPosMonthlyPlanReceipt()` en el builder ESC/POS: placa grande,
  cliente + documento, plan, vigencia (`Desde` / `Hasta` / días) y total.
- Gate de impresión: se reutiliza `printExitReceiptEnabled` en vez de crear
  un cuarto toggle. Gobierna papeles de **cobro** y una mensualidad lo es.
- `PaymentRepository.findByGatewayRef()` (nuevo, con su datasource e impl):
  la reimpresión necesita el método de pago real, y `gateway_ref =
  'monthly_plan:<id>'` es el único vínculo entre `payments` y el plan.
- La venta imprime sin viajes extra a la BD: `customerSnapshot` ya venía en
  el `MonthlyPlanFormValue`.

## Decisiones
- **Fechas civiles con getters locales, no `timeZone`.** `startDate` /
  `endDate` llegan ancladas a la medianoche local (`parseIsoDateOnly`);
  pasarlas por `toLocaleDateString({ timeZone: 'America/Bogota' })` las
  reconvierte y corre el día si la máquina no está en Colombia. El helper
  del builder lee los componentes locales.
- **Vigencia inclusiva en ambos extremos**: del 11-ago al 10-sep son 31 días,
  consistente con `isCurrentlyActive` de la entidad.
- **La reimpresión se marca `REIMPRESION`**: un segundo papel idéntico al
  original puede pasar por otro cobro.
- **El toggle apagado no da error en la venta automática** (es
  configuración), pero sí en la reimpresión manual (el operador lo pidió).

### Fechas retrodatadas

Se quitó el bloqueo de `startDate ≥ hoy` en tres capas: el `[min]` del input,
la validación del use case y —verificado— **ninguna en la BD**: la RPC solo
rechaza `end_date < today`, y el EXCLUDE de solapamiento aplica a
`active`/`expiring`. Sin migración. Lo que se conserva es no vender un plan
ya vencido.

Salió a flote un bug latente: `hasActivePlanForPlate(plate)` preguntaba
"¿tiene plan vigente hoy?" ignorando el rango pedido, así que rechazaba
renovaciones consecutivas y retrodataciones que la BD sí acepta. El contrato
ahora recibe `{ start, end }` y filtra por solapamiento real, igual que
`daterange(..., '[]')`.

### Auditoría previa a subir (4 hallazgos + 1 propio, todos corregidos)

1. `update-monthly-plan.usecase.ts` seguía usando la medianoche de la
   máquina: con el reloj del equipo en UTC, después de las 19:00 de Bogotá
   rechazaba vigencias válidas. Pasa a `todayDateOnlyBogota()` y a `<` en vez
   de `<=`, consistente con la venta y con `isCurrentlyActive`.
2. **La mensualidad de "30 días" vendía 31.** `syncEndDate` sumaba los días
   pelados sobre un `end_date` inclusivo. Invisible hasta que el comprobante
   empezó a imprimir la vigencia en días. Corregido a `+ días - 1` con
   decisión explícita del usuario; la quincena pasa de 16 a 15 días reales.
3. El guard de reimpresión era global pero el `[disabled]` era por fila: los
   otros botones se veían activos y no hacían nada. Ahora se apagan todos.
4. `payments.gateway_ref` no tenía índice y ya lo consultan tres caminos
   (reimpresión, `cancel_monthly_plan`, anulación). Migración **00046**
   creada — índice parcial, `gateway_ref IS NOT NULL`. **NO aplicada aún.**
5. (Propio) La reimpresión de un plan cancelado salía idéntica a una vigente
   y servía para entrar sin cobro. Ahora lleva banner `PLAN CANCELADO`.

Verificado además: `maybeSingle()` en `findByGatewayRef` no puede reventar
por filas duplicadas (solo la RPC inserta ese `gateway_ref`, la anulación
hace UPDATE), y el operador sí tiene SELECT sobre `payments`
(`payments_operador_read_reports`), así que la reimpresión resuelve el
método de pago.

## Bloqueos / Pendientes
- Sin verificar contra hardware: no se ha impreso un papel real por QZ Tray.
  Falta una venta de prueba con la impresora conectada para revisar el corte
  y que las 48 columnas no partan la línea "La placa entra sin cobro
  mientras este vigente".
- Los tests del builder se escribieron pero **no se ejecutaron** (regla del
  usuario: nada de `ng test` sin habilitación explícita).

## Next Steps
- [ ] **Aplicar la migración 00046** (`supabase db push --linked`, dry-run
      primero) — es solo un índice, pero sin ella la reimpresión hace seq
      scan sobre `payments`
- [ ] **Desplegar el front** (`firebase deploy --only hosting`) — sigue
      pendiente desde la sesión del 2026-08-11; sin esto no llega nada de
      esto al usuario.
- [ ] Probar la impresión real con la térmica conectada
- [ ] Cargar las tarifas de mensualidad desde `/tariffs` (login admin)
- [ ] Seguir con los hallazgos abiertos del 2026-08-11 (empezando por el
      cierre del círculo al anular/cancelar)
