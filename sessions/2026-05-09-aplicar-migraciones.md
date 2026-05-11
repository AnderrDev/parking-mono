# Sesión: Aplicar migraciones 00017 + 00018 + preparar entorno de pruebas

**Fecha:** 2026-05-09
**Subproyecto(s):** parqueadero-backend, parqueadero-web
**Estado:** completada
**Continuación de:** `sessions/2026-05-08-auditoria-arquitectura.md`

## Objetivos
- [ ] Actualizar `database-schema.spec.md` con columnas Siigo + índices nuevos (regla "spec primero").
- [ ] Levantar Docker + Supabase local.
- [ ] Aplicar migraciones 00017 (UNIQUE siigo_cufe) y 00018 (Realtime) a BD local.
- [ ] Verificar índice + REPLICA IDENTITY + publication.
- [ ] Confirmar que `parqueadero-web` arranca contra Supabase local sin regresiones de tipos.
- [ ] Documentar credenciales/URLs para pruebas manuales del flujo completo.

## Avance

### Spec primero (regla absoluta)
- ✅ `parqueadero-backend/specs/database-schema.spec.md` § 7 (`invoices`) reescrita: documenta el rename `number → internal_number` (00013), bloque de columnas `siigo_*`, `requested_invoice`, marca `dian_status / dian_cufe / dian_xml_url / dian_pdf_url` como **DERIVED** vía trigger `sync_dian_from_siigo`, lista índices nuevos (UNIQUE parcial sobre `siigo_cufe` de 00017, índice del cron poller de 00013) y agrega bloque `REPLICATION` con `REPLICA IDENTITY FULL` + publication (00018).

### Estado previo de la BD local
- `supabase_migrations.schema_migrations` registraba 15 versiones (00001–00014, 00016) — faltaban **00015, 00017, 00018**.
- Schema real: 00015 (mensualidad en `tariffs.unit`) ya estaba aplicada al schema vía `psql` directo en una sesión previa, solo no registrada.
- 00017 y 00018: ni aplicadas ni registradas.
- Stack Supabase ya estaba corriendo en `127.0.0.1:54321` (db en `54322`, studio en `54323`).

### Aplicación
Una sola transacción `BEGIN/COMMIT` con `psql -v ON_ERROR_STOP=1`:
1. `\i 00017_siigo_cufe_unique.sql` → `CREATE INDEX uq_invoices_siigo_cufe ON invoices(siigo_cufe) WHERE siigo_cufe IS NOT NULL`.
2. `\i 00018_realtime_publications.sql` → `REPLICA IDENTITY FULL` en `parking_sessions` e `invoices` + `ALTER PUBLICATION supabase_realtime ADD TABLE …` (idempotente).
3. `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('00015'), ('00017'), ('00018') ON CONFLICT DO NOTHING` para sincronizar el history.

### Verificación post-apply
- `schema_migrations`: 18 filas (00001–00018, sin huecos). ✅
- `pg_indexes`: `uq_invoices_siigo_cufe` existe con `WHERE (siigo_cufe IS NOT NULL)`. ✅
- `pg_class.relreplident`: `parking_sessions` y `invoices` ambos en `full`. ✅
- `pg_publication_tables`: `supabase_realtime` cubre `parking_sessions` e `invoices`. ✅
- Smoke datos: 7 tariffs (4 normales + 3 mensualidades), 1 sesión activa preexistente, 0 invoices (BD limpia para probar Siigo), 4 keys en `app_settings` (`tax_config` + `parking_info` + `operational_config` + `invoicing_config`), 1 admin user.

### Frontend
- `parqueadero-web/src/environments/environment.ts`: actualizada `supabaseAnonKey` para que coincida con la viva del CLI (`...CRXP1A7WOeo...`). El stack Supabase 2.34 emite una key distinta a la previa.
- `npx tsc --noEmit -p tsconfig.json`: limpio.
- `npx ng build --configuration=production`: completa en 5.6 s, **sin warnings, sin errores**, todos los bundles dentro de presupuesto.

## Endpoints listos para pruebas manuales

