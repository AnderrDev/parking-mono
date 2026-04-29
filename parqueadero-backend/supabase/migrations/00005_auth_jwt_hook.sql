-- Spec: specs/database-schema.spec.md §auth.hook.custom_access_token
-- Inyecta el claim `role` desde public.users al JWT generado por Supabase Auth.

BEGIN;

-- La función debe vivir en el schema `public` y ser accesible por supabase_auth_admin.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  user_role  TEXT;
  claims     jsonb;
BEGIN
  -- Leer el rol del usuario desde public.users
  SELECT role INTO user_role
  FROM public.users
  WHERE id = (event ->> 'user_id')::uuid;

  -- Si no se encuentra el usuario o el rol es NULL, retornar evento sin modificar
  -- El cliente detectará la ausencia del claim y tratará como ServerFailure
  IF user_role IS NULL THEN
    RETURN event;
  END IF;

  -- Inyectar el claim `role` en el JWT
  claims := event -> 'claims';
  claims := jsonb_set(claims, '{role}', to_jsonb(user_role));
  event  := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;

-- Conceder permisos de ejecución al rol interno de Supabase Auth
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Revocar acceso público (solo supabase_auth_admin lo llama)
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;

COMMIT;
