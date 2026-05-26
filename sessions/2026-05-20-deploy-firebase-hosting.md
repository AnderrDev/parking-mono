# Sesión: Deploy del frontend a Firebase Hosting

**Fecha:** 2026-05-20
**Subproyecto(s):** parqueadero-web
**Fase:** 10 (QA + Deploy productivo)
**Estado:** completada

## Objetivos
- [x] Crear spec `parqueadero-web/specs/infrastructure/firebase-hosting.spec.md`.
- [x] Configurar `firebase.json` y `.firebaserc` en `parqueadero-web/` (SPA rewrite + headers cache/SW).
- [x] Build `ng build --configuration=production` exitoso.
- [x] `firebase deploy --only hosting` → `https://parqueadero-web.web.app`.

## Contexto
- Frontend: Angular 18 PWA, builder `@angular-devkit/build-angular:application`, CSR puro (no SSR/prerender), output `dist/parqueadero-web/browser/`, service worker `ngsw-config.json`.
- Backend: Supabase remoto `hhwctcjwrlbqgsrfriqn` (productivo). `environment.prod.ts` ya tiene `supabaseUrl` y `supabaseAnonKey`.
- Firebase CLI: v15.13.0 instalado, autenticado. Proyecto Firebase existente: `gym-flutter-web-224` (otro proyecto, no aplica). Hay que crear/seleccionar uno para parqueadero.
- CLAUDE.md del subproyecto §10 menciona "Vercel, Netlify o similar" — el usuario elige Firebase Hosting.

## Decisiones provisionales (a confirmar)
- Carpeta pública: `dist/parqueadero-web/browser`.
- SPA: rewrite `**` → `/index.html`.
- Cache-Control:
  - `index.html`, `ngsw.json`, `ngsw-worker.js`, `safety-worker.js`, `manifest.webmanifest`: `no-cache, no-store, must-revalidate`. Razón: archivos sin hash, el SW de Angular descubre updates por `ngsw.json`.
  - Assets con hash (`*.js`, `*.css`, fuentes): `public, max-age=31536000, immutable`.
- Headers de seguridad: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. CSP queda fuera de este sprint (requiere inventariar orígenes Supabase exactos).

## Avance

1. **Spec creado** (`firebase-hosting.spec.md`) con decisiones: public=`dist/parqueadero-web/browser`, SPA rewrite, cache `no-store` para `index.html`/`ngsw.json`/`ngsw-worker.js`/`manifest.webmanifest`, cache `immutable 1y` para assets con hash, headers `X-Content-Type-Options` + `Referrer-Policy`. CSP fuera de scope (follow-up).
2. **`firebase.json` + `.firebaserc`** creados en `parqueadero-web/` reflejando exactamente el spec.
3. **Build prod** OK en 4.4s. Warning preexistente: initial bundle 822 kB (budget 665 kB) — solo WARNING, no bloquea. 211 kB transferido (gzip estimado).
4. **Proyecto Firebase creado** vía `firebase projects:create parqueadero-web --display-name "Parqueadero Web"` (lo ejecutó el usuario manualmente porque el classifier de auto-mode bloqueó el comando inferido por el agente — el classifier no contó la respuesta previa de `AskUserQuestion` como confirmación válida para acciones de infraestructura compartida).
5. **`firebase deploy --only hosting`** OK: 102 archivos subidos, release publicado en `https://parqueadero-web.web.app`.

