# Spec: Imprimir comprobante de mensualidad (térmico ESC/POS)

**Versión:** 1.0 (2026-08-11)

## Identificador
`monthly-plans/print-monthly-plan-receipt`

## Descripción
Imprime en la impresora térmica POS (80 mm, vía QZ Tray) el comprobante de la
venta de una mensualidad, apenas se confirma la venta en `/monthly-plans`. El
cliente se lleva un papel que acredita **qué placa quedó cubierta, desde y
hasta cuándo, y cuánto pagó** — hoy la venta no deja ningún soporte físico.

También se puede reimprimir a demanda desde la lista de mensualidades.

## Actor
Sistema, invocado por `monthly-plans-list.page` tras un `Right` de
`CreateMonthlyPlanUseCase` (automático) o por el operador desde el botón
"Ticket" de cada fila (reimpresión).

## Pre-condiciones
- El plan ya está confirmado en Supabase junto con su `payment` (la RPC
  `create_monthly_plan_with_payment` es atómica: si hay plan, hay ingreso).
- QZ Tray corriendo y `parking_info.printerName` configurado en `/settings`.
- El toggle **"Imprimir comprobante de salida por QZ"**
  (`app_settings.parking_info.printExitReceiptEnabled`) está activo. Se
  reutiliza esa bandera y no se agrega una nueva: gobierna los comprobantes
  de **cobro**, y una mensualidad es exactamente eso. Un toggle más por cada
  tipo de papel multiplica la configuración sin que el negocio distinga los
  casos.

## Input

```typescript
export interface MonthlyPlanReceiptData {
  plate: string;
  customerName: string | null;   // null → se omite la línea
  customerDoc: string | null;    // "CC 1234567"; null → se omite
  planType: string;              // 'basico' | 'premium' | 'ilimitado'
  startDate: Date;               // fecha civil (date-only, Bogotá)
  endDate: Date;                 // fecha civil, INCLUSIVA
  amountCents: number;
  paymentMethod: PaymentMethod | null;  // null en reimpresión sin lookup
  soldAt: Date;                  // instante de la venta
  planId: string;
  isReprint?: boolean;           // marca "REIMPRESION" en el cuerpo
}
```

## Output

Reusa `TicketRenderResult` del puerto existente:

| Caso | Valor |
|---|---|
| Impreso | `{ ok: true }` |
| Toggle apagado | `{ ok: false, reason: 'printer_not_configured', message }` |
| QZ falló | `{ ok: false, reason: 'qz_error', message }` |

## Reglas de Negocio

1. **No bloquea la venta.** El plan y el ingreso ya están confirmados en la
   BD cuando se dispara la impresión; el papel es un subproducto. Si falla,
   la venta queda igual y el operador ve un toast de error, nunca un diálogo
   modal ni un rollback.
2. **Fechas civiles, ambos extremos inclusivos.** `startDate` y `endDate`
   vienen de columnas DATE. Se formatean con los helpers de
   `date.utils.ts` (`formatIsoDateOnly` / `parseIsoDateOnly`), nunca con
   `new Date(iso)` directo, que en Colombia retrocede un día.
3. **Días de vigencia** = `endDate − startDate + 1` (ambos extremos cuentan).
4. **No abre el cajón monedero.** A diferencia del comprobante de salida, la
   venta de mensualidad no pasa por la RPC de caja que lo justifica; si el
   negocio lo pide después, se agrega respetando
   `openDrawerOnCashPayment`.
5. **Sin consecutivo.** Igual que el ticket de entrada: el comprobante no es
   factura. El identificador es el `planId` impreso al pie.
6. **Idempotencia**: imprimir dos veces produce dos papeles. Es
   responsabilidad del caller no invocarlo doble; la reimpresión es
   deliberada y se marca como tal.
7. **La reimpresión dice que lo es.** Un segundo papel idéntico al original
   puede pasar por otro cobro; el banner `REIMPRESION` lo evita.

## Flujo Principal (venta)

1. El operador confirma la venta en el diálogo; `CreateMonthlyPlanUseCase`
   retorna `Right(plan)`.
