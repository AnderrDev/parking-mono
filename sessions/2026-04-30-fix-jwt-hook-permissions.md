# Sesión: Fix — JWT hook sin permisos en public.users

**Fecha:** 2026-04-30  
**Subproyecto(s):** parqueadero-backend  
**Estado:** completada

## Objetivos
- [x] Diagnosticar "Error del servidor. Intenta más tarde." en login
- [x] Crear migración con GRANT SELECT para supabase_auth_admin
- [x] Verificar que el login funciona tras el fix

## Avance

### Diagnóstico
- Supabase local corriendo en 127.0.0.1:54321.
- `auth.users` y `public.users` tienen el admin correctamente.
- `curl` al endpoint de login devuelve `500 "Database error querying schema"`.
- Causa raíz: la función `public.custom_access_token_hook` (migración 00005) corre
  como `supabase_auth_admin`, pero ese rol no tiene `SELECT` sobre `public.users`.
- La migración 00005 concedió `EXECUTE` a la función pero omitió el `GRANT SELECT`
  necesario para que la función pueda leer la tabla.

## Decisiones
- Nueva migración `00008_fix_jwt_hook_permissions.sql` en lugar de editar 00005 (que
  ya fue aplicada en dev; editar migraciones pasadas rompe idempotencia).

## Avance (continuación)
- [x] Error real: `sql: Scan error on column index 8, name "email_change": converting NULL to string is unsupported`
  — GoTrue (v2.34.x+) escanea `email_change` esperando string no-NULL; el seed lo dejaba NULL.
- [x] Fix inmediato: `UPDATE auth.users SET email_change = '' WHERE email_change IS NULL`.
- [x] Fix permanente: `seed.sql` ahora incluye `email_change = ''` en el INSERT de auth.users.
- [x] Migración `00008_fix_jwt_hook_permissions.sql`: SECURITY DEFINER + GRANT SELECT.
  (El SECURITY DEFINER es correcto pero no era la causa principal del error.)
- [x] Login verificado: JWT retorna `role: admin`. ✓

## Bloqueos / Pendientes
- Ninguno.

### Segunda ronda — claim `role` vs PostgREST
- [x] Diagnóstico: PostgREST intercepta `role` del JWT para hacer `SET ROLE` en PG.
      Como 'admin'/'operador'/'contador' no son roles PG, devolvía 401.
- [x] Migración `00009_user_role_claim.sql`:
      - Hook inyecta `user_role` en vez de `role` (32 policies DROP+CREATE).
      - JWT `role` queda como 'authenticated' para PostgREST.
- [x] `auth-remote.datasource.ts` — chequeos actualizados a `user_role`.
- [x] Migración 00008 actualizada para consistencia (usa `user_role`).
- [x] Verificado e2e: login → JWT `role=authenticated, user_role=admin` → REST /users OK.

## Next Steps
- [ ] Si se hace `supabase db reset`, el seed ahora es correcto y no necesita fix manual.
- [ ] Confirmar en prod (cuando exista) que `email_change` esté en el INSERT de auth.users.
