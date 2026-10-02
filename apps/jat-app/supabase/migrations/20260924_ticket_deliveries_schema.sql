-- ===================================================
-- MIGRATION: 20260924_ticket_deliveries_schema.sql
-- PURPOSE: Ticket Delivery & Re-send Auditing Schema
-- AUTHORIZED: Phase B Ticket Delivery Infrastructure
-- CONSTRAINTS:
--   - Tracks channel, recipient, delivery_key, provider_message_id, and delivery status
--   - 6-Role RBAC RLS policies with tenant security
-- ===================================================

CREATE TABLE IF NOT EXISTS public.ticket_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID REFERENCES public.rides(id) ON DELETE CASCADE NOT NULL,
    ticket_id UUID REFERENCES public.corporate_tickets(id) ON DELETE SET NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'whatsapp')),
    recipient VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
    delivery_key VARCHAR(100),
    attempt_count INT NOT NULL DEFAULT 1,
    provider_message_id VARCHAR(100),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ticket_deliveries_ride ON public.ticket_deliveries(ride_id);
CREATE INDEX IF NOT EXISTS idx_ticket_deliveries_channel ON public.ticket_deliveries(channel);
CREATE INDEX IF NOT EXISTS idx_ticket_deliveries_status ON public.ticket_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_ticket_deliveries_key ON public.ticket_deliveries(delivery_key);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE public.ticket_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_deliveries_admin_policy ON public.ticket_deliveries;
CREATE POLICY ticket_deliveries_admin_policy ON public.ticket_deliveries
    FOR ALL TO authenticated
    USING (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'))
    WITH CHECK (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'));

DROP POLICY IF EXISTS ticket_deliveries_client_select_policy ON public.ticket_deliveries;
CREATE POLICY ticket_deliveries_client_select_policy ON public.ticket_deliveries
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'CLIENT_USER' AND
        ride_id IN (
            SELECT id FROM public.rides WHERE company_id IN (
                SELECT company_id FROM public.company_users WHERE profile_id = auth.uid()
            )
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_deliveries TO authenticated, service_role, postgres;
