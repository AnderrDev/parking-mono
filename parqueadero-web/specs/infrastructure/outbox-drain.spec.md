# Spec: Outbox Drain Policy

## Propósito

Definir cómo el `SyncOrchestrator` consume la cola FIFO de mutaciones
pendientes (`outbox`) y las aplica contra Supabase, garantizando
idempotencia, orden de eventos por entidad y resiliencia ante fallos
transitorios.

Sprint 0 SOLO entrega el método `drain()` como stub que actualiza
`syncing` y retorna. La lógica descrita aquí se implementa en Sprint 2.

## Garantías

1. **FIFO global**: los items se procesan en orden de `enqueuedAt` ASC.
2. **Idempotencia**: cada item tiene `opId` (UUID v4 cliente). El backend
   debe tolerar reintentos con el mismo `opId`. En Sprint 2 se decidirá
   si pasar el `opId` como header `X-Op-Id` o como columna `_op_id` en
   las tablas mutables.
3. **At-least-once**: una mutación puede llegar al backend más de una vez
   si la red corta entre el commit remoto y la confirmación local. La
   idempotencia evita duplicados.
4. **Drain único**: solo un drain corre a la vez. `syncing` previene
   re-entrancia.

## Disparadores

- Transición `offline → online` detectada por `NetworkInfoService.isOnline$`.
- Boot de la app con `pendingCount > 0`.
- Llamada manual a `SyncOrchestrator.drain()` desde el banner (botón
  "Reintentar ahora" — Sprint 3).
- Tick periódico cada 30s mientras hay items `pending` con
  `nextAttemptAt <= now`.

## Algoritmo (a implementar en Sprint 2)

```
drain():
  if syncing() then return
  syncing.set(true)
  try:
    while online and outbox has items where status=pending and nextAttemptAt<=now:
      item = outbox.orderBy(enqueuedAt).first()
      item.status = 'in_flight'; persist()
      result = await apply(item)   // POST/PATCH/DELETE a Supabase
      switch result.statusCode:
        case 200/201:
          await mirrorApply(item)  // refresca el mirror local
          outbox.delete(item.opId)
          lastSyncAt.set(now)
        case 409:                  // conflicto
          item.status = 'conflict'
          conflicts.add({ opId, table, localPayload, serverPayload, detectedAt: now, reason })
          conflictCount = re-count
        case 4xx (no 409):         // input inválido / RLS
          item.status = 'failed'
          item.lastError = body.message
        case 5xx, network error:
          item.status = 'pending'
          item.attempts += 1
          item.nextAttemptAt = now + backoff(item.attempts)
        case other:
          item.status = 'failed'
          item.lastError = `unexpected: ${result.statusCode}`
      persist(item)
      refreshPendingCount()
  finally:
    syncing.set(false)
```

## Backoff exponencial

Fórmula (Sprint 2):
```
backoff(n) = min(MAX_DELAY, BASE * 2^(n-1)) + jitter(0..500ms)
BASE = 1000 ms
MAX_DELAY = 30_000 ms
```

| attempts | delay base | con jitter           |
|----------|------------|----------------------|
| 1        | 1 s        | 1.0 – 1.5 s          |
| 2        | 2 s        | 2.0 – 2.5 s          |
| 3        | 4 s        | 4.0 – 4.5 s          |
| 4        | 8 s        | 8.0 – 8.5 s          |
| 5        | 16 s       | 16.0 – 16.5 s        |
| 6+       | 30 s (cap) | 30.0 – 30.5 s        |

Tras `attempts >= 10` el item pasa a `failed` automáticamente y requiere
intervención manual.

## Mapeo de respuesta HTTP

| Código        | Caso                                | Acción outbox                          |
|---------------|-------------------------------------|----------------------------------------|
| 200, 201, 204 | Mutación aceptada                   | Borrar del outbox, refrescar mirror    |
| 400, 422      | Validación servidor                 | `status='failed'`, exponer en UI       |
| 401, 403      | Sesión expirada / RLS bloqueó       | `status='failed'`; orquestador detiene drain y emite evento `unauthorized` |
| 404           | Row no existe (update/delete)       | `status='failed'`                      |
| 409           | Conflicto (constraint o vista stale)| `status='conflict'`, anotar en `conflicts` |
| 429           | Rate limit                          | Backoff x2 sobre la fórmula base       |
| 5xx           | Error servidor                      | Backoff normal                         |
| Network error | Sin red, timeout, CORS              | `status='pending'`, backoff normal     |

## Idempotencia por entidad

| Tabla              | Identificador                         | Garantía                                    |
|--------------------|---------------------------------------|---------------------------------------------|
| `parking_sessions` | `id` (UUID generado offline) + `uq_sessions_active` (placa+status) | Reintento del mismo insert da 409 si ya existe; el cliente compara `id` |
| `payments`         | `id` (UUID generado offline)          | Reintento da 409 por PK duplicada → tratar como éxito |
| `cashier_shifts`   | `id` (UUID generado offline)          | Idem; `uq_shifts_open_per_user` puede generar 409 legítimo |
| `cash_withdrawals` | `id` (UUID generado offline)          | Idem                                        |

NOTA: En Sprint 2 se evaluará si conviene un endpoint Edge Function
`apply-outbox` que reciba el `opId` y haga `INSERT ... ON CONFLICT DO NOTHING`
para evitar el manejo cliente del 409 por duplicado.

## Orden por entidad

Para una misma `vehicle_plate`, los items DEBEN procesarse en el orden
de `enqueuedAt`: un `entry` antes que su `exit`. Como la cola es FIFO
global, esto se respeta naturalmente. Si en el futuro se paraleliza el
drain, se debe agrupar por `vehicle_plate`.

## Failure handling cross-cutting

- Si el drain encuentra 3+ items `pending` con `attempts > 5` seguidos,
  emite evento `sync_degraded` (Sprint 3 lo consume el banner).
- Si `outbox.count() > 200`, emite evento `outbox_overflow`. Operación
  futura: bloquear nuevas mutaciones offline.
- Si el JWT expira durante el drain, el drain se detiene y se reintenta
  tras `RestoreSessionUseCase` o login.

## Consideraciones de seguridad

- El drain corre con el JWT actual del usuario. Cualquier RLS denegado
  marca `failed`; nunca se reintenta indefinidamente una operación que
  el servidor rechaza por permisos.
- Los payloads pueden contener montos en centavos. No se modifican en
  cliente entre enqueue y drain.

## Decisiones cerradas

1. Server-wins en conflictos. No auto-resolución.
2. Cola FIFO global por `enqueuedAt`. No prioridades.
3. Cap de reintentos: 10. Después `failed`.
4. Backoff exponencial con jitter, cap 30s.
5. Drain no concurrente (un solo bucle a la vez).

## Sprint 0 vs Sprint 2

- Sprint 0: `drain()` es un stub que solo gestiona el flag `syncing`.
- Sprint 2: implementación completa según esta spec.
