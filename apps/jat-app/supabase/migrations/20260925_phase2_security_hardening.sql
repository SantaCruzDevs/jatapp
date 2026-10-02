-- ===================================================
-- MIGRATION: 20260925_phase2_security_hardening.sql
-- PURPOSE: Hardening Phase 2 Security Policies & Status Workflow
-- AUTHORIZED: Phase 2 Security Refinement
-- CONSTRAINTS:
--   - Restricts system_settings SELECT to internal admin roles (no global public/CLIENT_USER access)
--   - Applies Principle of Least Privilege to system_backups:
--       - ADMIN (if ALLOW_ADMIN_BACKUP = true): SELECT, INSERT only
--       - SUPERADMIN (Soporte): SELECT, INSERT, UPDATE, DELETE (Exclusive control over restore/deletion/is_permanent)
--   - Adds explicit job status column (pending, running, completed, failed) to system_backups
--   - Makes sha256_checksum nullable during pending/running states (no fake checksums)
-- ===================================================

-- 1. HARDEN SYSTEM_SETTINGS RLS POLICIES
DROP POLICY IF EXISTS system_settings_select_policy ON public.system_settings;
CREATE POLICY system_settings_select_policy ON public.system_settings
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    );

DROP POLICY IF EXISTS system_settings_write_policy ON public.system_settings;
CREATE POLICY system_settings_write_policy ON public.system_settings
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'SUPERADMIN')
    WITH CHECK (public.get_user_role() = 'SUPERADMIN');

-- 2. HARDEN SYSTEM_BACKUPS SCHEMA (STATUS & NULLABLE CHECKSUM)
ALTER TABLE public.system_backups
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completed';

ALTER TABLE public.system_backups
    ALTER COLUMN sha256_checksum DROP NOT NULL;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_system_backups_status') THEN
        ALTER TABLE public.system_backups 
        ADD CONSTRAINT chk_system_backups_status CHECK (status IN ('pending', 'running', 'completed', 'failed'));
    END IF;
END $$;

-- 3. HARDEN SYSTEM_BACKUPS RLS POLICIES (LEAST PRIVILEGE SEPARATION)
DROP POLICY IF EXISTS system_backups_admin_policy ON public.system_backups;
DROP POLICY IF EXISTS system_backups_select_policy ON public.system_backups;
DROP POLICY IF EXISTS system_backups_insert_policy ON public.system_backups;
DROP POLICY IF EXISTS system_backups_update_policy ON public.system_backups;
DROP POLICY IF EXISTS system_backups_delete_policy ON public.system_backups;

-- SELECT Policy (History & Read): SUPERADMIN always, ADMIN only if ALLOW_ADMIN_BACKUP = 'true'
CREATE POLICY system_backups_select_policy ON public.system_backups
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'SUPERADMIN'
        OR (
            public.get_user_role() = 'ADMIN'
            AND EXISTS (
                SELECT 1 FROM public.system_settings
                WHERE key = 'ALLOW_ADMIN_BACKUP' AND value = 'true'
            )
        )
    );

-- INSERT Policy (Generate Backup/Export): SUPERADMIN always, ADMIN only if ALLOW_ADMIN_BACKUP = 'true'
CREATE POLICY system_backups_insert_policy ON public.system_backups
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_user_role() = 'SUPERADMIN'
        OR (
            public.get_user_role() = 'ADMIN'
            AND EXISTS (
                SELECT 1 FROM public.system_settings
                WHERE key = 'ALLOW_ADMIN_BACKUP' AND value = 'true'
            )
        )
    );

-- UPDATE Policy (Modify metadata / is_permanent): EXCLUSIVELY SUPERADMIN
CREATE POLICY system_backups_update_policy ON public.system_backups
    FOR UPDATE TO authenticated
    USING (public.get_user_role() = 'SUPERADMIN')
    WITH CHECK (public.get_user_role() = 'SUPERADMIN');

-- DELETE Policy (Remove Backup): EXCLUSIVELY SUPERADMIN
CREATE POLICY system_backups_delete_policy ON public.system_backups
    FOR DELETE TO authenticated
    USING (public.get_user_role() = 'SUPERADMIN');

-- 4. NOTIFY SCHEMA RELOAD
NOTIFY pgrst, 'reload schema';
