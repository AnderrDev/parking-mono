# Spec: Edge Function `siigo-poll-status` (cron)

## Identificador
`backend/edge-functions/siigo-poll-status`

## Descripción
Edge Function Supabase (Deno) invocada por un job de **`pg_cron`** (cada 30 s) que consulta el estado de las facturas no-terminales en Siigo y actualiza `invoices.siigo_status`. Implementa el camino asíncrono del flujo de emisión: `siigo-emit-invoice` deja la factura en `pending`/`InProcess`/`Sent` y este cron la lleva a `Stamped`/`Rejected` (o `error_max_retries` tras N intentos).

## Método y Ruta
`POST /functions/v1/siigo-poll-status`

## Autenticación
- **No** requiere JWT de usuario.
- Acepta solo requests con header `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`. El job `pg_cron` usa esta key (configurada como `app.service_role_key` via `ALTER DATABASE`).
- Cualquier otra autenticación → 401.

## Input
Sin body. Idempotente: invocaciones consecutivas no causan efectos duplicados gracias al filtro `siigo_last_attempt_at < now() - interval '20s'` en la función `get_invoices_for_polling`.

Opcional: query string `?limit=N` para pruebas manuales (default 20).

## Output (JSON Response)

### Éxito (200)
```typescript
{
  processed: number;           // facturas tomadas
  stamped: number;             // pasaron a Stamped
  rejected: number;            // pasaron a Rejected
  still_pending: number;       // siguen en pending/InProcess/Sent
  errored: number;             // network/5xx/429
  exhausted: number;           // pasaron a error_max_retries
  duration_ms: number;
}
```

### Errores
- `401` — falta o invalid service-role key.
- `503` — `getSiigoToken()` falla (Siigo Auth caído). El cron simplemente pasa el siguiente tick.

## Flujo

```
1. Validar header Authorization == SUPABASE_SERVICE_ROLE_KEY → 401 si no
2. token = await getSiigoToken()                              // ver _shared/siigo/auth.ts
3. invoices = await rpc('get_invoices_for_polling', { p_limit: 20 })
   ↳ La función filtra:
       siigo_status IN ('pending','InProcess','Sent')
       AND siigo_id IS NOT NULL                  // si está null, fue error de emisión inicial — no se puede polling, queda en pending hasta intervención
       AND siigo_attempts < SIIGO_POLL_MAX_RETRIES
       AND (siigo_last_attempt_at IS NULL
            OR siigo_last_attempt_at < now() - backoff_for(siigo_attempts))
       ORDER BY siigo_last_attempt_at NULLS FIRST
       LIMIT p_limit
       FOR UPDATE SKIP LOCKED
4. Para cada invoice (en serie, no paralelo, para no saturar Siigo rate limit):
   4.1. siigoFetch(`/v1/invoices/${invoice.siigo_id}`, { method:'GET' })
   4.2. Mapear response.stamp.status → siigo_status interno (ver tabla abajo)
   4.3. Construir UPDATE incremental:
        - siigo_attempts = siigo_attempts + 1
        - siigo_last_attempt_at = now()
        - Si nuevo status terminal (Stamped/Rejected): persistir siigo_number, siigo_cufe, siigo_cude, siigo_pdf_url, siigo_xml_url, siigo_qr_url, siigo_observations
        - Si pending/InProcess/Sent y attempts >= MAX_RETRIES → siigo_status='error_max_retries', siigo_last_error='exhausted retries'
   4.4. UPDATE invoices SET ... WHERE id = invoice.id
5. Return summary
```

## Mapping de estado Siigo → interno

| Siigo `stamp.status` | `siigo_status` interno |
|---|---|
| `Stamped` | `Stamped` (terminal éxito) |
| `Rejected` | `Rejected` (terminal fallo) |
| `Sent` | `Sent` |
| `InProcess` | `InProcess` |
| `Pending` | `pending` (no cambia, pero contabiliza intento) |
| desconocido | mantener anterior, log warning |

## Backoff (función helper SQL `backoff_for(attempts INT)`)

```
attempts = 0  → 0s   (procesar de inmediato)
attempts = 1  → 5s
attempts = 2  → 20s
attempts = 3  → 45s
attempts = 4  → 80s
attempts = 5  → 125s
...           → min(attempts² × 5, 300)s
attempts ≥ 30 → marcar error_max_retries en el siguiente tick
```

## Cron job (migration `00014_siigo_polling_cron.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'siigo-poll-every-30s',
  '30 seconds',
  $$
    SELECT net.http_post(
      url := current_setting('app.siigo_poll_url'),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    );
  $$
);
```

Setup post-deploy (manual una vez por entorno, NO commit en repo):
```sql
ALTER DATABASE postgres SET app.siigo_poll_url = 'https://<ref>.supabase.co/functions/v1/siigo-poll-status';
ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';
```

## Variables de entorno (Supabase secrets)

```
SIIGO_USERNAME
SIIGO_ACCESS_KEY
SIIGO_PARTNER_ID
SIIGO_BASE_URL=https://api.siigo.com
SIIGO_POLL_MAX_RETRIES=30
SIIGO_HTTP_TIMEOUT_MS=28000
```

## Rate limit y batch size

Siigo limita ~50 req/min (no oficial; confirmar con `soporteapi@siigo.com`).
- Frecuencia cron: 30 s → 2 ticks/min.
- Batch por tick: 20 → 40 req/min ≤ budget.
- En burst (muchas facturas pending), bajar la frecuencia a 60 s sin tocar código (vía `cron.alter_job`).

## Doble cron / race conditions

- `get_invoices_for_polling` usa `FOR UPDATE SKIP LOCKED` → si dos invocaciones del cron coinciden, se reparten las filas sin colisión.
- Filtro `siigo_last_attempt_at < now() - interval '20s'` en la función previene que un tick que demore tome los mismos invoices que el siguiente.

## Dependencias

- RPC `get_invoices_for_polling(p_limit INT)` (definida en migration `00013`).
- `siigo_auth_tokens` table.
- `siigo_invoice_attempts` table (auditoría).
- Helpers: `_shared/siigo/{auth,client,mapper}.ts`.
- Extensions: `pg_cron`, `pg_net`.

## Casos borde

- **Plan Supabase no incluye `pg_cron`**: fallback a Supabase Cron Jobs UI. Mismo URL, misma frecuencia. Documentar en runbook.
- **Token Siigo expirado mid-batch**: `siigoFetch` lo refresca transparentemente (helper `getSiigoToken` revalida si `expires_at - now() < 5min`).
- **Invoice con `siigo_id IS NULL`**: significa que `siigo-emit-invoice` falló antes de obtener id — no se puede poll. Queda en `pending` hasta que un admin intervenga (vía botón de UI "Reintentar emisión" o re-invocando `siigo-emit-invoice`).
- **Siigo cambia el shape del response**: el mapper es defensivo (lee con `?.` y `??`). Cualquier valor desconocido se loguea pero no crashea.
- **Postgres reinicia mientras el cron corre**: `pg_cron` reanuda. El batch en vuelo se pierde, pero la siguiente ejecución toma los mismos invoices (FOR UPDATE SKIP LOCKED libera el lock al disconnect).

## Verificación

```bash
# Forzar manualmente
curl -X POST https://<ref>.supabase.co/functions/v1/siigo-poll-status \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# Listar jobs activos
psql ... -c "SELECT jobid, schedule, command, active FROM cron.job WHERE jobname = 'siigo-poll-every-30s';"

# Ver últimas ejecuciones
psql ... -c "SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;"
```
