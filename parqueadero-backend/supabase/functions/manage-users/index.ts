// Edge Function: manage-users (HU-003)
// Admin-only CRUD de usuarios. Usa service role para crear auth.users.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface CreateBody {
  action: 'create';
  email: string;
  password: string;
  nombre: string;
  role: 'admin' | 'operador' | 'contador';
}

interface UpdateRoleBody {
  action: 'update-role';
  userId: string;
  role: 'admin' | 'operador' | 'contador';
}

interface DeactivateBody {
  action: 'deactivate';
  userId: string;
}

interface ActivateBody {
  action: 'activate';
  userId: string;
}

type RequestBody = CreateBody | UpdateRoleBody | DeactivateBody | ActivateBody;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

  // Cliente con JWT del caller para verificar rol admin
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

  // Verificar rol del caller via public.users (no confiar en JWT solo)
  const { data: callerRow } = await userClient
    .from('users')
    .select('id, role, is_active')
    .eq('id', userData.user.id)
    .single<{ id: string; role: string; is_active: boolean }>();

  if (!callerRow || callerRow.role !== 'admin' || !callerRow.is_active) {
    return jsonResponse({ error: 'Solo admin puede gestionar usuarios' }, 403);
  }

  // Cliente con service role para operaciones privilegiadas
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const body = (await req.json()) as RequestBody;

  if (body.action === 'create') {
    if (!body.email || !body.password || !body.nombre || !body.role) {
      return jsonResponse({ error: 'Faltan campos: email, password, nombre, role' }, 400);
    }
    if (body.password.length < 8) {
      return jsonResponse({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400);
    }
    if (!['admin', 'operador', 'contador'].includes(body.role)) {
      return jsonResponse({ error: 'Rol inválido' }, 400);
    }

    // Crear en auth.users
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { nombre: body.nombre },
      app_metadata: { user_role: body.role },
    });
    if (createErr || !created.user) {
      return jsonResponse({ error: createErr?.message ?? 'No se pudo crear' }, 500);
    }

    // Mirror en public.users
    const { error: insertErr } = await adminClient.from('users').insert({
      id: created.user.id,
      email: body.email,
      role: body.role,
      nombre: body.nombre,
      is_active: true,
    });
    if (insertErr) {
      // Rollback: eliminar auth.users si falló public.users
      await adminClient.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: insertErr.message }, 500);
    }

    return jsonResponse({ success: true, userId: created.user.id });
  }

  if (body.action === 'update-role') {
    if (!body.userId || !body.role) {
      return jsonResponse({ error: 'Faltan campos: userId, role' }, 400);
    }
    if (body.userId === callerRow.id) {
      return jsonResponse({ error: 'No puedes cambiar tu propio rol' }, 400);
    }

    const { error: roleErr } = await adminClient
      .from('users')
      .update({ role: body.role, updated_at: new Date().toISOString() })
      .eq('id', body.userId);
    if (roleErr) return jsonResponse({ error: roleErr.message }, 500);

    // Actualizar también en auth.users.app_metadata
    await adminClient.auth.admin.updateUserById(body.userId, {
      app_metadata: { user_role: body.role },
    });

    return jsonResponse({ success: true });
  }

  if (body.action === 'deactivate') {
    if (!body.userId) return jsonResponse({ error: 'Falta userId' }, 400);
    if (body.userId === callerRow.id) {
      return jsonResponse({ error: 'No puedes desactivar tu propia cuenta' }, 400);
    }
    const { error } = await adminClient
      .from('users')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', body.userId);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ success: true });
  }

  if (body.action === 'activate') {
    if (!body.userId) return jsonResponse({ error: 'Falta userId' }, 400);
    const { error } = await adminClient
      .from('users')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', body.userId);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ success: true });
  }

  return jsonResponse({ error: 'Acción no soportada' }, 400);
});
