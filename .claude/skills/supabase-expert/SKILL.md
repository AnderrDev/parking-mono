---
name: supabase-expert
description: Supabase / PostgreSQL expert for the parqueadero-backend subproject. Use when writing migrations, RLS policies, Edge Functions (Deno), database triggers, Postgres types/constraints/indexes, JWT claims, Supabase Storage, or Realtime subscriptions. Triggers on prompts like "crea la migration X", "agrega la policy RLS", "edge function", "supabase", "RLS", "trigger", paths under parqueadero-backend/.
---

# supabase-expert — Supabase / PostgreSQL for parqueadero-backend

You are working in `parqueadero-backend/`. Read `parqueadero-backend/CLAUDE.md` and `specs/database-schema.spec.md` + `specs/rls-policies.spec.md` before any change.

## Hard Rules

1. **Spec first.** Schema or RLS change → update the spec, then write the migration. Never the reverse.
2. **RLS enabled on every user-data table.** Default DENY. If a table has no policies, no client can read/write. Period.
3. **Service role only inside Edge Functions.** Never ship the service-role key to the web client. Web uses anon key + JWT.
4. **Server assigns invoice numbers.** Never accept invoice number from client. Use a sequence or trigger.
5. **`audit_log` is append-only.** No `UPDATE`, no `DELETE`. Triggers write into it.
6. **Migrations are immutable once shipped.** New change → new file `00NNN_<slug>.sql`.

## Naming (enforce in every migration)

| Concept | Pattern | Example |
|---|---|---|
| Table | `snake_case`, plural | `parking_sessions` |
| Column | `snake_case` | `vehicle_plate` |
| PK | `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` | — |
| FK | `{singular}_id` | `customer_id` |
| Timestamps | `created_at`, `updated_at` (`TIMESTAMPTZ DEFAULT now()`) | — |
| Money | `*_cents BIGINT` (never `NUMERIC` for COP) | `amount_cents` |
| Soft delete | `_deleted BOOLEAN NOT NULL DEFAULT FALSE` | — |
| Sync flag | `_sync_status TEXT DEFAULT 'synced'` | `'synced' | 'pending' | 'conflict'` |
| Index | `idx_{table}_{cols}` | `idx_sessions_plate` |
| Unique | `uq_{table}_{cols}` | `uq_sessions_active` |
| Check | `chk_{table}_{rule}` | `chk_sessions_status` |

## Migration Skeleton

```sql
-- supabase/migrations/000N_<slug>.sql
-- Spec: specs/database-schema.spec.md §<section>

BEGIN;

CREATE TABLE parking_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_plate   TEXT NOT NULL,
  vehicle_type    TEXT NOT NULL CHECK (vehicle_type IN ('carro','moto','camion')),
  entry_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  exit_at         TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','cancelled')),
  entry_user_id   UUID NOT NULL REFERENCES auth.users(id),
  exit_user_id    UUID REFERENCES auth.users(id),
  tariff_id       UUID REFERENCES tariffs(id),
  monthly_plan_id UUID REFERENCES monthly_plans(id),
  amount_cents    BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  _deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  _sync_status    TEXT NOT NULL DEFAULT 'synced'
);

-- One active session per plate (partial unique)
CREATE UNIQUE INDEX uq_sessions_active
  ON parking_sessions (vehicle_plate)
  WHERE status = 'active' AND _deleted = FALSE;

CREATE INDEX idx_sessions_entry_user_date
  ON parking_sessions (entry_user_id, DATE(entry_at));

-- updated_at trigger
CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON parking_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE parking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY "operador_insert_own" ON parking_sessions
  FOR INSERT TO authenticated
  WITH CHECK (entry_user_id = auth.uid());

CREATE POLICY "operador_read_today_own" ON parking_sessions
  FOR SELECT TO authenticated
  USING (
    entry_user_id = auth.uid()
    AND DATE(entry_at AT TIME ZONE 'America/Bogota') = CURRENT_DATE
  );

CREATE POLICY "admin_all" ON parking_sessions
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- Audit trigger (append-only log)
CREATE TRIGGER trg_sessions_audit
  AFTER INSERT OR UPDATE OR DELETE ON parking_sessions
  FOR EACH ROW EXECUTE FUNCTION write_audit_log('parking_sessions');

COMMIT;
```

## RLS Patterns

- **Always pair USING (read) with WITH CHECK (write)**. A `FOR ALL` without both leaks data on writes.
- **Use `auth.uid()` for ownership**, `auth.jwt() ->> 'role'` for role gating. Both are signed; clients can't forge.
- **`FORCE ROW LEVEL SECURITY`** so the table owner is also subject to RLS (defends against connection-string leaks).
- **Time-zone aware date checks**: `DATE(ts AT TIME ZONE 'America/Bogota')` — Colombia is UTC-5 with no DST, but always be explicit.
- **Test every policy with each role** (admin, operador, contador, anon) before merging. Use `SET ROLE` + `SET LOCAL request.jwt.claims = '...'` in psql, or write a `tests/rls/<table>.test.sql` script.

## Edge Functions (Deno)

Path: `supabase/functions/<name>/index.ts`. One function per concern. Keep them small; business rules belong in the DB or in the web client's UseCase, not in functions.

Skeleton:
```ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,  // server-side only
    { global: { headers: { Authorization: authHeader } } }
  );

  // verify caller
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return new Response('Unauthorized', { status: 401 });

  // ... business logic ...

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});
```

Rules:
- **Never** return raw Postgres errors to client. Map to `{ error: { code, message } }`.
- Validate input with Zod or a hand-rolled guard before any DB call.
- Use the **service role key** only after authenticating the caller via the user JWT.
- Set `verify_jwt = true` in `supabase/config.toml` for functions that require auth.

## Sequential Invoice Numbers (canonical pattern)

```sql
CREATE SEQUENCE invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION assign_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.number IS NULL THEN
    NEW.number := 'FAC-' || TO_CHAR(now() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD')
                  || '-' || LPAD(nextval('invoice_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION assign_invoice_number();
```

(Reset/branch policy per fiscal year is in `specs/database-schema.spec.md`. Confirm before touching.)

## Local Dev Loop

```bash
supabase start                       # Postgres + Studio + functions runtime
supabase db reset                    # rebuild from migrations + seed.sql
supabase db diff -f 000N_<slug>      # generate migration from local changes
supabase functions serve <name>      # local function with hot reload
supabase db push --linked            # ship to remote
supabase functions deploy <name>     # ship function
```

## Self-check before finishing

- [ ] Spec updated **before** the migration.
- [ ] RLS enabled + at least one policy per role that should access the table.
- [ ] `WITH CHECK` on every `INSERT`/`UPDATE`/`ALL` policy.
- [ ] Indexes for any column used in WHERE of a hot query (sessions by plate, invoices by date, plans by end_date).
- [ ] No service-role key reachable from web client.
- [ ] Audit trigger added for sensitive tables.
- [ ] `BEGIN; ... COMMIT;` wrapper so migration is atomic.
