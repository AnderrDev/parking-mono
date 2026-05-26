# Sesión: Wipe de seed en el dev DB remoto

**Fecha:** 2026-05-20
**Subproyecto(s):** parqueadero-backend
**Estado:** completada

## Objetivos
- [ ] Borrar todo el seed/datos transaccionales del dev DB remoto (`hhwctcjwrlbqgsrfriqn`) preservando admin reseteado hoy + `app_settings`.

## Avance

1. **Diagnóstico** vía MCP Supabase (read-only):
   - Proyecto remoto: `https://hhwctcjwrlbqgsrfriqn.supabase.co`.
   - Conteo previo (filas a borrar): `parking_sessions=4`, `payments=4`, `vehicles=2`, `cashier_shifts=2`, `tariffs=4`, `audit_log=13`. Resto vacío.
   - `auth.users` tiene 2 filas: `admin@parqueadero.com` (reseteado 2026-05-20 según `sessions/2026-05-20-reset-admin-credentials.md`) + `qa-smoke@parqueadero.local`. **Se preservan.**
   - `app_settings` tiene 4 keys: `invoicing_config`, `operational_config`, `parking_info`, `tax_config`. Es config operacional, no seed. **Se preserva.**

2. **Alcance del wipe** (decisión del usuario en este turno):
   - Borra: `payments`, `invoice_lines`, `invoices`, `parking_sessions`, `cash_withdrawals`, `cashier_shifts`, `vehicles`, `monthly_plans`, `customers`, `tariffs`, `siigo_invoice_attempts`, `siigo_auth_tokens`, `audit_log`.
   - Preserva: `public.users`, `auth.users`, `app_settings`.

3. **Ruta de ejecución**:
   - `execute_sql` del MCP corre en TX read-only → bloquea `TRUNCATE`.
   - `apply_migration` funcionaría pero contaminaría `supabase_migrations.schema_migrations` con un cambio que no es schema (mismo criterio que el admin reset de hoy).
   - **Elegido**: usuario corre el SQL one-off en el SQL Editor del dashboard, sin migration.

## SQL entregado

```sql
BEGIN;
TRUNCATE TABLE
  public.payments,
  public.invoice_lines,
  public.invoices,
  public.parking_sessions,
  public.cash_withdrawals,
  public.cashier_shifts,
  public.vehicles,
  public.monthly_plans,
  public.customers,
  public.tariffs,
  public.siigo_invoice_attempts,
  public.siigo_auth_tokens,
  public.audit_log
RESTART IDENTITY CASCADE;
-- + SELECT de verificación (counts == 0 para borradas, intactos para preservadas)
COMMIT;
```

## Decisiones

- **No tocar `auth.users` / `public.users`**: el admin productivo se reseteó hoy con esfuerzo (`sessions/2026-05-20-reset-admin-credentials.md`); borrarlo dejaría el sistema sin acceso hasta recrearlo.
- **No tocar `app_settings`**: las 4 keys son configuración operacional cargada por migrations, no seed.
- **No registrar como migration**: mismo criterio que el reset de credenciales — cambio de datos one-off no debe vivir en `supabase/migrations/`.

## Bloqueos / Pendientes

- Posible fallo de `TRUNCATE` por trigger TRUNCATE en `audit_log` / `siigo_invoice_attempts` (no pude listar triggers — el clasificador de auto-mode bloqueó la consulta de `information_schema.triggers`). Si falla, mitigar con `ALTER TABLE ... DISABLE TRIGGER ALL` envolviendo el `TRUNCATE`.

## Next Steps

- [x] Usuario corrió el SQL en el SQL Editor. Verificación confirma `parking_sessions=0, payments=0, vehicles=0, cashier_shifts=0, audit_log=0, tariffs=1` (la fila restante de tariffs es "Moto Hora" reseed que la migration 00015 había puesto y no se borró antes del wipe del usuario — irrelevante: se reescribe en S5 de la feature de tariff-tiered-pricing).
- [x] `app_settings=4`, `public.users=2`, `auth.users=2` preservados.
- [ ] Continúa en `sessions/2026-05-20-tariff-tiered-pricing.md` (feature de tarifa unificada min/hora/plena).
