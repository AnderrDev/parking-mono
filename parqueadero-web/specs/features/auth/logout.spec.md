# Spec: Logout

## Identificador
`auth/logout`

## Descripción
El usuario cierra su sesión de forma explícita. La sesión se invalida en Supabase y el estado local se limpia.

## Actor
Operario, Admin (cualquier usuario autenticado)

## Pre-condiciones
- Existe una sesión activa en el dispositivo.

## Input (Params)
`NoParams` — no requiere parámetros.

## Output (Result)
| Caso    | Tipo            | Descripción                               |
|---------|-----------------|-------------------------------------------|
| Éxito   | `void`          | Sesión cerrada, estado limpiado           |
| Failure | `NetworkFailure`| Sin conexión (se cierra sesión local igualmente) |
| Failure | `ServerFailure` | Error de Supabase al invalidar el token   |

## Reglas de Negocio
1. Aunque falle la llamada remota (offline o error 5xx), la sesión local **siempre** se limpia (`AuthStateService` resetea signals).
2. El logout no requiere confirmación si no hay turno de caja abierto. Si hay turno abierto: mostrar `ConfirmDialog` advirtiendo que el turno quedará abierto.
3. Tras el logout, el router navega a `/auth/login`.
4. No se expone el error de red al usuario si el cierre local fue exitoso (es un detalle de implementación).

## Flujo Principal
1. Usuario presiona "Cerrar sesión" en el header/sidebar.
2. Si hay turno de caja abierto (verificado en `AuthStateService`) → `ConfirmDialog` con advertencia.
3. `LogoutUseCase.execute()` llama `AuthRemoteDataSource.signOut()`.
4. Independientemente del resultado remoto, `AuthStateService.clear()` resetea todos los signals.
5. Router navega a `/auth/login`.
6. Retorna `Right(void)`.

## Edge Cases
- **Offline**: `signOut()` falla con `NetworkFailure`, pero la sesión local se limpia igual. El token expirará en el servidor de forma natural.
- **Token ya expirado**: Supabase puede retornar 401 → igual se limpia local.
- **Turno de caja abierto**: mostrar advertencia; si el usuario confirma igual, se cierra sesión (el turno queda "colgado" — Fase 6 lo manejará).

## Dependencias
- `AuthRepository.logout()`
- `AuthRemoteDataSource.signOut()`
- `SupabaseService.client.auth.signOut()`
- `AuthStateService.clear()`

## Mapping a UI
- **Invocación**: botón "Cerrar sesión" en sidebar/header → `LogoutUseCase`
- **Feedback**: sin toast (la navegación a login es feedback suficiente)
- **Confirmación**: `ConfirmDialog` solo si hay turno de caja abierto (variant `warning`)
