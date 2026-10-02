-- ===================================================
-- MIGRATION: 20260922_create_company_with_first_contact_rpc.sql
-- PURPOSE: Atomic RPC for Company + First Contact creation with strict internal RBAC
-- AUTHORIZED: Phase 4 Customers & Companies Model Refactor
-- ===================================================

CREATE OR REPLACE FUNCTION public.create_company_with_first_contact_atomic(
  -- Company Parameters
  p_business_name TEXT,
  p_trade_name TEXT DEFAULT NULL,
  p_nit TEXT DEFAULT NULL,
  p_company_phone TEXT DEFAULT NULL,
  p_company_email TEXT DEFAULT NULL,
  p_company_address TEXT DEFAULT NULL,
  
  -- First Contact / Customer Parameters
  p_contact_full_name TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_contact_ci TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_contact_area TEXT DEFAULT NULL,
  p_contact_position TEXT DEFAULT NULL,
  p_contact_address TEXT DEFAULT NULL,
  p_is_primary_contact BOOLEAN DEFAULT TRUE,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_role VARCHAR(50);
  v_company_id UUID;
  v_customer_id UUID;
  v_result JSONB;
BEGIN
  -- 1. Security & RBAC Check
  v_user_id := auth.uid();
  v_user_role := public.get_user_role();

  IF v_user_id IS NULL OR v_user_role NOT IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR') THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren permisos administrativos u operativos para registrar empresas.';
  END IF;

  -- 2. Validate mandatory inputs
  IF p_business_name IS NULL OR TRIM(p_business_name) = '' THEN
    RAISE EXCEPTION 'La Razón Social de la empresa es obligatoria.';
  END IF;

  IF p_contact_full_name IS NULL OR TRIM(p_contact_full_name) = '' THEN
    RAISE EXCEPTION 'El nombre del primer contacto es obligatorio.';
  END IF;

  IF p_contact_phone IS NULL OR TRIM(p_contact_phone) = '' THEN
    RAISE EXCEPTION 'El teléfono del primer contacto es obligatorio.';
  END IF;

  -- 3. Insert into public.companies
  INSERT INTO public.companies (
    business_name,
    trade_name,
    nit,
    phone,
    email,
    address,
    status
  )
  VALUES (
    TRIM(p_business_name),
    NULLIF(TRIM(p_trade_name), ''),
    NULLIF(TRIM(p_nit), ''),
    NULLIF(TRIM(p_company_phone), ''),
    NULLIF(TRIM(p_company_email), ''),
    NULLIF(TRIM(p_company_address), ''),
    'active'
  )
  RETURNING id INTO v_company_id;

  -- 4. Insert into public.customers (linked to the new company)
  -- Note: phone_normalized is a GENERATED column in PostgreSQL, so we do NOT insert into it explicitly.
  INSERT INTO public.customers (
    full_name,
    phone,
    email,
    company_id,
    area,
    position,
    ci,
    address,
    is_active
  )
  VALUES (
    TRIM(p_contact_full_name),
    TRIM(p_contact_phone),
    NULLIF(TRIM(p_contact_email), ''),
    v_company_id,
    NULLIF(TRIM(p_contact_area), ''),
    NULLIF(TRIM(p_contact_position), ''),
    NULLIF(TRIM(p_contact_ci), ''),
    NULLIF(TRIM(p_contact_address), ''),
    COALESCE(p_is_active, TRUE)
  )
  RETURNING id INTO v_customer_id;

  -- 5. Set Primary Contact on company if requested
  IF COALESCE(p_is_primary_contact, TRUE) THEN
    UPDATE public.companies
    SET primary_contact_customer_id = v_customer_id,
        updated_at = NOW()
    WHERE id = v_company_id;
  END IF;

  -- Build JSON return object
  v_result := jsonb_build_object(
    'company_id', v_company_id,
    'customer_id', v_customer_id,
    'is_primary_contact', COALESCE(p_is_primary_contact, TRUE)
  );

  RETURN v_result;
END;
$$;

-- Revoke public permissions & grant explicit privileges
REVOKE EXECUTE ON FUNCTION public.create_company_with_first_contact_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company_with_first_contact_atomic TO authenticated, service_role, postgres;

NOTIFY pgrst, 'reload schema';
