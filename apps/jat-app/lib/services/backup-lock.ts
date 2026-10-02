import { SupabaseClient } from '@supabase/supabase-js';

export interface StartBackupResult {
  success: boolean;
  jobId?: string;
  reason?: string;
  message?: string;
  staleJobsCleaned?: number;
}

/**
 * Atomically starts a backup job using PostgreSQL pg_advisory_lock (ID: 74618277).
 * Prevents concurrent backups across Vercel instances and handles stale jobs if lock was released.
 */
export async function startBackupJobAtomic(
  supabaseAdmin: SupabaseClient,
  params: {
    backupCode: string;
    backupType: 'technical_dump' | 'pre_restore_snapshot' | 'export_gestion';
    userId?: string | null;
    isPermanent?: boolean;
  }
): Promise<StartBackupResult> {
  const { backupCode, backupType, userId = null, isPermanent = false } = params;

  // Try RPC start_backup_job
  const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc('start_backup_job', {
    p_backup_code: backupCode,
    p_backup_type: backupType,
    p_created_by: userId,
    p_is_permanent: isPermanent,
  });

  if (!rpcErr && rpcData) {
    if (!rpcData.success) {
      return {
        success: false,
        reason: rpcData.reason || 'LOCKED',
        message: rpcData.message || 'Un backup o exportación ya se encuentra en ejecución.',
      };
    }
    return {
      success: true,
      jobId: rpcData.job_id,
      staleJobsCleaned: rpcData.stale_jobs_cleaned || 0,
    };
  }

  // Fallback if RPC migration is pending or not present:
  console.warn('RPC start_backup_job unavailable, using fallback concurrency check:', rpcErr?.message);

  // Check running jobs
  const { data: runningJobs } = await supabaseAdmin
    .from('system_backups')
    .select('id, created_at')
    .in('status', ['running', 'pending']);

  if (runningJobs && runningJobs.length > 0) {
    return {
      success: false,
      reason: 'LOCKED',
      message: 'Un backup o exportación ya se encuentra en ejecución por otro proceso.',
    };
  }

  // Insert job manually
  const { data: jobRecord, error: insertErr } = await supabaseAdmin
    .from('system_backups')
    .insert([
      {
        backup_code: backupCode,
        backup_type: backupType,
        status: 'running',
        sha256_checksum: null,
        is_permanent: isPermanent,
        created_by: userId,
      },
    ])
    .select('id')
    .single();

  if (insertErr || !jobRecord) {
    return {
      success: false,
      reason: 'INSERT_FAILED',
      message: `Error al registrar job de backup: ${insertErr?.message}`,
    };
  }

  return {
    success: true,
    jobId: jobRecord.id,
    staleJobsCleaned: 0,
  };
}

/**
 * Atomically completes or fails a backup job and releases the PostgreSQL advisory lock.
 */
export async function finishBackupJobAtomic(
  supabaseAdmin: SupabaseClient,
  params: {
    jobId: string;
    status: 'completed' | 'failed';
    sha256Checksum?: string | null;
    fileSizeBytes?: number | null;
    storagePath?: string | null;
    manifestJson?: Record<string, unknown> | null;
  }
): Promise<void> {
  const { jobId, status, sha256Checksum = null, fileSizeBytes = null, storagePath = null, manifestJson = null } = params;

  // Try RPC finish_backup_job
  const { error: rpcErr } = await supabaseAdmin.rpc('finish_backup_job', {
    p_job_id: jobId,
    p_status: status,
    p_sha256: sha256Checksum,
    p_file_size: fileSizeBytes,
    p_storage_path: storagePath,
    p_manifest: manifestJson,
  });

  if (rpcErr) {
    console.warn('RPC finish_backup_job fallback update:', rpcErr.message);
    if (status === 'completed') {
      await supabaseAdmin
        .from('system_backups')
        .update({
          status: 'completed',
          sha256_checksum: sha256Checksum,
          file_size_bytes: fileSizeBytes,
          storage_path: storagePath,
          manifest_json: manifestJson,
        })
        .eq('id', jobId);
    } else {
      await supabaseAdmin
        .from('system_backups')
        .update({
          status: 'failed',
          manifest_json: manifestJson || { error: 'Error en procesamiento.' },
        })
        .eq('id', jobId);
    }

    // Try unlock RPC fallback
    try {
      await supabaseAdmin.rpc('release_backup_lock');
    } catch {
      // Ignore fallback unlock error
    }
  }
}
