# QA Manual — Fase 8 (Offline operador-only)

**Audiencia:** usuario o QA humano que valida el modo offline antes de aprobar deploy.
**Requisitos:** dev server corriendo (`ng serve`), Supabase local o staging, DevTools del navegador (Chrome/Edge recomendado por el toggle Offline más confiable).
**Estimación:** 60–90 min ejecutando los 9 escenarios + reporte.

> Este documento NO es spec de implementación: es un checklist operativo. Si un
> escenario falla, abrir issue con la plantilla del final.

---

## Pre-requisitos

- [ ] Migraciones `00019`, `00020`, `00021` aplicadas en el backend del entorno de QA.
      Verificar con:
      ```sql
      SELECT version FROM supabase_migrations.schema_migrations
      WHERE version IN ('00019','00020','00021') ORDER BY version;
      ```
- [ ] Usuario operador creado con rol `operador` y JWT con claim `user_role`.
- [ ] Turno cerrable disponible (o capacidad de abrir turno al inicio de la prueba).
- [ ] Seed mínimo: ≥ 2 tarifas activas, ≥ 1 mensualidad activa, ≥ 1 cliente, ≥ 1 vehículo.
- [ ] Build dev de la web sirviendo en `localhost:4200` (PWA habilitada).
- [ ] Una segunda sesión opcional (otro navegador o incógnito) para escenarios E4, E7, E8.

---

## Escenarios

### E1. Boot offline desde inicio (PWA)

**Objetivo:** Confirmar que la PWA arranca sin red, muestra shell y degrada login con error legible.

1. Cargar la app online al menos una vez (instala SW).
2. Cerrar pestaña.
3. DevTools → Network → Offline ON **antes** de reabrir.
4. Reabrir `localhost:4200`.

**Resultado esperado:**
- La app carga con shell (header, sidebar, tipografía aplicada). Sin pantalla en blanco.
- La página `/auth/login` se renderiza.
- Click en "Ingresar" sin credenciales → validación inline normal.
- Con credenciales válidas → submit falla con `NetworkFailure` inline ("Sin conexión, intenta de nuevo").
- **No** crash, **no** consola con `NullInjectorError`.

---

### E2. Login online → operación offline

**Objetivo:** Flujo principal: snapshotPull pobla mirror, luego offline → write-through optimista + outbox.

1. Online → login operador.
2. Esperar 3–5 s tras login para que termine `snapshotPull()`.
3. DevTools → Application → IndexedDB → `parqueadero-local-db`:
   - [ ] `tariffs` tiene ≥ 1 fila.
   - [ ] `monthly_plans` tiene ≥ 1 fila.
   - [ ] `customers`, `vehicles`, `app_settings` con datos.
   - [ ] `parking_sessions` con sesiones activas del día (si las hay).
   - [ ] `_meta` tiene `lastSyncAt` reciente (< 10 s).
4. DevTools → Network → Offline ON.
5. Banner amarillo "Sin conexión" debe aparecer en < 2 s.
6. Registrar entrada placa `XYZ001` (carro) → success optimista, banner cambia a "1 operación pendiente".
7. Registrar entrada placa `XYZ002` (moto) → "2 operaciones pendientes".
8. Verificar en consola:
   ```js
   await window.__dexie?.outbox.where('status').equals('pending').toArray()
   ```
   Debe retornar 2 filas con `client_op_id` UUIDs únicos.
9. DevTools → Offline OFF.
10. Esperar ≤ 5 s → banner se torna azul "Sincronizando", luego se oculta.
11. Verificar en Supabase Studio que las 2 sesiones aparecen en `parking_sessions` con `client_op_id` no nulo.

**Resultado esperado:** ninguna pérdida, ningún duplicado, orden FIFO preservado.

---

### E3. Salida offline con cobro

**Objetivo:** Validar write-through encadenado (update sesión + insert payment).

1. Online → registrar entrada placa `XYZ010`.
2. Offline ON.
3. Registrar salida de `XYZ010` con método **efectivo**.
4. Verificar en DevTools → IndexedDB:
   - [ ] `parking_sessions` row de `XYZ010` con `status='completed'` y `exit_at` poblado.
   - [ ] `payments` row nueva con `session_id` correcto y `amount_cents > 0`.
   - [ ] `outbox` con 2 entradas (update sesión + insert payment).
5. Online OFF → drain procesa ambas en orden FIFO.
6. Verificar server-side: `parking_sessions.status='completed'` + payment insertado.

**Resultado esperado:** orden temporal preservado (update sesión ANTES que insert payment). Si llegara al revés, el server-side rechaza por FK.

---

### E4. Conflict por `uq_sessions_active` (multi-dispositivo)

**Objetivo:** Validar conflict resolution manual cuando 2 operadores compiten por la misma placa.

1. **Operador A** (offline): registrar entrada placa `CONFLICTO`.
2. **Operador B** (otra sesión, online): registrar entrada placa `CONFLICTO` → success normal.
3. Operador A → Online ON.
4. Drain intenta enviar la entrada → server responde 409 (unique violation).
5. Banner se torna **rojo** "1 conflicto requiere atención" con CTA "Resolver".
6. Click → `conflicts-dialog` abre con payload local vs server lado a lado.
7. Opciones disponibles:
   - "Descartar local" → outbox + conflict se borran, mirror se mantiene con la versión server tras Realtime refresh.
   - "Editar manualmente" → permite cambiar la placa antes de reintentar.
8. Elegir "Descartar local" → banner vuelve a estado normal.

**Resultado esperado:** conflict UI legible, payloads claros, sin pérdida de visibilidad para el operador.

---

### E5. Stale-write (P0409)

