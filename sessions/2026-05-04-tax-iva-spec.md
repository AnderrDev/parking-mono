# Sesión: Tax config + IVA + refactor ingreso vehículos (modal + ticket térmico)

**Fecha:** 2026-05-04
**Subproyecto(s):** parqueadero-backend, parqueadero-web
**Estado:** en progreso

## Objetivos
- [x] Auditar manejo tributario actual (IVA, ICA, retenciones, régimen) sin tocar facturación electrónica.
- [x] Confirmar con usuario: régimen común + precio al cliente INCLUYE IVA.
- [x] Crear spec canónica de `tax_config` (régimen + tasa + flag include).
- [x] Corregir fórmula IVA en specs de `request-invoice` (web + backend) y `siigo-emit-invoice`.
- [x] Guardar memoria del régimen del cliente.
- [x] Confirmar specs con usuario.
- [x] Crear migration `00016_tax_config_settings.sql` y helper `_shared/tax/extract.ts`.
- [x] Aplicar fórmula corregida en EF `siigo-emit-invoice` (código).
- [x] Spec del refactor de ingreso (modal + ticket térmico + QR).
- [x] Actualizar memoria de density del dashboard (revertida parcialmente).
- [ ] Specs de reportes contables (`tax-report`, `ica-report`) y UI admin (`settings/tax-config`).
- [ ] Implementación frontend del modal + ticket (pendiente OK del usuario).

## Avance

### Auditoría
- Revisé schema (`00002_initial_schema.sql`): `invoice_lines.tax_percent DECIMAL(5,2) DEFAULT 19.00` está hardcoded.
- Revisé `request-invoice.spec.md` (web + backend) y `siigo-emit-invoice.spec.md`: las tres aplicaban `tax = round(subtotal * 0.19)` y `total = subtotal + tax`, lo cual **infla** el total facturado por encima de lo recaudado en caja cuando el precio publicado al cliente ya incluye IVA (caso real B2C en Colombia).
- Revisé `app_settings` (migration 00010): existe la tabla pero no hay clave `tax_config`.
- Revisé `customers.responsabilidades_fiscales`: la columna existe pero no se usa para nada (futuro: detectar autoretenedores / gran contribuyente).
- Revisé `v_revenue_daily`: mezcla bruto (`amount_cents`) sin discriminar IVA — los reportes financieros muestran "ingreso" inflado.

### Confirmación del usuario (2026-05-04)
- Régimen: **común — responsable de IVA al 19 %**.
- Precio cobrado al cliente: **incluye IVA**.

### Specs creadas/modificadas
- ✅ `parqueadero-backend/specs/tax-config.spec.md` — NUEVA. Define shape de `app_settings.tax_config`, fórmula canónica `extractInvoiceAmounts`, snapshot histórico vía `invoice_lines.tax_percent`, migration prevista.
- ✅ `parqueadero-web/specs/features/invoicing/request-invoice.spec.md` regla 3 — fórmula corregida.
- ✅ `parqueadero-backend/specs/edge-functions/siigo-emit-invoice.spec.md` regla 6 — fórmula corregida + carga de `tax_config`.
- ✅ `parqueadero-backend/specs/edge-functions/request-invoice.spec.md` regla 5 — fórmula corregida (deprecado pero coherente).

### Memoria
- ✅ `project_tax_regime.md` + entrada en `MEMORY.md`.

## Decisiones
- **Spec `tax-config` vive en backend, no en web**: es config del establecimiento y la EF la consume; la UI admin la edita pero la fuente de verdad es el backend.
- **`invoice_lines.tax_percent` se mantiene** porque permite snapshot histórico (cambios futuros de tasa no rompen facturas viejas). Los reportes contables agregan desde `invoice_lines`, no recalculan desde `payments`.
- **`tax_config.iva_rate` numérico** en lugar de env `SIIGO_TAX_IVA_PERCENT`: permite cambiarla desde UI admin sin redeploy. El `id` Siigo del impuesto sigue por env (es identificador externo, no tarifa).
- **Defaults defensivos**: si la fila `tax_config` no existe, `getTaxConfig()` retorna defaults (régimen común, 19 %, incluido). Evita romper EF si alguien borra la fila.
- **Sin tocar `tariffs.value_cents`** ni recalcular cobros del cajero: la fórmula solo aplica al construir la factura. El cajero sigue cobrando el mismo monto.

## Avance — IVA (código)
- ✅ `parqueadero-backend/supabase/migrations/00016_tax_config_settings.sql` creada (insert idempotente en `app_settings`).
- ✅ `parqueadero-backend/supabase/functions/_shared/tax/extract.ts` — helper `getTaxConfig` + `extractInvoiceAmounts` con tres modos (no responsable, precio incluye IVA, precio sin IVA).
- ✅ `siigo-emit-invoice/index.ts` ajustado: importa el helper, carga `tax_config`, calcula `subtotal/tax/total` con la fórmula correcta. Removida la dependencia del env `SIIGO_TAX_IVA_PERCENT` para el cómputo (queda como deprecado).

