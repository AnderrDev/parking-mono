# Sesión: Prod-prep — snapshot tarifa, role fixes, ramas dev/prod

**Fecha:** 2026-05-25
**Subproyecto(s):** parqueadero-web + parqueadero-backend
**Estado:** completada

## Objetivos
- [x] Implementar snapshot inmutable de tarifa al ingreso (fix de raíz contra edits posteriores).
- [x] Crear ruta `/payments` con historial de cobros + detalle + reimpresión de comprobante.
- [x] Refactor: mover printReceipt/buildReceiptHtml de operator-dashboard a ticket-renderer.service.
- [x] Limpieza de árbol de widgets (huérfanos).
- [x] Commits temáticos a `dev` + push.
- [x] Crear rama `prod` y push.
- [x] Plan de pruebas por rol (admin, operador, contador).
- [x] Arreglar bugs descubiertos: guards faltantes, sidebar sin filtrar por rol, brand-tag hardcoded.
- [x] Crear matriz de HUs (`qa-matrix-pre-prod.spec.md`) con 173 historias.
- [x] Ejecutar QA rápida por rol contra dev remoto.

## Avance

### 1) Snapshot inmutable de tarifa

**Bug de raíz descubierto:** `parking_sessions.tariff_id` se quedaba en NULL en TODAS las sesiones porque `parking-remote.datasource.ts:insertSession` no incluía la columna en el INSERT. Adicionalmente, aunque se persistiera el `tariff_id`, una edición posterior de la tarifa cambiaría los valores mostrados en el historial — el ID es una referencia mutable.

**Solución (Opción A — snapshot inline):** Migration `00027_session_tariff_snapshot.sql` agrega 4 columnas a `parking_sessions`:
- `tariff_snapshot_name TEXT`
- `tariff_snapshot_per_minute_cents BIGINT`
- `tariff_snapshot_per_hour_cents BIGINT`
- `tariff_snapshot_plena_cents BIGINT`

Estas columnas son **inmutables post-INSERT** (convención, no constraint). El insert ahora resuelve la tarifa activa por vehicle_type y copia los 4 valores.

**E2E verificado:** 2 carros (CAR111 cobrado $6.600 a $3.400/h, luego edit tarifa a $5.000/h, CAR222 cobrado $8.100). En `/payments`:
- CAR111 muestra "$3.400/h" (snapshot)
- CAR222 muestra "$5.000/h" (snapshot)
- Misma tarifa "Tarifa carro" con valores distintos congelados ✅

**Capas tocadas:**
- Migration backend + apply al dev remoto
- `parking-session.model.ts` + `parking-session.entity.ts` + mapper
- `parking-remote.datasource.ts:insertSession` (resolve + snapshot)
- `parking-local.datasource.ts` (snapshot=null offline, fallback en display)
- `/payments` `resolveTariff()` con prioridad: snapshot > tariff_id > activeTariffByType
- `/parking/history` displayAmount usa mismo fallback chain

### 2) Página `/payments` (historial de cobros)

Reemplazó el placeholder. Features:
- Lista filtrable (rango fecha default últimos 7 días, placa, método)
- Card de total filtrado
- Fila expandible → detalle con 4 secciones: Sesión · Atención (operadores) · Cobro · Tarifa aplicada
- Botón "Reimprimir" carga sesión+tarifa+payment y dispara `ticketRenderer.printExitReceipt()` con el formato POS original
- Sidebar: reemplaza "Facturación" por "Historial cobros" (la ruta `/invoicing` sigue accesible por URL para tickets viejos)

**Refactor incluido:** `buildReceiptHtml` + `printReceipt` (300+ líneas) movidos de `operator-dashboard.page.ts` a `ticket-renderer.service.printExitReceipt(r, parkingInfo?)` para reuso. `ExitReceipt.paymentMethod` tipado a `PaymentMethod` (antes `string`).

### 3) Limpieza UX adicional

- Quitada sección "Cómo se calculó el cobro" del detalle de /payments (a pedido del usuario — para casos con cap por plena mostraba $59.600 → $9.000 que era ruidoso).
- Estilos `.fee-breakdown__row--subtotal` (italic gris) y reuso de `--winner` para destacar el cap.
- Detalle expandido en cualquier fila sin sesión muestra nota "Pago sin sesión asociada".
- Fix bug `column duration_minutes does not exist`: la columna era computada en una view, no en la tabla. Se deriva en cliente desde entry_at - exit_at.

### 4) Commits y branches

3 commits temáticos a `dev`:

```
1c8f3c9 docs(sessions): bitácoras 2026-05-{20,24} + .gitignore para artefactos
187bc69 feat(parking): additive pricing, immutable tariff snapshot, /payments history
717ea0b chore: remove Siigo/DIAN service and legacy specs
```

Push a `origin/dev` ✓. Rama `prod` creada local desde dev y pusheada como `origin/prod` (confirmado por usuario).

### 5) Fixes de roles (post-QA)

