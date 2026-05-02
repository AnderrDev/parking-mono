# Spec: Imprimir comprobante de salida

**ID:** HU-031  
**Módulo:** Parking — Dashboard Operador  
**Versión:** 1.0  
**Fecha:** 2026-04-30

---

## Descripción

Después de registrar exitosamente la salida de un vehículo, el operador puede imprimir un comprobante físico de pago. El comprobante aparece como una tarjeta descartable en el dashboard y se imprime mediante el diálogo nativo del navegador (`window.print()`).

---

## Flujo principal

1. El operador registra la salida de un vehículo (HU-007 satisfecho).
2. Tras el éxito, aparece una tarjeta `.receipt-card` (verde/success) con:
   - Placa del vehículo
   - Monto cobrado (o "Sin cobro" si fue gratuito)
   - Método de pago
3. El operador hace clic en "Imprimir comprobante".
4. El sistema abre una nueva ventana con el HTML del recibo y lanza el diálogo de impresión del navegador (`window.print()`).
5. La tarjeta permanece visible hasta que el operador la descarte o registre una nueva entrada.

---

## Contenido del comprobante impreso

| Campo | Valor | Condición |
|-------|-------|-----------|
| Nombre del parqueadero | "Parqueadero" | Siempre |
| Placa | `vehiclePlate` | Siempre |
| Tipo de vehículo | Etiqueta en español (Carro, Moto, etc.) | Siempre |
| Entrada | Fecha y hora (dd/MM/yyyy HH:mm) | Siempre |
| Salida | Fecha y hora (dd/MM/yyyy HH:mm) | Siempre |
| Duración | `Xh Ym` o `Ym` | Siempre |
| Total cobrado | `$X.XXX COP` o "Sin cobro" | Siempre |
| Método de pago | Efectivo / Transferencia / Cortesía / etc. | Siempre |
| Efectivo recibido | `$X.XXX COP` | Solo si paymentMethod = "efectivo" y amount > 0 |
| Cambio | `$X.XXX COP` | Solo si efectivo recibido > monto |
| Generado el | Timestamp de impresión | Siempre |

---

## Reglas de negocio

1. El comprobante no requiere numeración secuencial (no es factura electrónica).
2. Si el monto es 0 (vehículo mensual o cortesía), el comprobante muestra "Sin cobro" y omite los campos de efectivo/cambio.
3. El cambio solo se calcula si `paymentMethod === 'efectivo'` y `cashReceivedCents > amountCents > 0`.
4. La tarjeta se descarta automáticamente cuando el operador registra la siguiente entrada (limpieza del formulario).
5. El operador puede descartar la tarjeta manualmente con el botón "×".
6. Si el navegador bloquea `window.open()` (popup blocker), el botón falla silenciosamente — no se muestra error en UI.

---

## UI — Tarjeta `.receipt-card`

- Aparece entre la sección de búsqueda por placa y el layout del dashboard.
- Fondo con tono success suave, borde izquierdo verde.
- Header: icono de recibo + placa + botón "×" (descartar).
- Body: monto destacado + método de pago.
- Footer: botón "Imprimir comprobante" (borde, no fondo sólido).
- Animación de entrada: slide-down suave.

---

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `features/parking/presentation/pages/operator-dashboard.page.ts` | Signal `lastReceipt`, métodos `printReceipt()`, `buildReceiptHtml()`, `dismissReceipt()` |
| `features/parking/presentation/pages/operator-dashboard.page.html` | Sección `.receipt-card` condicional |
| `features/parking/presentation/pages/operator-dashboard.page.scss` | Estilos `.receipt-card` |

---

## Verificación

- [ ] Al registrar salida exitosa → aparece tarjeta con placa y monto correcto.
- [ ] "Imprimir comprobante" abre ventana con el recibo y lanza `window.print()`.
- [ ] Recibo impreso contiene todos los campos requeridos.
- [ ] Cambio aparece solo cuando aplica.
- [ ] "Sin cobro" aparece cuando `amountCents === 0`.
- [ ] Botón "×" descarta la tarjeta.
- [ ] Registrar nueva entrada descarta la tarjeta automáticamente.
- [ ] `tsc --noEmit` sin errores.