| Recurso | URL |
|---|---|
| API Supabase | `http://127.0.0.1:54321` |
| Studio (dashboard local) | `http://127.0.0.1:54323` |
| Postgres directo | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Inbucket (mails dev) | `http://127.0.0.1:54324` |
| App Angular (cuando levantes) | `http://localhost:4200` (`npm start` en `parqueadero-web`) |

### Credenciales de prueba

- **Admin**: `admin@parqueadero.local` (password definido en seed; revísalo en `supabase/seed.sql`).
- **anon key** (frontend): inyectada en `environment.ts`.
- **service role key** (sólo Edge Functions / scripts admin): la entrega `supabase status`. NO usar desde el navegador.

## Cómo correr el flujo manual

```bash
# Terminal 1 — backend ya está arriba; verificar:
supabase status

# Terminal 2 — Edge Functions locales (si vas a probar siigo-emit-invoice):
cd parqueadero-backend
supabase functions serve --env-file supabase/.env

# Terminal 3 — frontend:
cd parqueadero-web
npm start
# → http://localhost:4200
```

### Smoke flow sugerido
1. Login con admin → dashboard operador.
2. Abrir turno (cierre de caja con `cash_initial_cents=0`).
3. **Registrar entrada**: tecla `N` o botón header → modal con form, placa nueva, tipo carro/moto. Confirmar → debe abrir popup térmico con QR (si el navegador bloquea popups, autorizar). El ticket renderer ahora pasa por `TicketRendererPort` (puerto domain) y `TICKET_RENDERER_TOKEN` (DI). **Verificar**: ticket sale con QR, modal cierra sin perder datos al fallo backend.
4. **Registrar salida**: dashboard → tabla activa → click sesión → dialog salida con cálculo de tarifa, métodos de pago, opcional toggle "Emitir factura electrónica".
   - Si toggle ON y cliente con datos fiscales → invoca `siigo-emit-invoice`.
   - Si NO hay credenciales Siigo configuradas en `.env`, la EF responderá error y el invoice queda en `pending`. Esperado en local.
5. **Validar realtime**: con dashboard abierto, en otra pestaña ejecutar `INSERT INTO parking_sessions …` directo en Studio — la tabla activa debe refrescar sin reload.
6. **Cerrar turno**: con cash counted; si difiere > $5.000 pide justificación.

### Queries útiles durante pruebas

```sql
-- Sesiones activas:
SELECT vehicle_plate, vehicle_type,
       extract(epoch from (now() - entry_at))/60 AS minutos
FROM parking_sessions WHERE status='active' ORDER BY entry_at;

-- Última factura emitida + estado Siigo:
SELECT internal_number, siigo_status, siigo_attempts, siigo_last_error
FROM invoices ORDER BY created_at DESC LIMIT 5;

-- Tax config aplicada:
SELECT value FROM app_settings WHERE key='tax_config';

-- Audit log últimas 20:
SELECT created_at, user_id, action, entity_type, entity_id
FROM audit_log ORDER BY created_at DESC LIMIT 20;
```

## Mockear Siigo + DIAN (decisión 2026-05-09)

Usuario: "no estamos usando siigo por ahora, vamos a mockear siigo o dejarlo fuera y también dian-fe-service".

### Estado real (post-verificación de la UI)

**Lo que la UI invoca HOY** (descubrimiento que corrige la auditoría del 2026-05-08):
- `parqueadero-web/src/app/features/invoicing/data/datasources/invoicing-remote.datasource.ts:23,43` invoca **`request-invoice`** (la EF legacy de Fase 9), NO `siigo-emit-invoice`. La migración del datasource a Siigo es una tarea de Fase 11/S6 que aún no se completó.

### Comportamiento sin proveedor real

| EF | Modo "sin proveedor" | Cómo se activa |
|---|---|---|
| `request-invoice` (legacy, **invocada por la UI hoy**) | Stub local interno: responde `dian_status='accepted'`, `cufe='STUB-<uuid>'` | `DIAN_FE_SERVICE_URL` vacío en `supabase/.env` (default) |
| `siigo-emit-invoice` (futuro Fase 11/S6) | Modo mock: responde `siigo_status='Stamped'`, `siigo_id='mock-<uuid>'`, `siigo_cufe='MOCK-CUFE-<uuid>'`, `siigo_observations=['Modo mock local — sin proveedor configurado']`. Sin red, sin auditar `siigo_invoice_attempts` | `SIIGO_USERNAME` o `SIIGO_ACCESS_KEY` vacíos en `supabase/.env` (default) |

