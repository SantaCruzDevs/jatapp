import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, error: 'Credenciales del servidor no configuradas.' }, { status: 500 });
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Enforce RBAC: SUPERADMIN or ADMIN (if ALLOW_ADMIN_BACKUP is true)
    let isAuthorized = false;
    if (userRole === 'SUPERADMIN') {
      isAuthorized = true;
    } else if (userRole === 'ADMIN') {
      const { data: settingData } = await supabaseAdmin
        .from('system_settings')
        .select('value')
        .eq('key', 'ALLOW_ADMIN_BACKUP')
        .single();

      if (settingData && settingData.value === 'true') {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Acceso denegado: No cuenta con permisos para consultar la bitácora de backups.' },
        { status: 403 }
      );
    }

    // Query system_backups ordered by created_at desc
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const typeFilter = url.searchParams.get('type');
    const statusFilter = url.searchParams.get('status');

    let query = supabaseAdmin
      .from('system_backups')
      .select('*, profiles:created_by(email, full_name, role)', { count: 'exact' });

    if (typeFilter) {
      query = query.eq('backup_type', typeFilter);
    }

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: backups, count, error: fetchErr } = await query;

    if (fetchErr) {
      console.error('Error fetching system_backups:', fetchErr);
      return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      backups: backups || [],
      total: count || 0,
      userRole,
    });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Error del servidor.';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
