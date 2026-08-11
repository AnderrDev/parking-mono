# Sesión: Fix RLS — el operador no podía vender mensualidades

**Fecha:** 2026-08-11
**Subproyecto(s):** parqueadero-backend
**Estado:** completada

## Objetivos
- [x] Diagnosticar por qué la pantalla de mensualidades no deja guardar
- [x] Corregir la causa y verificar contra la base remota

## Avance
Síntoma reportado: "el programa no me está dejando ingresar mensualidades".

Diagnóstico contra la base remota (`supabase db query --linked`):

1. La tabla `monthly_plans` está vacía (0 filas) — ninguna venta llegó nunca.
2. Los dos usuarios son `admin@parqueadero.com` (admin) y
   `general@parqueadero.com` (operador). **Todos** los turnos de caja,
   incluido el abierto hoy, son del operador: ese es el usuario del día a día.
3. Hasta 00037 `monthly_plans` solo tenía política de escritura para admin
   (`monthly_plans_admin_all`); el operador solo tenía SELECT.
4. Reproducido con `SET LOCAL ROLE authenticated` + claim `user_role=operador`:
   el INSERT muere con `42501: new row violates row-level security policy`.
   La UI lo traduce a "Error del servidor. Intenta más tarde.", que no dice nada.

La ruta `/monthly-plans` solo tiene `authGuard`, sin gate de rol, así que el
operador entraba y llenaba el formulario completo antes de estrellarse.

Fix: `parqueadero-backend/supabase/migrations/00038_operador_sell_monthly_plans.sql`
— INSERT + UPDATE en `monthly_plans` e INSERT en `customers` para el operador.
Aplicada a remoto con `supabase db push --linked` (dry-run previo).

Verificación post-fix, todo en transacciones con ROLLBACK y con el claim de
operador: venta de plan + `payments` contra el turno abierto, creación de
cliente, edición de vigencia y cancelación (soft-delete). Sin residuos:
`monthly_plans` sigue en 0 filas.

Spec actualizada: `parqueadero-backend/specs/rls-policies.spec.md` (tablas
`customers` y `monthly_plans`).

### Segundo bug, destapado al reintentar: "Ya existe un cliente con ese documento"

Con el RLS ya corregido, guardar sin elegir cliente falló con ese mensaje.
Causa: `ensureDefaultCustomer` buscaba al Cliente General con
`pagination: { pageSize: 1 }`, pero `ListCustomersUseCase` rechaza cualquier
pageSize menor a 10 con `ValidationFailure`. El `fold` descartaba esa falla
como "no encontrado", así que siempre caía a crear el cliente — y ahí chocaba
con el UNIQUE de documento. Antes del fix de RLS el síntoma no se veía porque
el INSERT moría antes por permisos; el primer intento tras la migración sí
creó el Cliente General (13:48 UTC), y desde entonces el error era fijo.

El mismo patrón estaba en `executive-dashboard.page.ts`: los dos contadores de
mensualidades (activas y por vencer) pedían `pageSize: 1` y por eso mostraban
0 siempre, sin error visible.

Archivos tocados en `parqueadero-web`:
- `features/monthly-plans/presentation/components/monthly-plan-edit-dialog.component.ts`
  — pageSize 10, match exacto por documento y la falla de búsqueda ya no se
  traga en silencio.
- `features/dashboard/presentation/pages/executive-dashboard.page.ts` — pageSize 10
  en ambas consultas (solo usan `pagination.total`, el tamaño da igual).

`npx ng build` pasa limpio (solo el warning preexistente de `qz-tray`).

### Auditoría completa del flujo de mensualidades (front + Supabase)

Estado de partida: `monthly_plans` tiene 0 filas. Ningún bug de datos ha
alcanzado a morder todavía; se corrige antes de que haya historia que arreglar.

**Corregido en esta sesión (además del RLS y el pageSize):**

`00039_revoke_anon_on_views.sql` — las 4 vistas (`v_revenue_daily`,
`v_audit_log`, `v_operator_performance`, `v_sessions_by_type`) eran legibles
SIN login, con solo la anon key que va dentro del bundle JS publicado.
Verificado con `curl` antes y después: antes devolvía todos los pagos con
monto, método, día, operador y turno, y el audit log con los before/after JSON;
ahora responde `42501 permission denied`. Causa: las vistas son de `postgres`
(BYPASSRLS) y ninguna se creó con `security_invoker`, así que resuelven
permisos como owner y las policies de las tablas base nunca se evalúan; lo
único que gobernaba era el GRANT, y Supabase se lo da a `anon` por defecto.
Las tablas base sí estaban protegidas (`payments` como anon devolvía `[]`).

