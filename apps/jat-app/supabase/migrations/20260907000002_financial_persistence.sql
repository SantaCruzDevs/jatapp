-- Migration: 20260907_financial_persistence.sql
-- Description: Creates persistent PostgreSQL tables for Company Payments, Company Adjustments,
-- and Global Period Closings, equipped with indexes and 6-Role RBAC Row Level Security (RLS).
-- Fully Idempotent & Production Ready for QA Piloto.

-- ==========================================
-- 1. COMPANY PAYMENTS TABLE (Abonos a Cuenta Corriente)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.company_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    payment_method VARCHAR(50) NOT NULL,
    reference_number VARCHAR(100),
    notes TEXT,
    registered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_payments_company ON public.company_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_company_payments_date ON public.company_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_company_payments_created ON public.company_payments(created_at);

-- ==========================================
-- 2. COMPANY ADJUSTMENTS TABLE (Notas de Crédito / Débito / Ajustes)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.company_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(10,2) NOT NULL, -- Signed: negative for credit discount, positive for extra debit charge
    reason TEXT NOT NULL,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_adjustments_company ON public.company_adjustments(company_id);
CREATE INDEX IF NOT EXISTS idx_company_adjustments_created ON public.company_adjustments(created_at);

-- ==========================================
-- 3. PERIOD CLOSINGS TABLE (Historial e Inmutabilidad de Cierre Global)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.period_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    total_billing NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_qr NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_ticket NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_company_payments NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_adjustments NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_driver_settlements NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    net_operating_result NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    audit_payload JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT unq_period_closings_range UNIQUE (period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_period_closings_dates ON public.period_closings(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_period_closings_closed_at ON public.period_closings(closed_at);

-- ==========================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE public.company_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_closings ENABLE ROW LEVEL SECURITY;

-- 4.1 company_payments Policies
DROP POLICY IF EXISTS company_payments_admin_policy ON public.company_payments;
CREATE POLICY company_payments_admin_policy ON public.company_payments
    FOR ALL TO authenticated
    USING (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'))
    WITH CHECK (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));

DROP POLICY IF EXISTS company_payments_client_select_policy ON public.company_payments;
CREATE POLICY company_payments_client_select_policy ON public.company_payments
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'CLIENT_USER' AND
        company_id IN (
            SELECT company_id FROM public.company_users WHERE profile_id = auth.uid()
        )
    );

-- 4.2 company_adjustments Policies
DROP POLICY IF EXISTS company_adjustments_admin_policy ON public.company_adjustments;
CREATE POLICY company_adjustments_admin_policy ON public.company_adjustments
    FOR ALL TO authenticated
    USING (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'))
    WITH CHECK (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));

DROP POLICY IF EXISTS company_adjustments_client_select_policy ON public.company_adjustments;
CREATE POLICY company_adjustments_client_select_policy ON public.company_adjustments
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'CLIENT_USER' AND
        company_id IN (
            SELECT company_id FROM public.company_users WHERE profile_id = auth.uid()
        )
    );

-- 4.3 period_closings Policies
DROP POLICY IF EXISTS period_closings_admin_policy ON public.period_closings;
CREATE POLICY period_closings_admin_policy ON public.period_closings
    FOR ALL TO authenticated
    USING (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'))
    WITH CHECK (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_payments TO authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_adjustments TO authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_closings TO authenticated, service_role, postgres;
