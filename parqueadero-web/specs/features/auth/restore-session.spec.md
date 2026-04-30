# Spec: Restore Session

## Identificador
`auth/restore-session`

## Descripción
Al iniciar (o recargar) la app, se verifica si existe una sesión válida persistida por Supabase y se restaura el estado de autenticación sin que el usuario tenga que volver a hacer login.

## Actor
Sistema (se ejecuta automáticamente al iniciar la app)

## Pre-condiciones
- La app acaba de iniciar (bootstrap) o la página fue recargada.
- Supabase persiste la sesión en `localStorage` automáticamente tras el login.

## Input (Params)
`NoParams` — se invoca desde `APP_INITIALIZER` o el constructor de `AuthStateService`.

## Output (Result)
| Caso    | Tipo          | Descripción                                              |
|---------|---------------|----------------------------------------------------------|
| Éxito   | `UserEntity \| null` | Usuario si hay sesión válida, `null` si no hay  |
| Failure | `ServerFailure`     | Error al refrescar el token con Supabase         |
| Failure | `NetworkFailure`    | Sin conexión y el token local está expirado      |

## Reglas de Negocio
1. Si existe sesión local y el token no está expirado → usar directamente sin llamada remota.
2. Si el token está próximo a expirar (< 60s) o ya expiró → intentar `refreshSession()` de Supabase.
3. Si `refreshSession()` falla por red → retornar `NetworkFailure`; el guard redirigirá a login.
4. Si `refreshSession()` falla por token revocado (401) → limpiar sesión local y retornar `null`.
5. El claim `role` debe estar presente en el JWT restaurado. Si falta → tratar como sesión inválida.
6. Esta operación es **no bloqueante**: la app no espera su resultado para renderizar el shell; el guard evalúa el estado resultante.

## Flujo Principal
1. `AuthStateService` se instancia en bootstrap.
2. Llama `SupabaseService.client.auth.getSession()`.
3. Si hay sesión válida con `role` → `Right(UserEntity)` → signals actualizados.
4. Si no hay sesión → `Right(null)` → usuario no autenticado.
5. Suscribe a `onAuthStateChange` para mantener el estado sincronizado en tiempo real (cambios de token, logout en otra pestaña).

## Edge Cases
- **Múltiples pestañas**: `onAuthStateChange` propaga el logout de una pestaña a las demás automáticamente.
- **Token expirado y offline**: app inicia sin sesión; al volver online, Supabase no refresca automáticamente — el usuario debe hacer login manual.
- **`role` ausente en token restaurado**: hook no configurado o config.toml desactualizado → `ServerFailure('JWT restaurado sin claim role')` → logout forzado + toast de error.
- **Primera visita** (sin sesión previa): `getSession()` retorna `null` → `Right(null)` → guard redirige a `/auth/login`.

## Dependencias
- `AuthRemoteDataSource.getSession()`
- `SupabaseService.client.auth.getSession()`
- `SupabaseService.client.auth.onAuthStateChange()`
- `AuthStateService` (actualizar signals)

## Mapping a UI
- **Invocación**: automática en `AuthStateService` constructor — no tiene pantalla propia
- **Estado de carga**: el shell muestra `LoadingSpinnerComponent` full-page durante la verificación inicial (< 500ms normalmente)
- **Resultado**: si `null` → `authGuard` redirige a `/auth/login`; si `UserEntity` → app navega a la ruta solicitada
