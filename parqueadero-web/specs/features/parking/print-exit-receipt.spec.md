# Spec: Imprimir comprobante de salida

**ID:** HU-031  
**Módulo:** Parking — Dashboard Operador  
**Versión:** 1.2.2  
**Fecha:** 2026-05-20 (datos legales + rediseño 80 mm; sin consecutivo; + tarifa aplicada)

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

## Contenido del comprobante impreso (v1.2 — 2026-05-20)

| Campo | Valor | Condición |
|-------|-------|-----------|
| Tipo de parqueadero | "PARQUEADERO PÚBLICO" / "PRIVADO" en banner negro | Si `parking_info.parkingType` |
| Nombre | `parking_info.name` | Siempre |
| NIT-DV | `NIT XXX-X` | Si `parking_info.nit` |
| Resolución | `Resolución XXX` | Si `parking_info.resolutionNumber` |
| Tipo de documento | "COMPROBANTE DE PAGO" en caja | Siempre |
| Placa | `vehiclePlate` (en caja con borde) | Siempre |
| Tipo de vehículo | Etiqueta en español | Siempre |
| Entrada | dd/MM/yyyy HH:mm (Bogotá) | Siempre |
| Salida | dd/MM/yyyy HH:mm (Bogotá) | Siempre |
| Duración | `Xh Ym` o `Y min` | Siempre |
| Método de pago | Etiqueta legible (Efectivo, T. Crédito, …) | Siempre |
| Tarifa aplicada | `$X / unidad · gracia X min` en caja gris | Si `ExitReceipt.tariffSnapshot` no es null y `unit != mensualidad` (v1.2.2) |
| Total | `$X.XXX` o "Sin cobro" en banner negro | Siempre |
| Efectivo recibido | `$X.XXX` | Solo si paymentMethod = "efectivo" y amount > 0 |
| Cambio | `$X.XXX` | Solo si efectivo recibido > monto |
| Dirección | `parking_info.address` | Si seteado |
| Teléfono | `☎ parking_info.phone` | Si seteado |
| Impreso | Timestamp local Bogotá | Siempre |

**Mismo formato 80 mm que el ticket de entrada (HU-030 v2)** — comparte branding, layout y tipografía. La única diferencia visual: el banner superior "COMPROBANTE DE PAGO" y el banner inferior con el total destacado.

---

## Reglas de negocio

1. El comprobante **NO** es factura electrónica ni requiere consecutivo numérico (v1.2.1).
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
