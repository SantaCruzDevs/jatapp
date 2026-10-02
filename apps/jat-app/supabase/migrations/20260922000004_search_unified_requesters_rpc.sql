-- ===================================================
-- MIGRATION: 20260922_search_unified_requesters_rpc.sql
-- PURPOSE: SECURITY INVOKER RPC for unified intelligent requester search
-- AUTHORIZED: Phase 4 Customers & Companies Model Refactor
-- ===================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create search acceleration indexes safely
CREATE INDEX IF NOT EXISTS idx_customers_full_name_trgm ON public.customers USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_ci ON public.customers (ci);
CREATE INDEX IF NOT EXISTS idx_companies_business_name_trgm ON public.companies USING gin (business_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_trade_name_trgm ON public.companies USING gin (trade_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_nit ON public.companies (nit);

CREATE OR REPLACE FUNCTION public.search_unified_requesters(p_query TEXT)
RETURNS TABLE (
  customer_id UUID,
  full_name TEXT,
  phone TEXT,
  phone_normalized TEXT,
  ci TEXT,
  area TEXT,
  contact_position TEXT,
  is_active BOOLEAN,
  company_id UUID,
  company_business_name TEXT,
  company_trade_name TEXT,
  company_nit TEXT,
  company_status TEXT,
  is_primary_contact BOOLEAN,
  match_priority INT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean TEXT;
  v_digits TEXT;
BEGIN
  v_clean := TRIM(p_query);
  IF v_clean IS NULL OR LENGTH(v_clean) < 2 THEN
    RETURN;
  END IF;

  v_digits := regexp_replace(v_clean, '\D', '', 'g');

  RETURN QUERY
  WITH matched_candidates AS (
    SELECT DISTINCT ON (c.id)
      c.id AS customer_id,
      c.full_name::TEXT AS full_name,
      c.phone::TEXT AS phone,
      c.phone_normalized::TEXT AS phone_normalized,
      c.ci::TEXT AS ci,
      c.area::TEXT AS area,
      c.position::TEXT AS contact_position,
      c.is_active,
      c.company_id,
      comp.business_name::TEXT AS company_business_name,
      comp.trade_name::TEXT AS company_trade_name,
      comp.nit::TEXT AS company_nit,
      comp.status::TEXT AS company_status,
      (comp.id IS NOT NULL AND comp.primary_contact_customer_id = c.id) AS is_primary_contact,
      CASE
        -- 1. Coincidencia exacta de teléfono
        WHEN (v_digits <> '' AND c.phone_normalized = v_digits) OR c.phone = v_clean THEN 1
        -- 2. Coincidencia exacta de nombre
        WHEN LOWER(c.full_name) = LOWER(v_clean) THEN 2
        -- 3. Coincidencia exacta de NIT
        WHEN comp.nit IS NOT NULL AND LOWER(comp.nit) = LOWER(v_clean) THEN 3
        -- 4. Coincidencia exacta de razón social
        WHEN comp.business_name IS NOT NULL AND LOWER(comp.business_name) = LOWER(v_clean) THEN 4
        -- 5. Coincidencia exacta de nombre comercial
        WHEN comp.trade_name IS NOT NULL AND LOWER(comp.trade_name) = LOWER(v_clean) THEN 5
        -- 6. Coincidencia por inicio del texto (prefix match)
        WHEN (v_digits <> '' AND c.phone_normalized LIKE v_digits || '%') OR c.full_name ILIKE v_clean || '%' OR comp.business_name ILIKE v_clean || '%' THEN 6
        -- 7. Coincidencia parcial
        ELSE 7
      END::INT AS match_priority
    FROM public.customers c
    LEFT JOIN public.companies comp ON comp.id = c.company_id
    WHERE c.is_active = TRUE
      AND (
        c.full_name ILIKE '%' || v_clean || '%'
        OR c.phone ILIKE '%' || v_clean || '%'
        OR (v_digits <> '' AND c.phone_normalized ILIKE '%' || v_digits || '%')
        OR c.ci ILIKE '%' || v_clean || '%'
        OR c.email ILIKE '%' || v_clean || '%'
        OR comp.business_name ILIKE '%' || v_clean || '%'
        OR comp.trade_name ILIKE '%' || v_clean || '%'
        OR comp.nit ILIKE '%' || v_clean || '%'
        OR comp.phone ILIKE '%' || v_clean || '%'
      )
    ORDER BY c.id
  )
  SELECT 
    mc.customer_id,
    mc.full_name::TEXT,
    mc.phone::TEXT,
    mc.phone_normalized::TEXT,
    mc.ci::TEXT,
    mc.area::TEXT,
    mc.contact_position::TEXT,
    mc.is_active,
    mc.company_id,
    mc.company_business_name::TEXT,
    mc.company_trade_name::TEXT,
    mc.company_nit::TEXT,
    mc.company_status::TEXT,
    mc.is_primary_contact,
    mc.match_priority::INT
  FROM matched_candidates mc
  ORDER BY 
    mc.match_priority ASC,
    mc.is_primary_contact DESC,
    mc.full_name ASC
  LIMIT 50;
END;
$$;

-- Grant explicit privileges to SECURITY INVOKER function
REVOKE EXECUTE ON FUNCTION public.search_unified_requesters FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_unified_requesters TO authenticated, service_role, postgres;

NOTIFY pgrst, 'reload schema';