### Fixes de la auditoría (aplicados)

**Bloque 1 — Fechas civiles.** Se agregaron `parseIsoDateOnly`,
`formatIsoDateOnly` y `todayDateOnlyBogota` a `shared/utils/date.utils.ts` y
se usan en todo el flujo. Una columna DATE es un día del calendario, no un
instante: `new Date('2026-08-11')` la lee como medianoche UTC y en Colombia
retrocede al día 10. Cambios: `monthly-plan.model.ts` (mapper),
`monthly-plan.entity.ts` (`isCurrentlyActive` y `daysUntilExpiry` comparan
por día, ambos extremos inclusivos), `parking-remote.datasource.ts`
(`getActivePlanByPlate` usa `todayIsoBogota()`, filtra también por
`start_date` y ordena + `limit(1)` para no romper la ENTRADA si hubiera dos
planes), `monthly-plan-remote.datasource.ts` (serialización y cálculo de
status), diálogo y página. En el buscador del dashboard, una mensualidad
vencida ahora se pinta "VENCIDA el <fecha>" en rojo en vez de "Plan vence:".

**Bloque 2 — Renovación.** `hasActivePlanForPlate` filtra por
`end_date >= hoy`: un plan vencido ya no bloquea la venta de la placa.

**Bloque 3 — `00040_monthly_plans_integrity.sql`:**
- `monthly_plans_no_overlap`: EXCLUDE con `daterange` + btree_gist. La regla
  "una placa = una mensualidad vigente" pasa a vivir en la BD. Se eligió
  EXCLUDE y no UNIQUE porque lo que no puede repetirse es el solapamiento de
  fechas: renovar por anticipado con rangos consecutivos debe seguir siendo
  legal.
- `create_monthly_plan_with_payment` reescrita (reemplaza la de 00025, que
  nunca se llamó): agrega `gateway_ref`, calcula el status, valida turno
  abierto, es idempotente por `client_op_id` y traduce el choque del EXCLUDE
  a `plan_overlap`. Sigue SECURITY INVOKER para que RLS aplique.
- `refresh_monthly_plan_statuses()` + job de pg_cron
  `refresh-monthly-plan-statuses` a las 05:10 UTC (00:10 Bogotá).

**Bloque 4 — Front cableado a la RPC.** El contrato del repositorio ya no
tiene `create`; ahora es `createWithPayment(params, shiftId)`. El use case
dejó de inyectar `PaymentRepository` y de tragarse el fallo del pago. Los
errores de la RPC se traducen a Failures de dominio, incluido el 42501 de
RLS, que antes llegaba al operador como "Error del servidor".

Verificado contra la BD remota, todo en transacciones con ROLLBACK y con el
claim de operador: venta normal; venta de un plan que vence HOY (el caso que
antes cobraba) que la consulta de entrada sí ve; solapamiento rechazado con
`plan_overlap` incluso escribiendo la placa en minúsculas; renovación
consecutiva permitida; turno cerrado rechazado con `shift_not_open`; ingreso
en la caja con su `gateway_ref`. `ng build` y `ng lint` limpios; specs
`create-monthly-plan.spec.md` y `database-schema.spec.md` actualizadas.

**Hallazgos verificados que siguen abiertos (requieren decisión):**

1. MEDIO — `auto_renew` no hace nada: la edge function `renew-monthly` NO está
   desplegada (`supabase functions list` solo devuelve `qz-sign` y
   `report-export`). Ahora que existe el job de estados, ya hay planes en
   `expired` que la función podría tomar, pero seguiría sin crear el `payments`
   de la renovación. Mientras no se resuelva, la casilla de la UI promete algo
   que no ocurre: conviene ocultarla o implementar la renovación completa.
2. MEDIO — Anular o cancelar no cierra el círculo. `00028_void_shift_payment`
   no toca el plan cuando `session_id IS NULL` (anular el pago deja la placa
   con mensualidad vigente sin haber pagado), y `cancel-monthly-plan.usecase.ts`
   no genera contrapartida en caja.
