-- ===================================================
-- MIGRATION: 20260922_enhance_customers_and_primary_contact.sql
-- PURPOSE: Customers / Requesters / Primary Contact / Companies Model Enhancement
-- AUTHORIZED: Phase 4 Etapa 2 complete - Customers & Companies Model
-- ===================================================

-- 1. ENHANCE PUBLIC.CUSTOMERS TABLE
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS area TEXT NULL,
  ADD COLUMN IF NOT EXISTS position TEXT NULL,
  ADD COLUMN IF NOT EXISTS ci TEXT NULL,
  ADD COLUMN IF NOT EXISTS address TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Add Composite Unique Constraint on (id, company_id) to allow composite FK referencing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_customers_id_company') THEN
        ALTER TABLE public.customers
        ADD CONSTRAINT uq_customers_id_company UNIQUE (id, company_id);
    END IF;
END $$;

-- 2. ENHANCE PUBLIC.COMPANIES TABLE
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trade_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS phone TEXT NULL,
  ADD COLUMN IF NOT EXISTS email TEXT NULL,
  ADD COLUMN IF NOT EXISTS primary_contact_customer_id UUID NULL;

-- Add Composite Foreign Key from companies (primary_contact_customer_id, id) -> customers (id, company_id)
-- Enforces: Primary Contact MUST belong to the same company (multitenant isolation at DB engine level)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_companies_primary_contact') THEN
        ALTER TABLE public.companies
        ADD CONSTRAINT fk_companies_primary_contact
        FOREIGN KEY (primary_contact_customer_id, id)
        REFERENCES public.customers (id, company_id)
        ON DELETE SET NULL (primary_contact_customer_id);
    END IF;
END $$;

-- 3. NOTIFY POSTGREST SCHEMA CACHE RELOAD
NOTIFY pgrst, 'reload schema';
