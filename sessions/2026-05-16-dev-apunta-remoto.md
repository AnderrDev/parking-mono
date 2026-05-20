# Sesión: Apuntar entorno dev al Supabase remoto

**Fecha:** 2026-05-16
**Subproyecto(s):** parqueadero-web
**Estado:** completada

## Objetivos
- [x] Verificar que el admin sembrado el 2026-05-15 quedó OK en remoto.
- [x] Cambiar `environment.ts` (dev) para que apunte al proyecto remoto en vez de `127.0.0.1:54321`.

## Avance

1. **Admin verificado en remoto** vía Management API:
   - `id`: `43fbb38d-0cb8-48ed-a3aa-9e42f04e37c0`
   - `email`: `ander22425@gmail.com`
   - `role`: `admin`, `is_active=true`, `email_confirmed_at` no nulo.

2. **`parqueadero-web/src/environments/environment.ts`** actualizado:
   - `supabaseUrl` → `https://hhwctcjwrlbqgsrfriqn.supabase.co`
   - `supabaseAnonKey` → la anon key del remoto (misma que `environment.prod.ts`).
   - Comentario explicativo añadido: dev YA NO usa `supabase start` por default. Para trabajar contra local, sobreescribir manualmente (no commitear).

3. **Build `ng build`** exitoso (5.9s, sin errores nuevos). Warning de bundle size es preexistente.

## Decisiones

- **Dev = prod (mismo backend)**: simplifica QA inmediato pero implica que toda escritura desde `ng serve` impacta data productiva. Aceptable mientras no haya proyecto staging separado y mientras la app esté en pre-lanzamiento (sin usuarios reales aún).

## Bloqueos / Pendientes

- Crear proyecto staging separado en Supabase cuando el negocio entre a operar (para que dev no toque la BD viva).

## Debug: 500 "Database error querying schema" en login

Al intentar el primer login real desde `ng serve`, el endpoint `/auth/v1/token?grant_type=password` devolvió 500 con `code: unexpected_failure, msg: "Database error querying schema"`.

**Diagnóstico** (en orden):
1. Hipótesis inicial: el JWT hook fallaba. Deshabilité `hook_custom_access_token_enabled`. Resultado: mismo error → el hook NO era la causa.
2. Verifiqué triggers en `auth.users` → ninguno.
3. Verifiqué funciones que referencian `auth.users` → ninguna.
4. Inspeccioné el row del usuario: campos `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change` estaban en NULL (los dejó así mi INSERT directo de ayer).
5. **Causa:** GoTrue moderno asume NOT NULL en esos campos y falla la query interna con NULL aunque el schema lo permita.

**Fix:** `UPDATE auth.users SET <campos> = COALESCE(<campos>, '') WHERE email = ...`. Login OK al primer intento después del UPDATE.

**Confirmado al final:** login OK con hook habilitado. JWT decodificado trae `user_role: "admin"` y `role: "authenticated"` — perfecto para que PostgREST + las RLS policies funcionen.

Aprendizaje guardado en memoria como `supabase-auth-users-insert`.

## Capa 1 de tarifa-gating en ingreso de vehículos

Bug reportado: el operador podía registrar entrada de moto y al cobrar fallaba con "No hay tarifa activa para tipo de vehículo: moto". Causa raíz: el form de entrada interpretaba `availableTypes === []` como "cargando" (deja entrar todos) en vez de "cargado y sin tarifa".

Spec: `parqueadero-web/specs/features/parking/tariff-gated-vehicle-entry.spec.md`.

Cambios:
- `operator-dashboard.page.ts`: nuevo `tariffsLoaded` signal; `availableTypesForEntry` devuelve `null` mientras carga, `[]` cuando termina sin tarifas, `[...]` con tipos. Pasa `isAdmin` al modal.
- `vehicle-entry-modal.component.ts`: recibe `isAdmin`, inyecta `Router`, navega a `/tariffs?prefill=<tipo>` cuando el form pide crear tarifa.
- `vehicle-entry-form.component.ts/html/scss`:
  - `isLoadingTariffs()`, `hasNoTariffs()`, `selectedVehicleTypeUnavailable()` para los 4 estados.
  - Chips en skeleton (shimmer) durante load; chip atenuado con tooltip si falta tarifa para ese tipo.
  - Banner ámbar inline al seleccionar tipo sin tarifa o cuando no hay ninguna. Si admin: botón "Crear tarifa de Moto →". Si operador: mensaje pasivo.
  - `onSubmit()` rechaza si tipo no está disponible (defensa en profundidad).
  - Submit deshabilitado en estados inválidos.
- `tariffs-list.page.ts`: lee `?prefill=<vehicle_type>`, consume el query param (replaceUrl) y auto-abre el dialog de creación.
- `tariff-edit-dialog.component.ts`: `TariffDialogData.prefillVehicleType` opcional; el form se crea con `vehicleType` prellenado solo en modo create.

Validación: `ng build --configuration=development` ✓ (4.3s, sin errores). Falta validación manual en `ng serve` contra remoto.

Fuera de alcance (Capas 2 y 3 quedan en backlog del spec): persistir `tariff_id` en `parking_sessions` al ingresar; matriz de cobertura `(tipo × unidad)` en admin; crear tarifa con múltiples unidades desde un solo form.

## Next Steps
- [x] Probar login real con `ander22425@gmail.com` — ✓ FUNCIONA.
- [ ] QA manual de la Capa 1: validar los 4 estados del form (cargando, sin tarifas, tipo bloqueado, tipo permitido) y el flujo del link admin → tariffs.
- [ ] Cambiar `site_url` en Auth → URL Configuration del dashboard al dominio del frontend cuando exista.
- [ ] Cuando se cree staging: replicar las 20 migraciones y poblar `environment.staging.ts`.
