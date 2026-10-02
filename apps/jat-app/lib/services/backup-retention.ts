import { SupabaseClient } from '@supabase/supabase-js';

export interface RetentionCleanupResult {
  success: boolean;
  retentionDays: number;
  totalExpired: number;
  deletedCount: number;
  failedStorageCount: number;
  failedDbCount: number;
  errors: string[];
}

/**
 * Clean up expired automatic backups following the Storage-First policy.
 * - NEVER deletes records where is_permanent = true.
 * - Step 1: Storage DELETE.
 * - Step 2: DB DELETE (only if Storage DELETE succeeds).
 * - If DB DELETE fails: does NOT conceal the error, logs warning, and leaves record traceable.
 */
export async function runBackupRetentionPolicy(
  supabaseAdmin: SupabaseClient,
  retentionDays: number = 30
): Promise<RetentionCleanupResult> {
  const result: RetentionCleanupResult = {
    success: true,
    retentionDays,
    totalExpired: 0,
    deletedCount: 0,
    failedStorageCount: 0,
    failedDbCount: 0,
    errors: [],
  };

  if (retentionDays <= 0) {
    return result;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffIso = cutoffDate.toISOString();

  // Query completed non-permanent backups older than retention cutoff
  const { data: expiredJobs, error: queryErr } = await supabaseAdmin
    .from('system_backups')
    .select('id, backup_code, storage_path, created_at, is_permanent')
    .eq('status', 'completed')
    .eq('is_permanent', false)
    .lt('created_at', cutoffIso);

  if (queryErr) {
    result.success = false;
    result.errors.push(`Error al consultar backups expirados: ${queryErr.message}`);
    return result;
  }

  if (!expiredJobs || expiredJobs.length === 0) {
    return result;
  }

  result.totalExpired = expiredJobs.length;

  for (const job of expiredJobs) {
    // Extra safety assertion: NEVER auto-delete permanent backups
    if (job.is_permanent) {
      continue;
    }

    if (job.storage_path) {
      // Step 1: Storage DELETE
      const { error: storageErr } = await supabaseAdmin.storage
        .from('system-backups')
        .remove([job.storage_path]);

      if (storageErr) {
        result.failedStorageCount++;
        const errStr = `Error en Storage DELETE para ${job.backup_code} (${job.storage_path}): ${storageErr.message}`;
        console.error(errStr);
        result.errors.push(errStr);
        // DO NOT delete DB record if Storage delete fails!
        continue;
      }
    }

    // Step 2: DB DELETE (only after Storage DELETE succeeded or if no storage_path)
    const { error: dbErr } = await supabaseAdmin
      .from('system_backups')
      .delete()
      .eq('id', job.id);

    if (dbErr) {
      result.failedDbCount++;
      const errStr = `Error en DB DELETE para ${job.backup_code} (${job.id}): ${dbErr.message}`;
      console.error(errStr);
      result.errors.push(errStr);
      // DB record stays so it remains traceable for retry in next run
    } else {
      result.deletedCount++;
    }
  }

  if (result.errors.length > 0) {
    result.success = false;
  }

  return result;
}