Tests por rol descubrieron 3 huecos de seguridad/UX:

1. **`/tariffs` sin guard de admin** — un operador podía verla. Fix: `requireRole('admin')`.
2. **Sidebar no filtraba por rol** — operador veía 13 items admin. Fix: `NAV_ROLES` map + `mainNavItems/adminNavItems` como computed signals que filtran por `authState.role()`.
3. **Brand-tag hardcoded "Admin"** — todos los roles veían "Admin". Fix: `ROLE_LABEL` map + `roleLabel()` computed.

Routes faltantes también arregladas: `reports`, `payments`, `invoicing` con `requireRole('admin', 'contador')`; `monthly-plans` y `vehicles` con `authGuard` básico.

Commit: `687e583 fix(roles): protect admin routes, filter sidebar by role, dynamic brand-tag` → push dev + fast-forward prod + push prod.

### 6) Matriz de HUs

Creado `parqueadero-web/specs/qa-matrix-pre-prod.spec.md` con 173 HUs en 17 áreas. Sirve como checklist de QA pre-prod.

### 7) QA por rol ejecutada

Verificadas en vivo contra dev remoto vía Playwright:
- **Admin:** 13 items sidebar, brand "Admin", todas las rutas admin renderizan (tariffs/dashboard/reports/audit/users/settings/vehicles/sesiones/caja history/payments con 13 cobros · total $43.070).
- **Operador:** 4 items sidebar (sin Administración), brand "Operador", caja abierta visible, guards /tariffs //users /reports → /parking.
- **Contador:** 10 items sidebar (sin Tarifas/Settings/Users), brand "Contador", /tariffs y /settings → /parking, /payments accesible.

### 8) Bugs descubiertos pendientes

- 🟡 **Edge Function `manage-users` no deployada** en proyecto remoto dev — el dialog "Nuevo usuario" falla con CORS. Workaround: SQL directo para crear usuarios de test.
- 🟡 **Registro de entrada como operador falló silenciosamente** (1 error de consola sin investigar). Sospecha: RLS/policy.

## Decisiones

- **Opción A (snapshot inline) sobre B (tarifas inmutables vía soft delete)**: menos invasivo, no cambia el flujo del admin al editar tarifas. La fila de tariffs sigue siendo mutable; el snapshot en parking_sessions es la fuente de verdad para el historial.
- **Backfill de snapshots para 9 rows legacy**: NO se aplicó. El fallback por `vehicle_type` cubre el display, y las sesiones legacy son de testing. Hacia adelante, todas las nuevas tendrán snapshot correcto.
- **Rama `prod` fast-forward desde `dev`** en lugar de PR/merge: hoy ambas tienen exactamente los mismos commits. Cuando empiece deploy productivo el flujo será `dev → PR → prod`.
- **Credenciales dev en `auth.forms.ts` prefilled** (`admin@parqueadero.com / ParqueaderoAdmin2026!`): aceptado como riesgo solo en dev. **BLOQUEANTE crítico antes del build productivo.**
- **Matriz de 173 HUs**: documento como checklist + spec viva. No se ejecutaron todas hoy — solo el subset crítico que valida la cobertura por rol.

## Bloqueos / Pendientes

### Bloqueantes para Fase 10 deploy

1. **Quitar credenciales hardcoded** en `auth.forms.ts:9-15` antes de `ng build --configuration=production`.
2. **Crear proyecto Supabase prod** separado del dev (`hhwctcjwrlbqgsrfriqn`). Migrar las 27 migrations + seed inicial sin admin de dev.
3. **Deploy a Firebase Hosting** apuntando a la rama `prod` (o build de prod).
4. **Sentry DSN + alertas** configuradas para producción.
5. **Backup verification** del proyecto prod (descargar dump, restaurar local, smoke test).
6. **`docs/runbook.md`** con procedimientos: reset password, cambio role, troubleshoot común.
7. **Plan de rollback**: snapshot pre-deploy + comandos de revert.
8. **Lighthouse audit ≥ 95 a11y, 90 perf, 95 best-practices, 90 PWA** en prod.
9. **Self-pen-test RLS**: intentar manipular JWT con curl.
10. **Suite e2e Playwright** automatizada para 3 flujos críticos (DoD de Fase 10).

### Bugs no críticos para resolver pronto

- Deployar Edge Function `manage-users`.
- Investigar el error de consola al registrar entrada como operador (1 console error sin detalle).
- Validar offline (Dexie + outbox) con cortes de red manuales.

## Next Steps

- Decidir el orden de Fase 10: ¿primero crear Supabase prod o primero arreglar los bugs no críticos?
- Empezar por **quitar credenciales hardcoded** y crear el primer build con `--configuration=production` para detectar otros issues.
- Configurar variables de entorno productivas (URL Supabase, anon key, Sentry DSN).

**Estado del repo:**
- `dev` y `prod` sincronizados en `687e583` con todos los cambios del día.
- Matriz QA disponible para retomar testing más profundo cuando se requiera.
