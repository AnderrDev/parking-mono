# Spec: Login

## Identificador
`auth/login`

## Descripción
El usuario (operario o admin) ingresa email y contraseña para obtener una sesión autenticada con claim `role` en el JWT.

## Actor
Operario, Admin

## Pre-condiciones
- El usuario existe en `auth.users` de Supabase.
- El usuario está en `public.users` con campo `role` = `'operator'` o `'admin'`.
- El JWT hook `custom_access_token_hook` está activo en Supabase.
- No existe sesión activa en el dispositivo.

## Input (Params)
| Campo    | Tipo   | Obligatorio | Validaciones                        |
|----------|--------|-------------|-------------------------------------|
| email    | string | sí          | formato email válido, no vacío      |
| password | string | sí          | no vacío, mínimo 6 caracteres       |

## Output (Result)
| Caso    | Tipo           | Descripción                                           |
|---------|----------------|-------------------------------------------------------|
| Éxito   | `UserEntity`   | Usuario con id, email, role, createdAt                |
| Failure | `UnauthorizedFailure` | Credenciales incorrectas o usuario inactivo   |
| Failure | `NetworkFailure`      | Sin conexión al intentar autenticar           |
| Failure | `ServerFailure`       | Error de Supabase (5xx)                       |
| Failure | `ValidationFailure`   | Email o password no pasan validación local    |

## Reglas de Negocio
1. La autenticación se delega 100% a Supabase Auth (`signInWithPassword`).
2. El claim `role` debe estar presente en el JWT retornado (lo añade el hook). Si está ausente → `ServerFailure('JWT sin claim role')`.
3. Usuario con `is_active = false` en `public.users` → `UnauthorizedFailure('Usuario inactivo. Contacta al administrador.')`.
4. No se guarda la contraseña en ninguna capa local.
5. Máximo 5 intentos fallidos consecutivos → Supabase bloquea (comportamiento nativo, no lo gestiona el cliente).

## Flujo Principal
1. Usuario ingresa email y contraseña en `LoginPageComponent`.
2. `LoginUseCase.execute({ email, password })` valida formato localmente.
3. Llama `AuthRemoteDataSource.signIn(email, password)`.
4. Supabase retorna `{ data: { session, user }, error }`.
5. Si error → mapear a Failure correspondiente.
6. Si éxito → verificar que `session.access_token` contiene claim `role`.
7. `AuthRepositoryImpl` persiste la sesión (Supabase lo hace automáticamente en localStorage).
8. Retorna `Right(UserEntity)`.
9. `AuthStateService` actualiza signals: `currentUser`, `role`, `isAuthenticated`.
10. Router navega a `/parking` (operario) o `/reports` (admin).

## Edge Cases
- **Sin conexión**: devuelve `NetworkFailure` antes de intentar el request.
- **JWT sin `role`**: hook no configurado → `ServerFailure('JWT sin claim role')` + log en consola.
- **Email no registrado**: Supabase retorna 400 → `UnauthorizedFailure('Credenciales incorrectas')` (no revelar si existe el email).
- **Password incorrecto**: igual que email no registrado — mismo mensaje genérico.
- **Sesión ya activa**: `AuthStateService` detecta sesión → redirige directamente sin mostrar login.

## Dependencias
- `AuthRepository.login(email, password)`
- `AuthRemoteDataSource.signIn(email, password)`
- `SupabaseService.client.auth.signInWithPassword()`
- `AuthStateService` (actualizar signals post-login)

## Mapping a UI
- **Invocación**: `LoginPageComponent` (smart) → `AuthForms.createLoginForm()` → botón "Ingresar"
- **Formulario**: `AuthForms.createLoginForm()` con campos `email` + `password`
- **Feedback éxito**: navegación silenciosa a `/parking`
- **Feedback error**: `ErrorDisplayComponent` inline bajo el formulario (no toast — el usuario debe leerlo antes de reintentar)
- **Loading**: botón "Ingresar" disabled + `LoadingSpinnerComponent` dentro del botón
