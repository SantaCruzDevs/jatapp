-- ===================================================
-- MIGRATION: 20260914_company_settlements_and_credit_ledger.sql
-- PURPOSE: Phase 4 Stage 1 - Corporate Finance DDL Schema
-- CONSTRAINTS:
--   - ZERO changes to public.rides (no is_company_settled, no company_settlement_id)
--   - Non-overlapping periods [period_start, period_end) via EXCLUDE USING gist (draft, closed)
--   - UNIQUE(ride_id) in company_settlement_items
--   - UNIQUE(idempotency_key) in company_payments
--   - Explicit credit lineage with source_credit_movement_id in company_credit_movements
--   - Post-close adjustment traceability with source_settlement_id & applied_settlement_id
-- ===================================================

-- 1. Enable btree_gist extension for Exclusion constraint on (company_id, tstzrange)
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- 2. CREATE TABLE public.company_settlements
CREATE TABLE IF NOT EXISTS public.company_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT NOT NULL,
    settlement_code VARCHAR(50) UNIQUE NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    cutoff_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    total_charges_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_charges_snapshot >= 0),
    total_adjustments_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    period_net_charge NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    previous_accumulated_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    final_accumulated_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    settlement_status VARCHAR(50) DEFAULT 'closed' CHECK (settlement_status IN ('draft', 'closed', 'voided')),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT chk_period_order CHECK (period_end > period_start),
    CONSTRAINT unq_company_settlements_no_overlap EXCLUDE USING gist (
        company_id WITH =,
        tstzrange(period_start, period_end, '[)') WITH &&
    ) WHERE (settlement_status IN ('draft', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_company_settlements_comp ON public.company_settlements(company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_company_settlements_status ON public.company_settlements(settlement_status);

-- 3. CREATE TABLE public.company_settlement_items
CREATE TABLE IF NOT EXISTS public.company_settlement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID REFERENCES public.company_settlements(id) ON DELETE CASCADE NOT NULL,
    ride_id UUID REFERENCES public.rides(id) ON DELETE RESTRICT NOT NULL,
    ticket_code_snapshot VARCHAR(100) NOT NULL,
    fare_snapshot NUMERIC(10,2) NOT NULL CHECK (fare_snapshot >= 0),
    adjustments_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    final_item_charge NUMERIC(10,2) NOT NULL CHECK (final_item_charge >= 0),
    ride_created_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT unq_company_settlement_item_ride UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_settlement_items_settlement ON public.company_settlement_items(settlement_id);
CREATE INDEX IF NOT EXISTS idx_comp_settlement_items_ride ON public.company_settlement_items(ride_id);

-- 4. CREATE TABLE public.company_credit_movements
CREATE TABLE IF NOT EXISTS public.company_credit_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT NOT NULL,
    payment_id UUID REFERENCES public.company_payments(id) ON DELETE SET NULL,
    settlement_id UUID REFERENCES public.company_settlements(id) ON DELETE SET NULL,
    source_credit_movement_id UUID REFERENCES public.company_credit_movements(id) ON DELETE RESTRICT,
    credit_type VARCHAR(50) NOT NULL CHECK (credit_type IN ('generation', 'usage', 'refund', 'adjustment')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    balance_after NUMERIC(10,2) NOT NULL CHECK (balance_after >= 0),
    reason TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT chk_credit_movement_source CHECK (
        (credit_type = 'generation' AND source_credit_movement_id IS NULL) OR
        (credit_type != 'generation')
    )
);

CREATE INDEX IF NOT EXISTS idx_company_credits_comp ON public.company_credit_movements(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_company_credits_source ON public.company_credit_movements(source_credit_movement_id);

-- 5. MODIFICATIONS TO public.company_adjustments
ALTER TABLE public.company_adjustments
  ADD COLUMN IF NOT EXISTS ride_id UUID REFERENCES public.rides(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_settlement_id UUID REFERENCES public.company_settlements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_settlement_id UUID REFERENCES public.company_settlements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS adjustment_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS adjustment_type VARCHAR(30) DEFAULT 'credit_discount',
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS applied_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_company_adjustments_status') THEN
        ALTER TABLE public.company_adjustments 
        ADD CONSTRAINT chk_company_adjustments_status 
        CHECK (adjustment_status IN ('pending', 'applied_to_settlement', 'applied_to_next_period', 'voided'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_company_adjustments_type') THEN
        ALTER TABLE public.company_adjustments 
        ADD CONSTRAINT chk_company_adjustments_type 
        CHECK (adjustment_type IN ('charge_increase', 'credit_discount'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_company_adjustments_ride ON public.company_adjustments(ride_id);
CREATE INDEX IF NOT EXISTS idx_company_adjustments_source_settlement ON public.company_adjustments(source_settlement_id);
CREATE INDEX IF NOT EXISTS idx_company_adjustments_applied_settlement ON public.company_adjustments(applied_settlement_id);
CREATE INDEX IF NOT EXISTS idx_company_adjustments_status ON public.company_adjustments(company_id, adjustment_status);

-- 6. MODIFICATIONS TO public.company_payments
ALTER TABLE public.company_payments
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unq_company_payments_idempotency_key') THEN
        ALTER TABLE public.company_payments 
        ADD CONSTRAINT unq_company_payments_idempotency_key UNIQUE (idempotency_key);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_company_payments_status') THEN
        ALTER TABLE public.company_payments 
        ADD CONSTRAINT chk_company_payments_status 
        CHECK (payment_status IN ('confirmed', 'unreconciled_overpayment', 'voided'));
    END IF;
END $$;

-- 7. MINIMAL ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.company_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settlement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_credit_movements ENABLE ROW LEVEL SECURITY;

-- company_settlements Policies
DROP POLICY IF EXISTS company_settlements_admin_policy ON public.company_settlements;
CREATE POLICY company_settlements_admin_policy ON public.company_settlements
    FOR ALL TO authenticated
    USING (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'))
    WITH CHECK (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'));

DROP POLICY IF EXISTS company_settlements_client_select_policy ON public.company_settlements;
CREATE POLICY company_settlements_client_select_policy ON public.company_settlements
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'CLIENT_USER' AND
        company_id IN (
            SELECT company_id FROM public.company_users WHERE profile_id = auth.uid()
        )
    );

-- company_settlement_items Policies
DROP POLICY IF EXISTS company_settlement_items_admin_policy ON public.company_settlement_items;
CREATE POLICY company_settlement_items_admin_policy ON public.company_settlement_items
    FOR ALL TO authenticated
    USING (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'))
    WITH CHECK (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'));

DROP POLICY IF EXISTS company_settlement_items_client_select_policy ON public.company_settlement_items;
CREATE POLICY company_settlement_items_client_select_policy ON public.company_settlement_items
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'CLIENT_USER' AND
        settlement_id IN (
            SELECT id FROM public.company_settlements WHERE company_id IN (
                SELECT company_id FROM public.company_users WHERE profile_id = auth.uid()
            )
        )
    );

-- company_credit_movements Policies
DROP POLICY IF EXISTS company_credit_movements_admin_policy ON public.company_credit_movements;
CREATE POLICY company_credit_movements_admin_policy ON public.company_credit_movements
    FOR ALL TO authenticated
    USING (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'))
    WITH CHECK (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'));

DROP POLICY IF EXISTS company_credit_movements_client_select_policy ON public.company_credit_movements;
CREATE POLICY company_credit_movements_client_select_policy ON public.company_credit_movements
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'CLIENT_USER' AND
        company_id IN (
            SELECT company_id FROM public.company_users WHERE profile_id = auth.uid()
        )
    );

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settlements TO authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settlement_items TO authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_credit_movements TO authenticated, service_role, postgres;
