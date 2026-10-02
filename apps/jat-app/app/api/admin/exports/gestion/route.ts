import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateGestionExportZip } from '@/lib/services/export-gestion';
import { startBackupJobAtomic, finishBackupJobAtomic } from '@/lib/services/backup-lock';

export async function POST(req: NextRequest) {
  try {
    const supabaseServer = await createServerClient();
    const { data: authData, error: authErr } = await supabaseServer.auth.getUser();

    if (authErr || !authData.user) {
      return NextResponse.json({ success: false, error: 'Acceso denegado: Usuario no autenticado.' }, { status: 401 });
    }

    const userId = authData.user.id;
    const userEmail = authData.user.email;

    // 1. Fetch user role
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

    // 2. Enforce RBAC: Only SUPERADMIN or ADMIN (if ALLOW_ADMIN_BACKUP is true)
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
        { success: false, error: 'Acceso denegado: No cuenta con permisos para generar exportaciones administrativas.' },
        { status: 403 }
      );
    }

    // 3. Parse input parameters
    const body = await req.json().catch(() => ({}));
    const { start_date, end_date, is_permanent } = body;

    if (!start_date || !end_date) {
      return NextResponse.json(
        { success: false, error: 'Se requieren los parámetros start_date y end_date.' },
        { status: 400 }
      );
    }

    const startDateObj = new Date(start_date);
    const endDateObj = new Date(end_date);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return NextResponse.json({ success: false, error: 'Formato de fecha inválido. Usar YYYY-MM-DD.' }, { status: 400 });
    }

    if (startDateObj >= endDateObj) {
      return NextResponse.json(
        { success: false, error: 'La fecha start_date debe ser menor que end_date.' },
        { status: 400 }
      );
    }

    const year = startDateObj.getFullYear();
    const timestamp = Date.now();
    const backupCode = `EXP-GESTION-${year}-${timestamp}`;
    const isPermanent = Boolean(is_permanent);

    // 4. Atomic Lock & Job Start (PostgreSQL Advisory Lock 74618277)
    const lockResult = await startBackupJobAtomic(supabaseAdmin, {
      backupCode,
      backupType: 'export_gestion',
      userId,
      isPermanent,
    });

    if (!lockResult.success) {
      return NextResponse.json(
        { success: false, error: lockResult.message || 'Un backup o exportación ya se encuentra en ejecución.' },
        { status: lockResult.reason === 'LOCKED' ? 409 : 500 }
      );
    }

    const jobId = lockResult.jobId!;

    try {
      // 5. Generate ZIP Buffer & Manifest
      const exportResult = await generateGestionExportZip({
        startDate: startDateObj.toISOString(),
        endDate: endDateObj.toISOString(),
        userId,
        userEmail,
        backupCode,
      });

      // 6. Storage Path in private bucket system-backups
      const storagePath = `exports/JATapp_Gestion_${year}_${timestamp}.zip`;

      const { error: uploadErr } = await supabaseAdmin.storage
        .from('system-backups')
        .upload(storagePath, exportResult.zipBuffer, {
          contentType: 'application/zip',
          upsert: true,
        });

      if (uploadErr) {
        if (uploadErr.message.includes('not found') || uploadErr.message.includes('Bucket')) {
          await supabaseAdmin.storage.createBucket('system-backups', { public: false });
          const { error: retryErr } = await supabaseAdmin.storage
            .from('system-backups')
            .upload(storagePath, exportResult.zipBuffer, {
              contentType: 'application/zip',
              upsert: true,
            });

          if (retryErr) throw new Error(`Error subiendo exportación a Storage: ${retryErr.message}`);
        } else {
          throw new Error(`Error subiendo exportación a Storage: ${uploadErr.message}`);
        }
      }

      // 7. Generate 15-minute signed URL
      const { data: urlData, error: urlErr } = await supabaseAdmin.storage
        .from('system-backups')
        .createSignedUrl(storagePath, 15 * 60);

      if (urlErr) throw new Error(`Error al generar enlace firmado: ${urlErr.message}`);

      // 8. Atomic Job Finish to COMPLETED with real SHA-256 hash and manifest metadata
      await finishBackupJobAtomic(supabaseAdmin, {
        jobId,
        status: 'completed',
        sha256Checksum: exportResult.zipSha256,
        fileSizeBytes: exportResult.zipBuffer.length,
        storagePath,
        manifestJson: exportResult.manifest as any,
      });

      return NextResponse.json({
        success: true,
        backupCode,
        jobId,
        signedUrl: urlData.signedUrl,
        expiresInSeconds: 900,
        fileSizeBytes: exportResult.zipBuffer.length,
        sha256Checksum: exportResult.zipSha256,
        manifest: exportResult.manifest,
      });
    } catch (processErr: unknown) {
      const errorMsg = (processErr as Error).message || 'Error procesando la exportación.';
      console.error('Error executing administrative export job:', processErr);

      // Mark Job as FAILED and release advisory lock
      await finishBackupJobAtomic(supabaseAdmin, {
        jobId,
        status: 'failed',
        manifestJson: { error: errorMsg },
      });

      return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
    }
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Error del servidor.';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