**Objetivo:** Validar el trigger `check_stale_write` y su resolución en UI.

1. Abrir 2 pestañas en el mismo navegador, ambas autenticadas como el mismo operador.
2. **Ambas offline**: editar el mismo cashier_shift (por ejemplo, agregar withdrawal).
3. Pestaña A → Online → drain envía update → success.
4. Pestaña B → Online → drain envía update → server responde `P0409` (stale write).
5. Pestaña B: banner rojo, conflict en UI muestra "STALE_WRITE" como tipo.
6. Conflicts dialog: 2 opciones útiles:
   - "Reintentar con datos nuevos" → re-pull del row server, re-aplica cambio local sobre snapshot fresco.
   - "Descartar local" → server gana.
7. Elegir "Reintentar" → drain envía con `_client_updated_at` fresco → success.

**Resultado esperado:** ninguna escritura silenciosa que sobrescriba server más nuevo.

---

### E6. Logout con outbox pendiente

**Objetivo:** Logout NO debe borrar trabajo offline sin confirmación explícita.

1. Offline ON.
2. Registrar 2 entradas.
3. Click menú → Logout.
4. `confirm-dialog` aparece: "Hay 2 operaciones sin sincronizar. Si continúas se perderán. ¿Cerrar sesión de todos modos?".
5. Click **Cancelar** → outbox se mantiene, sigue logueado.
6. Click Logout → **Confirmar** → outbox + conflicts + mirror se limpian, redirige `/auth/login`.
7. Verificar en DevTools que `parqueadero-local-db` quedó vacío (o no existe).

**Resultado esperado:** confirm-dialog bloqueante, decisión consciente.

---

### E7. Multi-tab coordination

**Objetivo:** Validar `BroadcastChannel` entre pestañas.

1. Login en **pestaña A** y **pestaña B** simultáneamente (mismo operador).
2. Offline ON en ambas.
3. Registrar entrada en pestaña A.
4. En pestaña B (sin interactuar): banner debe actualizar a "1 operación pendiente" en < 2 s (evento `enqueue` broadcast).
5. Online ON en ambas.
6. Pestaña A drena. Telemetría:
   ```js
   await window.__telemetry?.recent('sync_attempted', 10)
   ```
   Pestaña B debe registrar `sync_attempted` con `skipped: 'external_draining'`.
7. Tras drain en A, pestaña B refresca `lastSyncAt` sin haber drenado ella misma.

**Resultado esperado:** una sola pestaña drena a la vez (lock vía BroadcastChannel), las demás observan.

---

### E8. Realtime catálogos

**Objetivo:** Validar que el mirror de catálogos se actualiza en vivo.

1. Operador online en operator dashboard.
2. En otra pestaña/navegador: admin crea una tarifa nueva (`POST /tariffs`).
3. En pestaña operador: el formulario de entrada debe ofrecer la nueva tarifa en < 1 s.
4. Verificar en DevTools → IndexedDB → `tariffs` que el row nuevo está presente.
5. Repetir para `monthly_plans` (admin crea un plan nuevo).

**Resultado esperado:** delta Realtime aplicado al mirror sin recarga manual.

---

### E9. Cuota IndexedDB

**Objetivo:** Validar comportamiento bajo presión de espacio.

1. Llenar artificialmente outbox con 1000+ ops:
   ```js
   // Ejecutar en consola (test only):
   for (let i = 0; i < 1500; i++) {
     await window.__dexie?.outbox.add({
       id: crypto.randomUUID(),
       operation: 'register_entry',
       payload: { plate: 'TEST' + i, /* ... */ },
       status: 'pending',
       attempts: 0,
       enqueuedAt: Date.now(),
       client_op_id: crypto.randomUUID()
     })
   }
   ```
2. Registrar una operación nueva (operativa, no de test).
3. Observar:
   - [ ] La op nueva no falla.
   - [ ] Si la cuota está cerca del límite, mirror de `customers`/`vehicles` con `last_seen_at > 30d` se trunca silenciosamente.
   - [ ] Sin error `QuotaExceededError` en consola para el operador.
4. Limpiar:
   ```js
   await window.__dexie?.outbox.where('payload.plate').startsWith('TEST').delete()
   ```

**Resultado esperado:** degradación elegante (trunca old data), nunca bloquea operación nueva.

---

## Aprobación

QA aprobado por: __________________________
Fecha: __________________________

- [ ] Todos los escenarios E1–E9 pasaron.
- [ ] No hay errores `NullInjectorError` en consola en ningún escenario.
- [ ] No hay datos perdidos en prueba de offline largo (1 h offline + 30+ ops + reconexión).
- [ ] No hay duplicados server-side (verificar `client_op_id` distintos para cada op).
- [ ] El operador entendió los mensajes de banner y conflict-dialog sin asistencia.

---

## Bug template

Si encuentras un bug, repórtalo con esta estructura (en `sessions/YYYY-MM-DD-bug-fase-8-*.md`):

```markdown
# Bug Fase 8 — [título corto]

**Escenario:** E[1-9]
**Paso exacto:** [número y descripción]
**Severidad:** crítica / alta / media / baja

## Comportamiento observado
[Qué pasó]

## Comportamiento esperado
[Qué debería pasar según este checklist]

## Reproducibilidad
[ ] Siempre  [ ] Intermitente  [ ] Solo una vez

## Evidencia
- Screenshot DevTools → Console
- Screenshot DevTools → IndexedDB → parqueadero-local-db
- Output de `await window.__dexie?.outbox.toArray()` (si aplica)
- Output de `await window.__telemetry?.recent('sync_failed', 20)` (si aplica)

## Hipótesis
[Causa raíz si la sospechas]
```
