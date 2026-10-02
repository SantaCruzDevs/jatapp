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
        { success: false, error: 'Acceso denegado: No cuenta con permisos para descargar backups.' },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Se requiere el parámetro id.' }, { status: 400 });
    }

    const { data: backupRecord, error: findErr } = await supabaseAdmin
      .from('system_backups')
      .select('id, backup_code, status, storage_path')
      .eq('id', id)
      .single();

    if (findErr || !backupRecord) {
      return NextResponse.json({ success: false, error: 'Registro de backup no encontrado.' }, { status: 404 });
    }

    if (backupRecord.status !== 'completed' || !backupRecord.storage_path) {
      return NextResponse.json(
        { success: false, error: 'El backup solicitado no tiene un archivo disponible para descarga.' },
        { status: 400 }
      );
    }

    // Create 15-minute signed URL
    const { data: signedData, error: signedErr } = await supabaseAdmin.storage
      .from('system-backups')
      .createSignedUrl(backupRecord.storage_path, 15 * 60);

    if (signedErr || !signedData?.signedUrl) {
      return NextResponse.json(
        { success: false, error: `Error al generar la URL firmada: ${signedErr?.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      backupCode: backupRecord.backup_code,
      signedUrl: signedData.signedUrl,
      expiresInSeconds: 900,
    });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Error del servidor.';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
