-- ===================================================
-- MIGRATION: 20260913_company_portal_feature_flag.sql
-- PURPOSE: Infrastructure for COMPANY_PORTAL_ENABLED Feature Flag & RLS
-- DEFAULT STATE: COMPANY_PORTAL_ENABLED = false
-- ===================================================

-- 1. Ensure corporate_tickets SELECT policy supports CLIENT_USER via company_users
DROP POLICY IF EXISTS corporate_tickets_select_policy ON public.corporate_tickets;
CREATE POLICY corporate_tickets_select_policy ON public.corporate_tickets
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    OR (
      public.get_user_role() = 'CLIENT_USER'
      AND ride_id IN (
        SELECT id FROM public.rides WHERE company_id IN (
          SELECT company_id FROM public.company_users WHERE profile_id = auth.uid()
        )
      )
    )
  );

-- 2. Ensure rides SELECT policy supports CLIENT_USER for company-assigned rides
DROP POLICY IF EXISTS rides_select_policy ON public.rides;
CREATE POLICY rides_select_policy ON public.rides
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    OR (status = 'pending' AND public.get_user_role() = 'DRIVER')
    OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    OR created_by = auth.uid()
    OR customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
    OR (
      public.get_user_role() = 'CLIENT_USER'
      AND company_id IN (SELECT company_id FROM public.company_users WHERE profile_id = auth.uid())
    )
  );

-- 3. Document initial default state: COMPANY_PORTAL_ENABLED is default false
COMMENT ON TABLE public.company_users IS 'Link CLIENT_USER accounts to Companies. External access controlled by COMPANY_PORTAL_ENABLED feature flag (default false).';
