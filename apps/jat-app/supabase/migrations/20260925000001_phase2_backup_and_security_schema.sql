-- ===================================================
-- MIGRATION: 20260925_phase2_backup_and_security_schema.sql
-- PURPOSE: Phase 2 - System Settings & System Backups DDL Schema
-- AUTHORIZED: Phase 2 Database Model Implementation
-- CONSTRAINTS:
--   - Creates public.system_settings if not exists
--   - Inserts ALLOW_ADMIN_BACKUP = false by default
--   - Creates public.system_backups for audit tracking of backups/exports
--   - 100% Idempotent and RLS protected (SUPERADMIN exclusive by default)
-- ===================================================

-- 1. CREATE TABLE public.system_settings
CREATE TABLE IF NOT EXISTS public.system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. INSERT INITIAL DEFAULT VALUES (allow_admin_backup = false)
INSERT INTO public.system_settings (key, value, description)
VALUES ('ALLOW_ADMIN_BACKUP', 'false', 'Permitir Backup y Exportación a Administradores (Default false)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.system_settings (key, value, description)
VALUES ('COMPANY_CREDIT_ENABLED', 'false', 'Habilitar Cuenta Corriente Corporativa (Default false)')
ON CONFLICT (key) DO NOTHING;

-- Automatic updated_at trigger for system_settings
DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 3. CREATE TABLE public.system_backups
CREATE TABLE IF NOT EXISTS public.system_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_code VARCHAR(50) UNIQUE NOT NULL,
    backup_type VARCHAR(30) NOT NULL CHECK (backup_type IN ('technical_dump', 'administrative_export', 'pre_restore_snapshot')),
    storage_path TEXT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    sha256_checksum VARCHAR(64) NOT NULL,
    manifest_json JSONB NULL,
    is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for performance and lookup
CREATE INDEX IF NOT EXISTS idx_system_backups_type ON public.system_backups(backup_type);
CREATE INDEX IF NOT EXISTS idx_system_backups_created ON public.system_backups(created_at);

-- 4. ROW LEVEL SECURITY (RLS) FOR SYSTEM_SETTINGS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_settings_select_policy ON public.system_settings;
CREATE POLICY system_settings_select_policy ON public.system_settings
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS system_settings_write_policy ON public.system_settings;
CREATE POLICY system_settings_write_policy ON public.system_settings
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'SUPERADMIN')
    WITH CHECK (public.get_user_role() = 'SUPERADMIN');

-- 5. ROW LEVEL SECURITY (RLS) FOR SYSTEM_BACKUPS
ALTER TABLE public.system_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_backups_admin_policy ON public.system_backups;
CREATE POLICY system_backups_admin_policy ON public.system_backups
    FOR ALL TO authenticated
    USING (
        public.get_user_role() = 'SUPERADMIN'
        OR (
            public.get_user_role() = 'ADMIN'
            AND EXISTS (
                SELECT 1 FROM public.system_settings
                WHERE key = 'ALLOW_ADMIN_BACKUP' AND value = 'true'
            )
        )
    )
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

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_backups TO authenticated, service_role, postgres;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
