-- Corrección: public.custom_access_token_hook fallaba con "Database error querying schema"
-- porque:
--   1. supabase_auth_admin no tenía SELECT en public.users (bloqueado por GRANT).
--   2. public.users tiene FORCE ROW LEVEL SECURITY y supabase_auth_admin no pasa
--      ninguna política (todas exigen auth.jwt() ->> 'role'), por lo que RLS
--      bloqueaba la consulta incluso después de conceder el GRANT.
--
-- Solución: SECURITY DEFINER hace que la función corra como su propietario (postgres),
-- que es superusuario y bypassa RLS. El GRANT SELECT sigue siendo necesario como
-- defensa en profundidad si el propietario cambia.

GRANT SELECT ON TABLE public.users TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role  TEXT;
  claims     jsonb;
BEGIN
  SELECT role INTO user_role
  FROM public.users
  WHERE id = (event ->> 'user_id')::uuid;

  IF user_role IS NULL THEN
    RETURN event;
  END IF;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  event  := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
