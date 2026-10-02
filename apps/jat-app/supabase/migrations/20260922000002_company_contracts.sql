-- ===================================================
-- MIGRATION: 20260922_company_contracts.sql
-- PURPOSE: Stage 1 - Corporate Ticket Contracts Technical Foundation
-- AUTHORIZED: Corporate Ticket Contracts Refactor
-- ===================================================

-- 1. Add commercial modality flag to public.companies
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS uses_ticket_contract BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Create public.company_contracts table with ON DELETE RESTRICT for historical preservation
CREATE TABLE IF NOT EXISTS public.company_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  contract_number VARCHAR(100) NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  pdf_file_path TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_company_contract_status
    CHECK (status IN ('draft', 'active', 'suspended', 'expired', 'replaced', 'cancelled')),

  CONSTRAINT chk_company_contract_dates
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

-- 3. Automatic updated_at trigger
DROP TRIGGER IF EXISTS trg_company_contracts_updated_at ON public.company_contracts;
CREATE TRIGGER trg_company_contracts_updated_at
  BEFORE UPDATE ON public.company_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Partial Unique Index: Maximum ONE 'active' contract per company simultaneously
CREATE UNIQUE INDEX IF NOT EXISTS idx_unq_active_company_contract
ON public.company_contracts (company_id)
WHERE (status = 'active');

-- 5. Fast Lookup Index for Contract Validity Resolution
CREATE INDEX IF NOT EXISTS idx_company_contracts_lookup
ON public.company_contracts (company_id, status, start_date, end_date);

-- 6. Enable Row Level Security (RLS) on public.company_contracts
ALTER TABLE public.company_contracts ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT allowed for internal roles or CLIENT_USER belonging to company_users
DROP POLICY IF EXISTS company_contracts_select_policy ON public.company_contracts;
CREATE POLICY company_contracts_select_policy ON public.company_contracts
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    OR (
      public.get_user_role() = 'CLIENT_USER'
      AND company_id IN (
        SELECT cu.company_id 
        FROM public.company_users cu 
        WHERE cu.profile_id = auth.uid()
      )
    )
  );

-- Policy: INSERT allowed only for SUPERADMIN and ADMIN
DROP POLICY IF EXISTS company_contracts_insert_policy ON public.company_contracts;
CREATE POLICY company_contracts_insert_policy ON public.company_contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

-- Policy: UPDATE allowed only for SUPERADMIN and ADMIN
DROP POLICY IF EXISTS company_contracts_update_policy ON public.company_contracts;
CREATE POLICY company_contracts_update_policy ON public.company_contracts
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  )
  WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

-- Policy: DELETE disallowed for normal application users to preserve history
DROP POLICY IF EXISTS company_contracts_delete_policy ON public.company_contracts;
CREATE POLICY company_contracts_delete_policy ON public.company_contracts
  FOR DELETE
  TO authenticated
  USING (
    public.get_user_role() = 'SUPERADMIN'
  );

-- 7. Configure Private Storage Bucket for Contract PDFs (public = false)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-contracts', 'company-contracts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage RLS Policies for company-contracts bucket
DROP POLICY IF EXISTS "Internal roles can upload contract PDFs" ON storage.objects;
CREATE POLICY "Internal roles can upload contract PDFs" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-contracts'
    AND public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

DROP POLICY IF EXISTS "Internal roles and corporate clients can read contract PDFs" ON storage.objects;
CREATE POLICY "Internal roles and corporate clients can read contract PDFs" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'company-contracts'
    AND (
      public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
      OR (
        public.get_user_role() = 'CLIENT_USER'
        AND (storage.foldername(name))[1] IN (
          SELECT cu.company_id::text
          FROM public.company_users cu
          WHERE cu.profile_id = auth.uid()
        )
      )
    )
  );

NOTIFY pgrst, 'reload schema';
