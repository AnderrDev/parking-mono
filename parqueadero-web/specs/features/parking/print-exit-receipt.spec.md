# Spec: Imprimir comprobante de salida

**ID:** HU-031  
**Módulo:** Parking — Dashboard Operador  
**Versión:** 1.1  
**Fecha:** 2026-05-09 (auto-impresión)

---

## Descripción

Después de registrar exitosamente la salida de un vehículo, el sistema imprime **automáticamente** un comprobante físico de pago — análogo al comportamiento del ticket de entrada (HU-030). La tarjeta `.receipt-card` queda visible en el dashboard como respaldo visual, y el operador puede reimprimir manualmente si la primera impresión falló.

---

## Flujo principal

1. El operador registra la salida de un vehículo (HU-007 satisfecho).
2. **Tras el éxito, el sistema dispara automáticamente la impresión** del comprobante (`window.open` + `window.print()`).
3. La ventana popup se autocierra ~1 segundo después de imprimir (mismo patrón que el ticket de entrada).
4. En paralelo, aparece la tarjeta `.receipt-card` (verde/success) en el dashboard con:
   - Placa del vehículo
   - Monto cobrado (o "Sin cobro" si fue gratuito)
   - Método de pago
   - Botón "Imprimir comprobante" para **reimprimir** si la impresión automática falló (popup bloqueado, sin impresora, etc.).
5. La tarjeta permanece visible hasta que el operador la descarte o el auto-dismiss la oculte (12 s).

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
4. La tarjeta se descarta automáticamente cuando el operador registra la siguiente entrada (limpieza del formulario) o tras 12 s de auto-dismiss.
5. El operador puede descartar la tarjeta manualmente con el botón "×".
6. **Auto-impresión:** se dispara `window.open()` + `window.print()` justo después del éxito de salida; falla silenciosamente si el popup está bloqueado (un toast informa "Popup bloqueado — usa el botón Imprimir").
7. **Auto-cierre del popup:** la ventana de impresión se cierra automáticamente ~1 s después de `window.print()` para que no quede colgada — análogo a `TicketRendererService` (entrada).
8. La tarjeta sigue ofreciendo el botón "Imprimir comprobante" como reimpresión manual.

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

- [ ] Al registrar salida exitosa → **se dispara automáticamente** la ventana de impresión con el comprobante.
- [ ] La ventana popup se autocierra ~1 s después de imprimir.
- [ ] Aparece la tarjeta `.receipt-card` con placa, monto y botón "Imprimir comprobante" para reimpresión manual.
- [ ] Si el popup está bloqueado, aparece un toast informativo y la tarjeta queda como fallback manual.
- [ ] Recibo impreso contiene todos los campos requeridos.
- [ ] Cambio aparece solo cuando aplica.
- [ ] "Sin cobro" aparece cuando `amountCents === 0`.
- [ ] Botón "×" descarta la tarjeta.
- [ ] Registrar nueva entrada descarta la tarjeta automáticamente.
- [ ] `ng build` sin errores.