Ambas EFs llegan a `siigo_status='Stamped'` (la legacy lo hace via `dianToSiigoStatus()` y el trigger `sync_dian_from_siigo`). En la BD ambos casos se ven idénticos para la UI.

### Implementación

- ✅ `siigo-emit-invoice/index.ts`: bandera global `SIIGO_MOCK_MODE` evaluada al inicio. Bifurca tres puntos: skip `getSiigoToken`, skip `ensureSiigoCustomer`, sustituye `siigoFetch('/v1/invoices')` por respuesta sintética. `deno check` limpio.
- ✅ Spec `siigo-emit-invoice.spec.md`: nueva regla 14 "Modo mock local" + sección 11b en el flujo. Documenta que producción debe poblar las dos vars.
- ✅ `supabase/.env` creado con vars Siigo vacías y `DIAN_FE_SERVICE_URL` vacío → ambos paths quedan en sus respectivos modos sin proveedor.
- ✅ `request-invoice/index.ts` mantiene su stub interno (Fase 9 ya lo tenía); el header DEPRECATED del 2026-05-08 sigue vigente.
- ✅ `dian-fe-service` queda fuera del flujo activo (CONGELADO desde el 2026-05-08).

## Decisiones
- 00015 quedó registrada en history aunque su DDL ya estaba aplicada al schema previamente (insert-only, sin reaplicar). Igualar el history con el schema permite que `supabase db push --linked` futuro no la reproduzca y rompa.
- Anon key actualizada en `environment.ts` con la del CLI activo. Si el usuario reinicia el stack y la key cambia, hay que volver a sincronizar.
- Entorno de pruebas se documenta como instructivo; no se arranca `npm start` en background para no dejar procesos colgados.

## Bloqueos / Pendientes
- ⏳ Aplicar 00017 y 00018 a remoto (`supabase link --project-ref <REF>` + `supabase db push --linked`) — destructivo, requiere que el usuario lo dispare cuando esté listo.
- ⏳ Si pruebas manuales descubren bugs nuevos: bitácora separada por incidente.

## Smoke check final (2026-05-09)

Confirmado que NO hay BD remota — todo el alcance es local.

| Check | Estado |
|---|---|
| API Supabase `127.0.0.1:54321` | ✅ HTTP 200 |
| Studio `127.0.0.1:54323` | ✅ HTTP 307 (redirect normal) |
| Migraciones aplicadas | ✅ 18/18 (00001–00018) |
| Tablas operativas | ✅ 14 tablas + 4 views (v_audit_log, v_operator_performance, v_revenue_daily, v_sessions_by_type) |
| `uq_invoices_siigo_cufe` (00017) | ✅ presente |
| `uq_sessions_active` | ✅ presente |
| `app_settings.tax_config` | ✅ insertada (00016) |
| Realtime publication | ✅ cubre `parking_sessions` e `invoices` |
| Admin user activo | ✅ `admin@parqueadero.local` |
| Edge Functions | ✅ 7 presentes (manage-users, process-payment, renew-monthly, report-export, request-invoice, siigo-emit-invoice, siigo-poll-status) |
| `supabase/.env` | ✅ DIAN_FE_SERVICE_URL vacío, SIIGO_* vacías → ambos modos sin proveedor |
| `environment.ts` anon key | ✅ coincide con CLI activo |
| `tsc --noEmit` | ✅ limpio |
| `ng build --production` | ✅ 5.6 s sin warnings |
| `deno check` siigo-emit-invoice | ✅ limpio |

## Next Steps
- Pruebas manuales del flujo end-to-end (entrada → salida → factura) por parte del usuario.
- Cuando se cree el proyecto Supabase remoto: linkear con `supabase link --project-ref <REF>` y aplicar las 18 migraciones con `supabase db push --linked` (destructivo, requerirá confirmación).
- Si el flujo manual queda OK: proseguir con Fase 8 (PowerSync) o Fase 11 S2 (Siigo schema delta — parte ya aplicada vía 00013/00017/00018).
- Sesiones pendientes: tests faltantes (#9, #12), MFA (#15).
