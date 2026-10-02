import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { generateTechnicalBackupZip } from '@/lib/services/backup-technical';
import { startBackupJobAtomic, finishBackupJobAtomic } from '@/lib/services/backup-lock';
import { runBackupRetentionPolicy } from '@/lib/services/backup-retention';

export async function POST(req: NextRequest) {
  try {
    // 1. Verify Authorization header against CRON_SECRET
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'No autorizado: Cabecera CRON_SECRET inválida o ausente.' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, error: 'Credenciales del servidor no configuradas.' }, { status: 500 });
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2. Check if Scheduler is Enabled in system_settings
    const { data: enabledSetting } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'BACKUP_SCHEDULER_ENABLED')
      .single();

    if (enabledSetting && enabledSetting.value === 'false') {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'Ejecución omitida: El Scheduler Automático de Backups está desactivado.',
      });
    }

    // Fetch retention days setting
    const { data: retentionSetting } = await supabaseAdmin
      .from('system_settings')
      .select('value')
      .eq('key', 'BACKUP_RETENTION_DAYS')
      .single();

    const retentionDays = retentionSetting ? parseInt(retentionSetting.value, 10) || 30 : 30;

    // 3. Atomic Lock & Start Job (PostgreSQL Advisory Lock 74618277)
    const timestamp = Date.now();
    const backupCode = `CRON-AUTO-${timestamp}`;

    const lockResult = await startBackupJobAtomic(supabaseAdmin, {
      backupCode,
      backupType: 'technical_dump',
      userId: null,
      isPermanent: false,
    });

    if (!lockResult.success) {
      return NextResponse.json(
        { success: false, error: lockResult.message || 'Un backup ya se encuentra en ejecución.' },
        { status: lockResult.reason === 'LOCKED' ? 409 : 500 }
      );
    }

    const jobId = lockResult.jobId!;

    try {
      // 4. Generate Technical Backup ZIP Buffer & Manifest
      const backupResult = await generateTechnicalBackupZip({
        backupCode,
        backupType: 'technical_dump',
        userId: 'CRON_AUTOMATED_SCHEDULER',
        userEmail: 'cron@system.local',
      });

      // 5. Upload to Storage
      const storagePath = `backups/technical/JATapp_${backupCode}.zip`;

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

          if (retryErr) throw new Error(`Error subiendo backup cron a Storage: ${retryErr.message}`);
        } else {
          throw new Error(`Error subiendo backup cron a Storage: ${uploadErr.message}`);
        }
      }

      // 6. Complete Job & Release Advisory Lock
      await finishBackupJobAtomic(supabaseAdmin, {
        jobId,
        status: 'completed',
        sha256Checksum: backupResult.zipSha256,
        fileSizeBytes: backupResult.fileSizeBytes,
        storagePath,
        manifestJson: backupResult.manifest as any,
      });

      // 7. Execute Retention Policy (Storage-First)
      const retentionResult = await runBackupRetentionPolicy(supabaseAdmin, retentionDays);

      return NextResponse.json({
        success: true,
        backupCode,
        jobId,
        sha256Checksum: backupResult.zipSha256,
        fileSizeBytes: backupResult.fileSizeBytes,
        storagePath,
        retentionResult,
      });
    } catch (processErr: unknown) {
      const errorMsg = (processErr as Error).message || 'Error procesando el backup cron.';
      console.error('Error executing cron backup job:', processErr);

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
