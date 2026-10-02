-- ===================================================
-- MIGRATION: 20260925_phase2_sha256_completed_constraint.sql
-- PURPOSE: PostgreSQL Engine-Level Constraint for Integrity of system_backups
-- AUTHORIZED: Phase 2 Final Integrity Verification
-- CONSTRAINTS:
--   - Enforces that status = 'completed' MUST have a non-null, valid 64-character hex SHA-256 checksum
--   - Allows status IN ('pending', 'running', 'failed') to have NULL checksums
--   - Prevent any completed record without a valid SHA-256 hash at database engine level
-- ===================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_system_backups_completed_sha256') THEN
        ALTER TABLE public.system_backups 
        ADD CONSTRAINT chk_system_backups_completed_sha256 CHECK (
            (status = 'completed' AND sha256_checksum IS NOT NULL AND sha256_checksum ~ '^[a-fA-F0-9]{64}$')
            OR (status IN ('pending', 'running', 'failed'))
        );
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
