import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateTechnicalBackupZip } from '@/lib/services/backup-technical';
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

    // 2. Enforce RBAC
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
        { success: false, error: 'Acceso denegado: No cuenta con permisos para generar backups técnicos.' },
        { status: 403 }
      );
    }

    // 3. Parse input parameters
    const body = await req.json().catch(() => ({}));
    const backupType: 'technical_dump' | 'pre_restore_snapshot' =
      body.backup_type === 'pre_restore_snapshot' ? 'pre_restore_snapshot' : 'technical_dump';
    const isPermanent = Boolean(body.is_permanent);

    const timestamp = Date.now();
    const prefix = backupType === 'pre_restore_snapshot' ? 'PRE-RESTORE' : 'BAK-TECH';
    const backupCode = `${prefix}-${timestamp}`;

    // 4. Atomic Lock & Job Start (PostgreSQL Advisory Lock 74618277)
    const lockResult = await startBackupJobAtomic(supabaseAdmin, {
      backupCode,
      backupType,
      userId,
      isPermanent,
    });

    if (!lockResult.success) {
      return NextResponse.json(
        { success: false, error: lockResult.message || 'Un backup ya se encuentra en ejecución.' },
        { status: lockResult.reason === 'LOCKED' ? 409 : 500 }
      );
    }

    const jobId = lockResult.jobId!;

    try {
      // 5. Generate Technical Backup ZIP Buffer & Manifest
      const backupResult = await generateTechnicalBackupZip({
        backupCode,
        backupType,
        userId,
        userEmail,
      });

      // 6. Storage Path in private bucket system-backups
      const subFolder = backupType === 'pre_restore_snapshot' ? 'pre_restore' : 'technical';
      const storagePath = `backups/${subFolder}/JATapp_${backupCode}.zip`;

      const { error: uploadErr } = await supabaseAdmin.storage
        .from('system-backups')
        .upload(storagePath, backupResult.zipBuffer, {
          contentType: 'application/zip',
          upsert: true,
        });

      if (uploadErr) {
        if (uploadErr.message.includes('not found') || uploadErr.message.includes('Bucket')) {
          await supabaseAdmin.storage.createBucket('system-backups', { public: false });
          const { error: retryErr } = await supabaseAdmin.storage
            .from('system-backups')
            .upload(storagePath, backupResult.zipBuffer, {
              contentType: 'application/zip',
              upsert: true,
            });

          if (retryErr) throw new Error(`Error subiendo backup a Storage: ${retryErr.message}`);
        } else {
          throw new Error(`Error subiendo backup a Storage: ${uploadErr.message}`);
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
        sha256Checksum: backupResult.zipSha256,
        fileSizeBytes: backupResult.fileSizeBytes,
        storagePath,
        manifestJson: backupResult.manifest as any,
      });

      return NextResponse.json({
        success: true,
        backupCode,
        jobId,
        backupType,
        signedUrl: urlData.signedUrl,
        expiresInSeconds: 900,
        fileSizeBytes: backupResult.fileSizeBytes,
        sha256Checksum: backupResult.zipSha256,
        manifest: backupResult.manifest,
      });
    } catch (processErr: unknown) {
      const errorMsg = (processErr as Error).message || 'Error procesando el backup técnico.';
      console.error('Error executing technical backup job:', processErr);

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