## Decisiones tomadas
- ID Firebase: `parqueadero-web` (project console: https://console.firebase.google.com/project/parqueadero-web/overview).
- Deploy directo a producción (no preview channel) — soft launch, no hay usuarios reales aún.

## Bloqueos / Pendientes
(ninguno bloquea esta sesión)

## Next Steps
- [ ] **CRÍTICO**: en Supabase prod (`hhwctcjwrlbqgsrfriqn`) → Authentication → URL Configuration → cambiar `Site URL` a `https://parqueadero-web.web.app`. Sin esto, magic links / reset password / email confirm redirigen a la URL vieja.
- [ ] Probar login real desde la URL pública con `ander22425@gmail.com`.
- [ ] Verificar PWA en DevTools: SW activo, manifest cargado, instalable.
- [ ] Verificar headers servidos: `curl -I https://parqueadero-web.web.app/index.html` (debe ver `no-cache`); `curl -I` a un `chunk-*.js` (debe ver `max-age=31536000, immutable`).
- [ ] Follow-up Fase 10: GitHub Action para deploy automático en `main`. Dominio custom. CSP estricta.
- [ ] Aplicar migrations pendientes `00019`, `00020`, `00021` al backend prod si aún no se aplicaron (ver PLAN.md §Fase 10).

---

## Sub-tarea: rediseño de tickets/facturas con datos legales (HU-030 v2.1 + HU-031 v1.2.1)

Durante la misma sesión el usuario pidió incluir en el ticket impreso los datos legales del ticket físico BSNR (resolución, NIT, consecutivo numérico, tabla de tarifas, horario de cierre) y mejorar el diseño visual.

**Decisiones del usuario:**
- Aplicar rediseño a **ambos** documentos: ticket de entrada (HU-030) + comprobante de salida (HU-031).
- ~~Consecutivo numérico real vía sequence Postgres~~ → REVERTIDO 2026-05-20 a pedido del usuario: el ticket no requiere consecutivo visible. Migration 00022 borrada del repo; campos `ticketNumber` quitados de Entity / Model / Mapper / Local DS / ExitReceipt / dashboard / renderers.

**Cambios aplicados:**

1. ~~Backend migration `00022_ticket_number_sequence.sql`~~ — creada y luego **borrada** el mismo día tras decisión de quitar el consecutivo.

2. **Settings (`app_settings.parking_info`) extendido**:
   - `parkingType: 'publico' | 'privado' | ''`
   - `resolutionNumber: string`
   - `closingTime: string`
   - Form + UI agregados en `/settings`.

3. **`ticket-renderer.service.ts` rediseñado** (entrada):
   - Banner negro "PARQUEADERO PÚBLICO/PRIVADO" arriba.
   - Nombre + NIT-DV + resolución en header.
   - Placa en caja con borde grueso (Courier 22pt).
   - Data-grid 2 columnas: Tipo, Fecha, Entrada.
   - Banner "✓ CLIENTE MENSUAL" condicional.
   - Tabla completa de tarifas activas (no solo la del vehículo actual).
   - QR (130×130) + leyenda "Conserve este ticket".
   - Footer: dirección + ☎ teléfono.
   - Banner "Hasta las XX:XX" con bordes.

4. **`operator-dashboard.page.ts → buildReceiptHtml()` rediseñado** (salida):
   - Mismo branding/layout que la entrada.
   - Banner "COMPROBANTE DE PAGO".
   - Banner "TOTAL" con fondo negro.
   - Sección Efectivo/Cambio solo si aplica.
   - `printReceipt` ahora es async (carga parking_info).
   - Wrapper `reprintReceipt()` para el binding del template.

5. **Specs**: `print-entry-ticket.spec.md v2.1` + `print-exit-receipt.spec.md v1.2.1` actualizadas (sin consecutivo).

**Validación:** `ng build --configuration=production` OK en 9s. Warning preexistente de bundle size (no nuevo).

## Pendiente para cerrar el rediseño de tickets
- [ ] En `/settings` poblar los 3 campos nuevos (Tipo de parqueadero = "publico", Resolución = `18764107780828`, Hora de cierre = `6:00 P.M.` o `18:00`) más los preexistentes (Razón social = `BSNR`, NIT = `52.210.596-8` con DV, Dirección = `Carrera 17 # 19A - 06`, Teléfono = `311 5922330`). Opciones: UI `/settings`, o SQL Editor (snippet en el chat).
- [ ] Probar impresión de ticket de entrada y de comprobante de salida desde un navegador real.
- [x] Re-deploy a Firebase Hosting (deploy #2 con rediseño v2.1, 103 archivos, release publicado en `https://parqueadero-web.web.app`).