2. El page arma `MonthlyPlanReceiptData` con lo que ya tiene en memoria
   (el form trae cliente, método de pago y monto) — sin viaje extra a la BD.
3. `TicketRendererPort.printMonthlyPlanReceipt(data)`.
4. Éxito → nada extra (el toast "Plan creado" ya cubre).
   Fallo → `toast.error` con el mensaje del renderer.

## Flujo de Reimpresión

1. El operador pulsa "Ticket" en la fila del plan.
2. El page resuelve el cliente (`CustomerRepository.findById`) y el pago
   (`PaymentRepository.findByGatewayRef('monthly_plan:<id>')`, el único
   vínculo entre `payments` y el plan — ver migración 00040).
3. Si el cliente o el pago no se pueden leer, se imprime igual con esas
   líneas omitidas: el papel sigue sirviendo y el operador no queda varado.
4. `printMonthlyPlanReceipt({ ...data, isReprint: true })`.

## Layout (48 columnas ESC/POS)

```
            COCOPARKING                  ← baseHeader() existente
           NIT 52.210.596-8
        PARQUEADERO PUBLICO
------------------------------------------------
        COMPROBANTE MENSUALIDAD
------------------------------------------------
              ABC123                     ← doble alto, negrita
Cliente                          Juan Perez
Documento                        CC 1234567
Plan                                 Basico
Desde                            11/08/2026
Hasta                            10/09/2026
Vigencia                             31 dias
------------------------------------------------
Pago                               Efectivo
Vendido                   11/08/2026 15:04
TOTAL                             $ 150.000
------------------------------------------------
        Presente este comprobante
       La placa entra sin cobro
        mientras este vigente
Plan: 8c8a90f-...
------------------------------------------------
        Carrera 17 # 19A - 06
        Tel. 311 5922330
             CIERRE 18:00
```

Con `isReprint`, entre el título y la placa se intercala:

```
------------------------------------------------
              REIMPRESION
```

## Contratos afectados

```
features/parking/domain/services/ticket-renderer.port.ts
  + MonthlyPlanReceiptData
  + abstract printMonthlyPlanReceipt(data, options?): Promise<TicketRenderResult>

features/parking/data/services/esc-pos-parking-receipt.builder.ts
  + buildEscPosMonthlyPlanReceipt(data, info): string[]

features/parking/data/services/ticket-renderer.service.ts
  + printMonthlyPlanReceipt()

features/payments/domain/repositories/payment.repository.ts
features/payments/data/datasources/payment.datasource.ts
  + abstract findByGatewayRef(ref): Promise<Either<Failure, PaymentEntity | null>>

features/monthly-plans/monthly-plans.routes.ts
  + { provide: TICKET_RENDERER_TOKEN, useClass: TicketRendererService }
```

El puerto vive en `parking/domain` y lo consume `monthly-plans`: es el mismo
patrón que ya usan `payments` e `invoicing`, que también lo proveen en sus
rutas. No se duplica el renderer.

## Edge Cases

- **QZ caído / impresora apagada** → `qz_error`, toast, venta intacta. El
  operador reimprime desde la lista cuando lo resuelva.
- **Toggle de impresión apagado** → no se imprime y NO se muestra error en la
  venta automática (es una decisión de configuración, no una falla); en la
  reimpresión manual sí se avisa, porque el operador lo pidió explícitamente.
- **Cliente General** (venta sin cliente nominal) → se imprime la línea con
  ese nombre; no se omite.
- **Plan cancelado** → la reimpresión sigue disponible, pero el papel sale
  con el banner `PLAN CANCELADO / NO da derecho a ingreso` (`isCancelled`).
  Sin esa marca la copia es idéntica a la de un plan vigente y sirve para
  entrar sin cobro. La anulación del ingreso vive en caja, no en este papel.
- **Sin conexión** → la venta no ocurre; no hay nada que imprimir.

## NO hace

- NO genera PDF ni envía el comprobante por correo.
- NO numera consecutivamente ni emite documento con validez tributaria.
- NO abre el cajón monedero.
- NO escribe en BD (solo lee `app_settings`, `customers` y `payments`).

---
Status: Especificado 2026-08-11 — implementado el mismo día.
