# PWA Validation Checklist — Fase 10 Sprint 10D

Checklist manual de validación de la PWA antes del deploy productivo (10F).

## Pre-requisitos

- Build de producción en deploy preview o producción.
- HTTPS válido (los browsers exigen HTTPS para installable apps).
- DevTools del navegador objetivo.

## A. Validación del manifest

Lighthouse audit ya cubre estos automáticamente (Sprint 10C). Esta es la validación manual:

- [ ] `parqueadero-web/public/manifest.webmanifest` existe y se sirve en `/manifest.webmanifest`.
- [ ] Campo `name` y `short_name` definidos (`short_name` ≤ 12 caracteres).
- [ ] Campo `start_url` apunta a una ruta razonable (`/` o `/auth/login`).
- [ ] Campo `display` = `"standalone"` (sin URL bar al abrir desde icono).
- [ ] Campo `theme_color` coincide con `<meta name="theme-color">` del index.html.
- [ ] Campo `background_color` coherente con splash screen.
- [ ] `icons` incluye al menos:
  - `192x192` PNG
  - `512x512` PNG
  - Una versión `maskable` (con `"purpose": "maskable"`) — para íconos adaptativos.
- [ ] `scope` = `"/"` (alcance de páginas controladas por el SW).

## B. Validación del Service Worker

- [ ] `parqueadero-web/ngsw-config.json` sin `dataGroups` (Dexie reemplaza el cache HTTP de datos en Fase 8).
- [ ] `assetGroups` cubre app shell (CSS/JS/HTML) en `installMode: prefetch`.
- [ ] Recursos lazy (imágenes, fonts) en `assetGroups[].installMode: lazy`.
- [ ] Tras un deploy, abrir DevTools → Application → Service Workers → confirmar `nuevo SW` se activa al recargar.
- [ ] Reload con `Ctrl+Shift+R` invalida cache (`Bypass for network` ON).

## C. Android Chrome 130+

Validar manualmente con un device real o emulador:

- [ ] Visitar URL prod con HTTPS.
- [ ] Banner "Instalar app" aparece a los ~30 s (heuristic de Chrome).
- [ ] Confirmar instalación → ícono en launcher.
- [ ] Abrir desde launcher → app en standalone (sin URL bar).
- [ ] Modo avión activado → la app abre con shell offline (no error de red).
- [ ] Modo avión + registrar entrada → row queda con `_sync_status='pending'`, banner amarillo "1 operación pendiente".
- [ ] Reconectar → banner azul "Sincronizando" → operación drena → banner se oculta.

## D. iOS Safari 17+

- [ ] Visitar URL prod en Safari (NO Chrome iOS — el SW de iOS solo corre en Safari).
- [ ] Compartir → "Añadir a pantalla de inicio".
- [ ] Abrir desde icono → standalone (sin barra Safari).
- [ ] Verificar `apple-touch-icon` cargado (sin ícono genérico de Safari).
- [ ] Status bar color = `theme_color` del manifest.
- [ ] Modo avión + reload → app sirve desde caché.

> Notas iOS:
> - iOS NO soporta `BeforeInstallPromptEvent`. El usuario debe usar "Compartir → Añadir a pantalla de inicio" manualmente.
> - iOS NO soporta Background Sync. La outbox solo drena cuando el usuario abre la app online.
> - iOS NO permite push notifications en PWAs (a la fecha de este doc).

## E. Edge cases offline

- [ ] Operar 1 hora completa offline con 30 operaciones (entrada + salida + pago) → al reconectar, todas drenan FIFO sin pérdida ni duplicado.
- [ ] Crear conflict provocado: registrar misma placa offline en 2 dispositivos → al sincronizar, uno gana (RLS) y el otro queda en `conflicts` → operador resuelve desde el banner.
- [ ] Logout con pendingCount > 0 → confirm dialog "Operaciones sin sincronizar — ¿continuar?" aparece. Cancelar mantiene la sesión.
- [ ] Multi-tab: abrir 2 pestañas autenticadas → drenar en una NO duplica drain en la otra (BroadcastChannel coordina).

## F. Persistencia entre updates

- [ ] Tras desplegar una versión nueva con el SW antiguo aún activo:
  - El operador NO ve la versión nueva hasta que cierra/reabre la app (comportamiento `installMode: prefetch`).
  - Si introducimos un cambio crítico (ej. schema Dexie v3), añadir un check `SwUpdate.versionUpdates` que invite al usuario a recargar.

## G. Lighthouse final pre-deploy

Correr `lhci autorun` contra la URL productiva (no localhost) y verificar:

- [ ] Performance ≥ 90 (subir threshold tras Sprint 10C soft-launch).
- [ ] Accessibility ≥ 95.
- [ ] Best Practices ≥ 95.
- [ ] PWA ≥ 90.

## Acta de aprobación

Aprobado por: ________________
Fecha: ________________
Versión auditada: ________________
Dispositivos probados:
- Android: ____________________
- iOS: ____________________

Bugs encontrados (link a issues): ____________________

## Pendiente al cierre 10F

- Subir thresholds de Lighthouse a los niveles "duros" del handoff arquitecto.
- Documentar este checklist como bitácora en `sessions/YYYY-MM-DD-pwa-validation.md`.
