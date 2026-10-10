# Sesión: Selección de impresora DIGITAL POS

**Fecha:** 2026-10-10
**Subproyecto(s):** parqueadero-web
**Estado:** completada

## Objetivos

- [x] Evitar que la impresión QZ se dirija a OneNote cuando hay una impresora térmica instalada.

## Avance

- El diagnóstico del usuario confirmó que QZ conectaba pero seleccionaba `OneNote for Windows 10`.
- Se actualizó la estrategia en `specs/features/parking/print-entry-ticket.spec.md`.
- `chooseAutoDetectedPrinter` ahora prefiere una térmica instalada sobre una predeterminada virtual. Si la predeterminada también es térmica, la conserva.
- Un fallo de `getDefault()` ya no impide usar la lista de impresoras detectadas.
- Se añadió el caso OneNote + DIGITAL POS a las pruebas y se corrigió el texto de Configuración.
- Tras seleccionar DIGITAL POS, la prueba de impresión mostraba erróneamente "No se pudo detectar una impresora térmica". La causa era el mapeo de cualquier error de QZ que contuviera `printer` a un fallo de detección. Ahora el error posterior a la selección incluye la impresora elegida y la respuesta original de QZ.
- Se añadieron pruebas del mensaje para fallos posteriores a la selección y fallos reales de detección.
- El mensaje real fue `Printer is not accepting job` para `GP-80160(Cut) Series`. Se habilitó `parking_info.printerName` en Configuración, en la carga de tickets y en la prueba para poder elegir la cola DIGITAL POS por nombre exacto; guardar invalida la caché.
- `npx tsc -p tsconfig.app.json --noEmit` y `git diff --check` pasaron. Karma compiló la prueba, pero no pudo iniciar ChromeHeadless porque Chrome no está instalado en la ruta configurada.
- `npx tsc -p tsconfig.spec.json --noEmit` pasó tras el segundo ajuste.
- Las 9 pruebas focalizadas de selección y errores QZ pasaron en Edge Headless.
- Diagnóstico de Windows: `GP-80160(Cut) Series` está `Error, PendingDeletion` en `LPT1:` con 2 trabajos; `GP-L80180 Series` está `PendingDeletion` en `USB001` con 1 trabajo. El Spooler está activo. En `PrintQueue` solo aparecen OneNote y XPS; el dispositivo USB se muestra como `No hay una impresora conectada`. No se envió otra página a las colas bloqueadas.
- Reparación posterior: el dispositivo USB reportó `Gprinter GP-L80180`. Se retiraron los tres trabajos antiguos de las dos colas GP, tras lo cual Windows eliminó las colas pendientes. Se recreó `GP-L80180 Series` con el controlador instalado sobre `USB001` y se estableció como predeterminada. Quedó en estado `Normal` con 0 trabajos.
- Se envió una página de prueba de Windows; el usuario confirmó que salió físicamente.

## Decisiones

- Se mantiene la selección automática; la impresora virtual predeterminada solo se usa cuando no hay ninguna térmica reconocida.

## Resultado

- El usuario confirmó que la impresión de prueba salió y que todo está funcionando.
- El usuario hará el despliegue después de recibir el push.