3. MEDIO — Reportes: `v_sessions_by_type` arranca `FROM parking_sessions`
   (verificado con `pg_get_viewdef`), así que la venta de mensualidad no está
   ahí, mientras que `v_revenue_daily` sí la trae por LEFT JOIN. Los dos KPIs
   de "Ingresos" de la misma pantalla no cuadran. Y el filtro por tipo de
   vehículo (`report-remote.datasource.ts:35`) descarta las mensualidades,
   que tienen `vehicle_type` NULL.
4. MEDIO — `cashier-remote.datasource.ts:142` usa `users!inner(nombre)` y la
   policy `users_operador_read_own` limita al operador a su propia fila.
   Latente hoy: verificado que los 36 turnos son del mismo operador, así que
   ve todo. Muerde el día que el admin abra un turno.
5. MEDIO — Las vistas siguen sin `security_invoker`: cualquier usuario
   logueado las lee completas sin importar su rol (un operador puede ver
   `v_audit_log` entero). Cerrarlo exige revisar las policies de las tablas
   base primero, o los reportes del operador se vacían.
6. MEDIO — `payments-history.page.ts:271` filtra por placa sobre un embed que
   no es `!inner`. En PostgREST eso no descarta las filas padre: la búsqueda
   devuelve todos los pagos del rango con la placa en blanco. No alcancé a
   comprobarlo con una petición real (el classifier bloqueó el uso de la
   service_role key); la semántica de PostgREST está documentada.
7. MENOR — Divergencia de montos: editar el `amount_cents` del plan no toca
   el payment, y `00036_correct_shift_payment_amount` corrige el payment sin
   tocar el plan.

**Sin problema (verificado):** el cuadre de caja incluye la mensualidad
(`listByShift` no hace join con sesiones); la salida gratis del mensualista
funciona y el diálogo impide cobrarle; `cancel()` marca `_deleted` y todos los
lookups lo respetan; el IVA no se duplica (todo es precio con IVA incluido);
el hook de JWT `user_role` está activo (las policies responden en las pruebas
con claim simulado y la operación diaria del operador lo demuestra).

## Decisiones
- Se le dio UPDATE al operador además de INSERT: la misma pantalla expone
  "editar" y "cancelar" para el usuario que acaba de vender, y sin UPDATE
  chocaría contra la misma pared apenas se equivoque en una fecha. El DELETE
  físico sigue vedado — el borrado es lógico y queda en `audit_log`.
- INSERT en `customers` entra en el mismo fix porque el diálogo de venta crea
  el cliente inline; sin eso, vender a un cliente nuevo seguía fallando.
- No se re-sembraron las tarifas de mensualidad (ver pendientes): los precios
  son dato de negocio y no me corresponde inventarlos.

## Bloqueos / Pendientes
- **No hay tarifa de mensualidad configurada.** La tabla `tariffs` solo tiene
  `hora` para carro (3.400) y moto (2.600). El seed de mensualidades de la
  migration 00013 ya no está en la base. Consecuencia: el diálogo no
  autocompleta el valor y el operador debe digitarlo en cada venta.
  Se configura en `/tariffs` entrando como admin (unidad `mensualidad`).
- El mensaje de error genérico de la UI ("Error del servidor") esconde los
  fallos de RLS y volvió el diagnóstico ciego desde el front.

## Next Steps
- [ ] **Desplegar el front** (`firebase deploy --only hosting`): sin esto no
      llegan al usuario ni el fix del Cliente General ni todo el bloque de
      fechas. Las migraciones 00038/00039/00040 ya están en producción.
- [ ] Cargar las tarifas de mensualidad por tipo de vehículo desde `/tariffs`
      (requiere login admin; los precios los define el negocio)
- [ ] Resolver los 7 hallazgos abiertos listados arriba, empezando por el
      cierre del círculo al anular/cancelar (punto 2), que es el único con
      impacto directo en la plata
- [ ] Barrer el resto de `pageSize` programáticos: el contrato "10–100" de los
      use cases de listado es una guarda pensada para paginación de UI y
      cualquier consulta que solo quiera un conteo cae en la misma trampa
- [ ] Extender el mapeo del código PG `42501` a los demás datasources (ya está
      hecho en `monthly-plan-remote.datasource.ts`), para que la UI diga "no
      tienes permiso" en vez de "error del servidor"
