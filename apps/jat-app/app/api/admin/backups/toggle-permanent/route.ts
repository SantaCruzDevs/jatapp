import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const supabaseServer = await createServerClient();
    const { data: authData, error: authErr } = await supabaseServer.auth.getUser();

    if (authErr || !authData.user) {
      return NextResponse.json({ success: false, error: 'Acceso denegado: Usuario no autenticado.' }, { status: 401 });
    }

    const userId = authData.user.id;
    const { data: profile } = await supabaseServer
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    const userRole = profile?.role || 'CLIENT_USER';

    // ONLY SUPERADMIN is allowed to toggle permanent retention flag
    if (userRole !== 'SUPERADMIN') {
      return NextResponse.json(
        { success: false, error: 'Acceso denegado: Solo SUPERADMIN (Soporte) puede modificar la marca de retención permanente.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { id, is_permanent } = body;

    if (!id || typeof is_permanent !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Se requieren los parámetros id (string) e is_permanent (boolean).' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, error: 'Credenciales del servidor no configuradas.' }, { status: 500 });
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('system_backups')
      .update({ is_permanent })
      .eq('id', id)
      .select('id, backup_code, is_permanent')
      .single();

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: `Error actualizando marca de retención: ${updateErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      backup: updated,
    });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Error del servidor.';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
