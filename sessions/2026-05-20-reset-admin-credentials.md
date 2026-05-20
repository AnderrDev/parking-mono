# Sesión: Reset de credenciales del admin productivo

**Fecha:** 2026-05-20
**Subproyecto(s):** parqueadero-backend
**Estado:** completada

## Objetivos
- [x] Cambiar email del admin de `ander22425@gmail.com` a uno genérico (`admin@parqueadero.com`).
- [x] Setear password temporal conocida para destrabar login.
- [x] Mantener consistencia entre `auth.users` y `public.users`.

## Avance

1. **Diagnóstico** vía MCP Supabase (`execute_sql` read-only):
   - `auth.users` del admin (`id=43fbb38d-…`) tenía todos los campos token en `''` (no NULL), `email_confirmed_at` OK. El fix preventivo de COALESCE (memoria `supabase-auth-users-insert`) no aplicaba.
   - `public.users` del mismo id: `role=admin`, `is_active=true`. OK.
   - `raw_app_meta_data` del row de auth NO contiene `role:"admin"` — el JWT hook lee de `public.users.role`, así que no impacta el login.

2. **UPDATE ejecutado por el usuario en el dashboard SQL Editor** (proyecto `hhwctcjwrlbqgsrfriqn`):
   ```sql
   BEGIN;
   UPDATE auth.users
   SET email = 'admin@parqueadero.com',
       encrypted_password = extensions.crypt('ParqueaderoAdmin2026!', extensions.gen_salt('bf')),
       updated_at = now()
   WHERE id = '43fbb38d-0cb8-48ed-a3aa-9e42f04e37c0';

   UPDATE public.users
   SET email = 'admin@parqueadero.com'
   WHERE id = '43fbb38d-0cb8-48ed-a3aa-9e42f04e37c0';
   COMMIT;
   ```
   - Razón por la que no lo aplicó el MCP: el server estaba corriendo con `--read-only`. `pgcrypto` además vive en schema `extensions/`, hay que calificar `extensions.crypt(...)` y `extensions.gen_salt('bf')`.

3. **Verificación post-cambio** (vía MCP): `auth_email = public_email = admin@parqueadero.com`, `role=admin`, `is_active=true`, `confirmed=true`, `updated_at=2026-05-20 18:50:24+00`.

## Decisiones

- **Email final `admin@parqueadero.com`** (elegido por el usuario sobre `.local` y `operador@`). Es un dominio real comprable; futura recovery por mail funcionará si se configura SMTP y se posee el dominio.
- **Password temporal `ParqueaderoAdmin2026!`**: cumple longitud + clases. Debe rotarse desde la app al primer login.
- **No registrar como migration**: el cambio es seed mutable, no schema. Ejecutado one-off en el dashboard; queda fuera de `supabase/migrations/`.
- **MCP queda en write mode** (acción del usuario via `claude mcp remove/add` sin `--read-only`). Trade-off aceptado: clasificador de auto mode sigue siendo la red de seguridad. Cuando exista staging, reapuntar el `--project-ref` para que el write mode no toque prod.

## Bloqueos / Pendientes

- Ninguno.

## Next Steps

- [ ] Login real desde `ng serve` con `admin@parqueadero.com / ParqueaderoAdmin2026!` y rotar la password desde la app.
- [ ] Cuando se cree el proyecto staging en Supabase, mover el MCP `--project-ref` a staging para que el write mode no opere sobre prod.
- [ ] Configurar SMTP en el proyecto Supabase para habilitar recovery por email contra `admin@parqueadero.com`.
