# 2026-07-04 — Revisión: cobro por ciclos de 12h (plena)

**Estado:** completada (diagnóstico + specs actualizados + fix de desglose en dialog)

## Contexto

Operadores reportan que el sistema NO está aplicando la regla: plena cubre hasta 12h
(o cuando el acumulado alcanza el tope); después de 12h vuelve a contar minuto/hora
hasta alcanzar el tope de nuevo, y se suma.

## Hallazgos

1. **El algoritmo SÍ está implementado y desplegado.**
   - `calculate-parking-fee.usecase.ts` calcula `floor(dur/720) × plena + resto aditivo (capped a plena)`.
   - Agregado en commit `3c03f07` ("Fix local parking printing and fee caps", **2026-06-28**).
   - Verificado en el bundle de producción (`parqueadero-web.web.app`, chunk `chunk-BE2KQG22.js`):
     el código desplegado es idéntico al del repo. Toda la cadena (preview dashboard,
     registro de salida, monto persistido) usa el mismo use case.

2. **Causa probable del reclamo: cobros anteriores al 2026-06-28.**
   Antes de `3c03f07` el modelo era `min(subtotal, plena)` — nunca cobraba más de UNA
   plena sin importar la duración. Cualquier salida >12h cobrada antes de ese deploy
   quedó subcobrada. Confirmar con el usuario las fechas de los casos reportados.

3. **Bug de UI (vigente):** el desglose del dialog de salida
   (`vehicle-exit-dialog.component.html:32-62`) NO muestra la línea de bloques de plena.
   Para >12h muestra solo "N horas × $X" del remanente y "Tope diario (plena) $9.000"
   resaltado como última fila, mientras el total real incluye N×plena — parece que el
   sistema cobra distinto a lo que detalla.

4. **Specs desactualizados (violación SDD):** tanto
   `parqueadero-web/specs/features/parking/calculate-parking-fee.spec.md` como
   `parqueadero-backend/specs/tariffs-pricing.spec.md` documentan el modelo viejo
   (1440 min → UNA plena). El código diverge del spec desde `3c03f07`.

5. **Edge case menor:** el bloque de 12h cobra `plena` completa aunque
   `12 × per_hour < plena` (posible porque C6 solo exige `plena ≤ 24 × per_hour`).
   Con las tarifas reales no aplica, pero el spec debería definirlo.

6. No se pudo validar contra datos de producción: MCP Supabase sin `SUPABASE_ACCESS_TOKEN`.

## Cambios aplicados (misma sesión)

- **Specs actualizados al modelo de ciclos de 12h** (spec primero):
  - `parqueadero-backend/specs/tariffs-pricing.spec.md` — algoritmo por ciclos, tablas de
    ejemplos corregidas (720→1 plena, 840→$13.800, 1440→2 plenas), edge case documentado:
    cada bloque cobra plena completa aunque `12×per_hour < plena` (precio fijo del bloque);
    nota en C6 de endurecer a `≤ 12×per_hour` (requiere migration, pendiente).
  - `parqueadero-web/specs/features/parking/calculate-parking-fee.spec.md` — interfaz
    `FeeBreakdown` completa (campos de bloques + nuevo `remainderCappedByPlena`), flujo,
    edge cases y mapping a UI con los 3 layouts del desglose.
- **`calculate-parking-fee.usecase.ts`**: expone `remainderCappedByPlena` en el breakdown
  (la variable ya existía internamente); docstring actualizado.
- **`vehicle-exit-dialog.component.html`**: desglose corregido —
  línea "N × plena (12 h)" cuando hay bloques; filas Subtotal/Tope solo cuando la fracción
  se topa (antes salían por el solo hecho de haber bloques, mostrando "$9.000" resaltado
  bajo un total mayor); fila Total cuando hay bloques.
- **Tests** (`calculate-parking-fee.usecase.spec.ts`): descripciones obsoletas corregidas
  (24h decía "$9.000"), casos nuevos 840 min (14h) y 960 min (16h) con `remainderCappedByPlena`.
- Validado con `ng build` (OK, solo warning preexistente de qz-tray) y `tsc -p tsconfig.spec.json --noEmit` (OK). Tests NO ejecutados (regla del proyecto).

## Next Steps

- [ ] Confirmar fechas de los casos reportados (¿anteriores al deploy del 28 jun?). Si hay
      salidas >12h cobradas antes, quedaron subcobradas con el modelo viejo.
- [ ] Habilitar `SUPABASE_ACCESS_TOKEN` en el MCP para auditar cobros históricos >12h.
- [x] Deploy a Firebase Hosting (2026-07-04, confirmado por el usuario). Verificado: el
      bundle en producción contiene el desglose nuevo ("N × plena (12 h)" +
      `remainderCappedByPlena` en chunks `XJP7Y5OD`/`V27TDVM2`).
- [ ] (Opcional) Migration para endurecer C6 a `plena ≤ 12 × per_hour`.
