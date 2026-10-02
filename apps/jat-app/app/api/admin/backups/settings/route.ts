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

    if (userRole !== 'SUPERADMIN' && userRole !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Acceso denegado.' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, error: 'Credenciales no configuradas.' }, { status: 500 });
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const targetKeys = [
      'BACKUP_SCHEDULER_ENABLED',
      'BACKUP_SCHEDULER_FREQUENCY',
      'BACKUP_RETENTION_DAYS',
      'ALLOW_ADMIN_BACKUP',
    ];

    const { data: settingsData } = await supabaseAdmin
      .from('system_settings')
      .select('key, value')
      .in('key', targetKeys);

    const settingsMap: Record<string, string> = {
      BACKUP_SCHEDULER_ENABLED: 'false',
      BACKUP_SCHEDULER_FREQUENCY: 'daily',
      BACKUP_RETENTION_DAYS: '30',
      ALLOW_ADMIN_BACKUP: 'false',
    };

    if (settingsData) {
      for (const item of settingsData) {
        settingsMap[item.key] = item.value;
      }
    }

    return NextResponse.json({
      success: true,
      settings: settingsMap,
      userRole,
    });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Error del servidor.';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

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

    // ONLY SUPERADMIN can update backup scheduler settings
    if (userRole !== 'SUPERADMIN') {
      return NextResponse.json(
        { success: false, error: 'Acceso denegado: Solo SUPERADMIN (Soporte) puede modificar la configuración del scheduler.' },
        { status: 403 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, error: 'Credenciales no configuradas.' }, { status: 500 });
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { BACKUP_SCHEDULER_ENABLED, BACKUP_SCHEDULER_FREQUENCY, BACKUP_RETENTION_DAYS, ALLOW_ADMIN_BACKUP } = body;

    const updates: { key: string; value: string }[] = [];

    if (typeof BACKUP_SCHEDULER_ENABLED === 'string') {
      updates.push({ key: 'BACKUP_SCHEDULER_ENABLED', value: BACKUP_SCHEDULER_ENABLED === 'true' ? 'true' : 'false' });
    }

    if (typeof BACKUP_SCHEDULER_FREQUENCY === 'string') {
      updates.push({ key: 'BACKUP_SCHEDULER_FREQUENCY', value: BACKUP_SCHEDULER_FREQUENCY });
    }

    if (typeof BACKUP_RETENTION_DAYS === 'string' || typeof BACKUP_RETENTION_DAYS === 'number') {
      updates.push({ key: 'BACKUP_RETENTION_DAYS', value: String(BACKUP_RETENTION_DAYS) });
    }

    if (typeof ALLOW_ADMIN_BACKUP === 'string') {
      updates.push({ key: 'ALLOW_ADMIN_BACKUP', value: ALLOW_ADMIN_BACKUP === 'true' ? 'true' : 'false' });
    }

    for (const updateItem of updates) {
      await supabaseAdmin.from('system_settings').upsert(
        {
          key: updateItem.key,
          value: updateItem.value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Configuración de backups actualizada correctamente.',
    });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Error del servidor.';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
