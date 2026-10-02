-- Phase 5 Advisory Lock & Concurrency Control for JATapp Backups

-- Constant Advisory Lock ID for JATapp Backups: 74618277

-- 1. Function: try_acquire_backup_lock
CREATE OR REPLACE FUNCTION public.try_acquire_backup_lock()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pg_try_advisory_lock(74618277);
END;
$$;

-- 2. Function: release_backup_lock
CREATE OR REPLACE FUNCTION public.release_backup_lock()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pg_advisory_unlock(74618277);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- 3. Function: start_backup_job
-- Atomically checks if lock is available, clears stale running jobs if lock was acquired, and inserts the new job
CREATE OR REPLACE FUNCTION public.start_backup_job(
  p_backup_code text,
  p_backup_type text,
  p_created_by uuid DEFAULT NULL,
  p_is_permanent boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_locked boolean;
  v_new_job_id uuid;
  v_stale_count integer := 0;
BEGIN
  -- Try to acquire advisory lock
  v_locked := pg_try_advisory_lock(74618277);

  IF NOT v_locked THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'LOCKED',
      'message', 'Un backup o exportación ya se encuentra en ejecución por otra transacción o instancia.'
    );
  END IF;

  -- Lock acquired! If there are any previous jobs in 'running' or 'pending', 
  -- they MUST be stale/abandoned because we now hold the lock exclusively.
  UPDATE public.system_backups
  SET status = 'failed',
      manifest_json = jsonb_build_object(
        'error', 'Ejecución abandonada por caída o timeout del proceso previo.'
      )
  WHERE status IN ('running', 'pending');
  
  GET DIAGNOSTICS v_stale_count = ROW_COUNT;

  -- Insert new job record in 'running' status
  INSERT INTO public.system_backups (
    backup_code,
    backup_type,
    status,
    sha256_checksum,
    is_permanent,
    created_by
  ) VALUES (
    p_backup_code,
    p_backup_type,
    'running',
    NULL,
    p_is_permanent,
    p_created_by
  )
  RETURNING id INTO v_new_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_new_job_id,
    'stale_jobs_cleaned', v_stale_count
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_advisory_unlock(74618277);
  RAISE;
END;
$$;

-- 4. Function: finish_backup_job
-- Updates job status to completed/failed and releases advisory lock
CREATE OR REPLACE FUNCTION public.finish_backup_job(
  p_job_id uuid,
  p_status text,
  p_sha256 text DEFAULT NULL,
  p_file_size bigint DEFAULT NULL,
  p_storage_path text DEFAULT NULL,
  p_manifest jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_status = 'completed' THEN
    UPDATE public.system_backups
    SET status = 'completed',
        sha256_checksum = p_sha256,
        file_size_bytes = p_file_size,
        storage_path = p_storage_path,
        manifest_json = p_manifest
    WHERE id = p_job_id;
  ELSE
    UPDATE public.system_backups
    SET status = 'failed',
        manifest_json = COALESCE(p_manifest, jsonb_build_object('error', 'Error en el procesamiento del backup.'))
    WHERE id = p_job_id;
  END IF;

  PERFORM pg_advisory_unlock(74618277);
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_advisory_unlock(74618277);
  RETURN false;
END;
$$;