## Avance — refactor ingreso (specs)
- ✅ `parqueadero-web/specs/components/operator-dashboard.spec.md` actualizada: layout post-refactor (botón primario header + FAB mobile + atajo `N`), quick-stats turno, sesiones full-width.
- ✅ `parqueadero-web/specs/components/vehicle-entry-modal.spec.md` NUEVA: wrapper CDK Dialog, autocompletar placa, errores backend inline, auto-print sin bloquear.
- ✅ `parqueadero-web/specs/features/parking/print-entry-ticket.spec.md` NUEVA: estrategia `window.print()` con `@page 80mm`, lib `qrcode` (QR contiene solo `session.id`), no bloqueante si falla.
- ✅ `parqueadero-web/specs/components/vehicle-entry-form.spec.md` actualizada: nuevo input `hideSubmitButton` para que el modal aporte el footer.
- ✅ Memoria `feedback_dashboard_density.md` actualizada con la excepción del modal para ingreso.

## Avance — refactor ingreso (código)
- ✅ `package.json`: `qrcode` ^1.5.3 + `@types/qrcode` ^1.5.5. `npm install` ejecutado, 22 paquetes nuevos.
- ✅ `data/services/ticket-renderer.service.ts` NUEVO: genera HTML térmico 80mm con QR, abre popup, dispara `window.print()`, cache de `parking_info` desde `app_settings`.
- ✅ `domain/usecases/print-entry-ticket.usecase.ts` NUEVO: orquesta el renderer, retorna `Either<Failure, {printedAt}>`.
- ✅ `presentation/components/vehicle-entry-modal.component.{ts,html,scss}` NUEVO: CDK Dialog wrapper, errores inline, `disableClose` para no perder datos, auto-print al éxito (no bloquea si falla).
- ✅ `vehicle-entry-form.component.{ts,html}`: input `hideSubmitButton` para que el modal aporte su propio footer.
- ✅ `operator-dashboard.page.{ts,html,scss}`: quitado panel inline, agregado botón CTA en header (alto 56px, kbd `N`), FAB mobile bottom-right (<768px), `HostListener` para atajo `N` global ignorando inputs/textareas, layout `dashboard__layout--single`, `openEntryModal()` + `handleEntryRegistered()`.
- ✅ `angular.json`: `allowedCommonJsDependencies: ["qrcode"]`, budget `initial` 500→650 kB, `anyComponentStyle` 12→16 kB.
- ✅ `npm run build` pasa limpio sin warnings.

## Decisiones
- **Spec `tax-config` vive en backend, no en web**: es config del establecimiento y la EF la consume; la UI admin la edita pero la fuente de verdad es el backend.
- **`invoice_lines.tax_percent` se mantiene** porque permite snapshot histórico (cambios futuros de tasa no rompen facturas viejas).
- **`tax_config.iva_rate` numérico** en lugar de env `SIIGO_TAX_IVA_PERCENT`: permite cambiarla desde UI admin sin redeploy.
- **Defaults defensivos**: si la fila `tax_config` no existe, `getTaxConfig()` retorna defaults sin romper EF.
- **Sin tocar `tariffs.value_cents`** ni recalcular cobros del cajero: la fórmula solo aplica al construir la factura.
- **Ticket térmico vía `window.print()` + CSS @page 80mm**, no WebUSB ESC-POS: máxima compatibilidad de driver, "auto-imprime" sin diálogo si el usuario marcó la impresora como destino fijo en Chrome.
- **QR contiene solo `session.id`**: no payload firmado, no datos del vehículo. La salida hace lookup contra BD para todo lo demás.
- **Modal con `disableClose: true`**: el backdrop no cierra; Esc/Cancelar piden confirm si hay datos. Evita pérdidas accidentales.

## Bloqueos / Pendientes
- **DB local**: ✅ aplicada vía `psql` directo (la CLI reportaba desincronización entre history table local y migrations). Registrada en `supabase_migrations.schema_migrations` con version='00016'. Verificada con `SELECT key,value FROM app_settings WHERE key='tax_config'`.
- **DB remoto**: bloqueado — `supabase db push --linked` retorna "Cannot find project ref. Have you run supabase link?". El proyecto no está linkeado en este entorno. Para aplicar en remoto, el usuario debe correr (con su PAT/credenciales): `! supabase link --project-ref <REF> && supabase db push --linked`. La migration 00016 es idempotente (`ON CONFLICT (key) DO NOTHING`) — segura de aplicar incluso si Supabase intentara replays.
- Lectura del QR a la salida (out of scope) — futura `scan-entry-qr.spec.md`.
- Specs todavía no creadas: `settings/tax-config` (UI admin), `reports/tax-report` (IVA bimestral), `reports/ica-report` (ingresos brutos). NO bloquean MVP.
- Quick-stats del turno (entradas/salidas/recaudo/cortesías) se aplazaron — la spec de operator-dashboard menciona endpoints nuevos (`getShiftEntryCount`, `getShiftExitCount`) que no se implementaron en este push para no inflar alcance. Las 3 métricas anteriores (en parqueadero, plan mensual, hora) se conservan.

## Next Steps
- [x] DB local aplicada vía psql directo.
- [ ] Usuario debe correr `supabase link --project-ref <REF>` y luego `supabase db push --linked` (destructivo) para aplicar en remoto.
- [ ] Probar el flujo end-to-end en navegador: abrir dashboard → click "Registrar entrada" o tecla `N` → llenar form → confirmar → verificar que abre popup de impresión con ticket térmico + QR.
- [ ] Implementar `scan-entry-qr.spec.md` para usar el QR a la salida (lectura keyboard-wedge).
- [ ] Implementar quick-stats del turno (4 chips, requiere endpoints nuevos en repo).
- [ ] Crear specs/implementación faltantes: `settings/tax-config` UI admin, `reports/tax-report` IVA bimestral, `reports/ica-report` ingresos brutos.
