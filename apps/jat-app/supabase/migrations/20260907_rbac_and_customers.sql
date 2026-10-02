-- Migration: 20260907_rbac_and_customers.sql
-- Description: Hardened 6-Role RBAC Expansion (adding SUPERVISOR), Corporate Entities (companies, company_users),
-- Master Customers (customers), Cryptographic OTP Link Tokens (customer_link_tokens), and Granular User Permissions (user_permissions).
-- Fully Idempotent & Production Ready.

-- ==========================================
-- 1. HELPER & SECURITY FUNCTIONS
-- ==========================================

-- 1.1 get_user_role(): Retrieves user role safely without RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS VARCHAR AS $$
DECLARE
    u_role VARCHAR;
BEGIN
    SELECT role INTO u_role FROM public.profiles WHERE id = auth.uid();
    RETURN COALESCE(u_role, 'CLIENT_USER');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated, service_role, postgres;

-- 1.2 update_updated_at_column(): Auto timestamp update trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- ==========================================
-- 2. SCHEMA CONSTRAINTS & TABLES
-- ==========================================

-- 2.1 Update profiles role CHECK constraint to include SUPERVISOR
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR', 'DRIVER', 'CLIENT_USER'));

-- 2.2 Companies Table (Corporate Entities)
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name VARCHAR(255) NOT NULL,
    nit VARCHAR(50),
    address TEXT,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2.3 Company Users Table (Link CLIENT_USER accounts to Companies)
CREATE TABLE IF NOT EXISTS public.company_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (company_id, profile_id)
);

-- 2.4 Customers Table (Master Service Requesters / Callers)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    phone_normalized VARCHAR(50) GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED,
    email VARCHAR(255),
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_phone_normalized ON public.customers(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON public.customers(company_id);

-- 2.5 Customer Link Tokens Table (Cryptographic SHA-256 Tokens)
CREATE TABLE IF NOT EXISTS public.customer_link_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_link_tokens_hash ON public.customer_link_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_customer_link_tokens_customer ON public.customer_link_tokens(customer_id);

-- 2.6 User Permissions Table (Granular RBAC Permissions)
CREATE TABLE IF NOT EXISTS public.user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(profile_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_profile ON public.user_permissions(profile_id);

-- 2.7 Rides Table Updates (Foreign Keys for Customers & Companies)
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rides_customer_id ON public.rides(customer_id);
CREATE INDEX IF NOT EXISTS idx_rides_company_id ON public.rides(company_id);

-- ==========================================
-- 3. GRANULAR PERMISSION & TOKEN RPC FUNCTIONS
-- ==========================================

-- 3.1 has_permission(): Checks explicit or implicit permissions
CREATE OR REPLACE FUNCTION public.has_permission(p_permission VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
    -- SUPERADMIN and ADMIN have implicit full permission access
    IF public.get_user_role() IN ('SUPERADMIN', 'ADMIN') THEN
        RETURN TRUE;
    END IF;

    -- Check explicit granted permission in user_permissions
    RETURN EXISTS (
        SELECT 1 FROM public.user_permissions
        WHERE profile_id = auth.uid() AND permission_key = p_permission
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.has_permission(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(VARCHAR) TO authenticated, service_role, postgres;

-- 3.2 create_customer_link_token(): Server-side creation of SHA-256 token hashes
-- Restricted to authorized staff or service_role backend execution only
CREATE OR REPLACE FUNCTION public.create_customer_link_token(
    p_customer_id UUID,
    p_raw_token VARCHAR,
    p_ttl_minutes INT DEFAULT 15
)
RETURNS UUID AS $$
DECLARE
    v_token_id UUID;
    v_hash VARCHAR(64);
BEGIN
    -- Enforce server-side / authorized staff access
    IF public.get_user_role() NOT IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR') 
       AND current_user NOT IN ('service_role', 'postgres') THEN
        RAISE EXCEPTION 'Acceso denegado: La generación de tokens está reservada para el servidor o personal autorizado';
    END IF;

    IF p_raw_token IS NULL OR length(p_raw_token) < 16 THEN
        RAISE EXCEPTION 'El token debe tener una longitud mínima de 16 caracteres';
    END IF;

    -- Calculate SHA-256 hash using native PostgreSQL sha256 function
    v_hash := encode(sha256(p_raw_token::bytea), 'hex');

    INSERT INTO public.customer_link_tokens (customer_id, token_hash, expires_at)
    VALUES (p_customer_id, v_hash, now() + (p_ttl_minutes || ' minutes')::interval)
    RETURNING id INTO v_token_id;

    RETURN v_token_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.create_customer_link_token(UUID, VARCHAR, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_link_token(UUID, VARCHAR, INT) TO service_role, postgres;

-- 3.3 link_customer_verified(): Authenticated RPC to complete customer linking
CREATE OR REPLACE FUNCTION public.link_customer_verified(
    p_customer_id UUID,
    p_raw_token VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_token_record RECORD;
    v_hash VARCHAR(64);
    v_existing_user UUID;
BEGIN
    -- 1. Require authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    IF p_raw_token IS NULL OR p_raw_token = '' THEN
        RAISE EXCEPTION 'Token de verificación requerido';
    END IF;

    -- 2. Compute SHA-256 token hash
    v_hash := encode(sha256(p_raw_token::bytea), 'hex');

    -- 3. Validate token (customer_id, hash, not expired, not used)
    SELECT * INTO v_token_record
    FROM public.customer_link_tokens
    WHERE customer_id = p_customer_id
      AND token_hash = v_hash
      AND expires_at > now()
      AND used_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Token de verificación inválido, expirado o ya utilizado';
    END IF;

    -- 4. Validate customer and ensure not assigned to another user
    SELECT user_id INTO v_existing_user
    FROM public.customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cliente no encontrado';
    END IF;

    IF v_existing_user IS NOT NULL AND v_existing_user <> v_user_id THEN
        RAISE EXCEPTION 'El cliente ya se encuentra vinculado a otra cuenta de usuario';
    END IF;

    -- 5. Mark token as consumed atomically
    UPDATE public.customer_link_tokens
    SET used_at = now()
    WHERE id = v_token_record.id;

    -- 6. Link customer.user_id = auth.uid()
    UPDATE public.customers
    SET user_id = v_user_id,
        updated_at = now()
    WHERE id = p_customer_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.link_customer_verified(UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_customer_verified(UUID, VARCHAR) TO authenticated, service_role, postgres;

-- 3.4 handle_new_user(): Auth user signup trigger (blocks privilege escalation via metadata)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    assigned_role VARCHAR;
    meta_role VARCHAR;
BEGIN
    meta_role := NEW.raw_user_meta_data->>'role';
    -- Public metadata CANNOT self-assign administrative roles (SUPERADMIN, ADMIN, SUPERVISOR)
    IF meta_role IN ('OPERATOR', 'DRIVER', 'CLIENT_USER') THEN
        assigned_role := meta_role;
    ELSE
        assigned_role := 'CLIENT_USER';
    END IF;

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Usuario JAT'),
        assigned_role
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role, postgres;

-- ==========================================
-- 4. TRIGGERS (IDEMPOTENT)
-- ==========================================

DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 5. ENABLE ROW LEVEL SECURITY (RLS) & SCHEMA GRANTS
-- ==========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_tickets ENABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;

-- ==========================================
-- 6. DEFINITIVE RLS POLICIES
-- ==========================================

-- ------------------------------------------
-- 6.1 PROFILES POLICIES
-- ------------------------------------------
DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;
CREATE POLICY profiles_select_policy ON public.profiles
  FOR SELECT USING (
    id = auth.uid() OR public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
  );

DROP POLICY IF EXISTS profiles_insert_policy ON public.profiles;
CREATE POLICY profiles_insert_policy ON public.profiles
  FOR INSERT WITH CHECK (
    public.get_user_role() = 'SUPERADMIN'
    OR (public.get_user_role() = 'ADMIN' AND role NOT IN ('SUPERADMIN'))
    OR (public.get_user_role() = 'SUPERVISOR' AND role IN ('OPERATOR', 'DRIVER', 'CLIENT_USER'))
  );

DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;
CREATE POLICY profiles_update_policy ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR public.get_user_role() = 'SUPERADMIN'
    OR (public.get_user_role() = 'ADMIN' AND role NOT IN ('SUPERADMIN'))
    OR (public.get_user_role() = 'SUPERVISOR' AND role IN ('OPERATOR', 'DRIVER', 'CLIENT_USER'))
  ) WITH CHECK (
    (id = auth.uid() AND role = public.get_user_role())
    OR public.get_user_role() = 'SUPERADMIN'
    OR (public.get_user_role() = 'ADMIN' AND role NOT IN ('SUPERADMIN'))
    OR (public.get_user_role() = 'SUPERVISOR' AND role IN ('OPERATOR', 'DRIVER', 'CLIENT_USER'))
  );

DROP POLICY IF EXISTS profiles_delete_policy ON public.profiles;
CREATE POLICY profiles_delete_policy ON public.profiles
  FOR DELETE USING (
    public.get_user_role() = 'SUPERADMIN'
  );

-- ------------------------------------------
-- 6.2 DRIVERS POLICIES
-- ------------------------------------------
DROP POLICY IF EXISTS drivers_select_policy ON public.drivers;
CREATE POLICY drivers_select_policy ON public.drivers
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR') 
    OR profile_id = auth.uid()
  );

DROP POLICY IF EXISTS drivers_insert_policy ON public.drivers;
CREATE POLICY drivers_insert_policy ON public.drivers
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

DROP POLICY IF EXISTS drivers_update_policy ON public.drivers;
CREATE POLICY drivers_update_policy ON public.drivers
  FOR UPDATE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR') 
    OR profile_id = auth.uid()
  ) WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR') 
    OR profile_id = auth.uid()
  );

DROP POLICY IF EXISTS drivers_delete_policy ON public.drivers;
CREATE POLICY drivers_delete_policy ON public.drivers
  FOR DELETE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

-- ------------------------------------------
-- 6.3 COMPANIES POLICIES
-- ------------------------------------------
DROP POLICY IF EXISTS companies_select_policy ON public.companies;
CREATE POLICY companies_select_policy ON public.companies
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    OR id IN (SELECT company_id FROM public.company_users WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS companies_insert_policy ON public.companies;
CREATE POLICY companies_insert_policy ON public.companies
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
  );

DROP POLICY IF EXISTS companies_update_policy ON public.companies;
CREATE POLICY companies_update_policy ON public.companies
  FOR UPDATE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
  ) WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
  );

DROP POLICY IF EXISTS companies_delete_policy ON public.companies;
CREATE POLICY companies_delete_policy ON public.companies
  FOR DELETE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

-- ------------------------------------------
-- 6.4 COMPANY USERS POLICIES
-- ------------------------------------------
DROP POLICY IF EXISTS company_users_select_policy ON public.company_users;
CREATE POLICY company_users_select_policy ON public.company_users
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
    OR profile_id = auth.uid()
  );

DROP POLICY IF EXISTS company_users_insert_policy ON public.company_users;
CREATE POLICY company_users_insert_policy ON public.company_users
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
  );

DROP POLICY IF EXISTS company_users_update_policy ON public.company_users;
CREATE POLICY company_users_update_policy ON public.company_users
  FOR UPDATE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
  ) WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
  );

DROP POLICY IF EXISTS company_users_delete_policy ON public.company_users;
CREATE POLICY company_users_delete_policy ON public.company_users
  FOR DELETE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
  );

-- ------------------------------------------
-- 6.5 CUSTOMERS POLICIES
-- ------------------------------------------
DROP POLICY IF EXISTS customers_select_policy ON public.customers;
CREATE POLICY customers_select_policy ON public.customers
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS customers_insert_policy ON public.customers;
CREATE POLICY customers_insert_policy ON public.customers
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    OR (public.get_user_role() = 'CLIENT_USER' AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS customers_update_policy ON public.customers;
CREATE POLICY customers_update_policy ON public.customers
  FOR UPDATE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    OR user_id = auth.uid()
  ) WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS customers_delete_policy ON public.customers;
CREATE POLICY customers_delete_policy ON public.customers
  FOR DELETE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

-- ------------------------------------------
-- 6.6 CUSTOMER LINK TOKENS POLICIES
-- ------------------------------------------
DROP POLICY IF EXISTS customer_link_tokens_admin_policy ON public.customer_link_tokens;
CREATE POLICY customer_link_tokens_admin_policy ON public.customer_link_tokens
  FOR ALL USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
  );

-- ------------------------------------------
-- 6.7 USER PERMISSIONS POLICIES
-- ------------------------------------------
DROP POLICY IF EXISTS user_permissions_select_policy ON public.user_permissions;
CREATE POLICY user_permissions_select_policy ON public.user_permissions
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
    OR profile_id = auth.uid()
  );

DROP POLICY IF EXISTS user_permissions_insert_policy ON public.user_permissions;
CREATE POLICY user_permissions_insert_policy ON public.user_permissions
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

DROP POLICY IF EXISTS user_permissions_update_policy ON public.user_permissions;
CREATE POLICY user_permissions_update_policy ON public.user_permissions
  FOR UPDATE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  ) WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

DROP POLICY IF EXISTS user_permissions_delete_policy ON public.user_permissions;
CREATE POLICY user_permissions_delete_policy ON public.user_permissions
  FOR DELETE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

-- ------------------------------------------
-- 6.8 RIDES POLICIES
-- ------------------------------------------
DROP POLICY IF EXISTS rides_select_policy ON public.rides;
CREATE POLICY rides_select_policy ON public.rides
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    OR (status = 'pending' AND public.get_user_role() = 'DRIVER')
    OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    OR created_by = auth.uid()
    OR customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS rides_insert_policy ON public.rides;
CREATE POLICY rides_insert_policy ON public.rides
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    OR (
      public.get_user_role() = 'CLIENT_USER'
      AND (created_by IS NULL OR created_by = auth.uid())
      AND status = 'pending'
      AND driver_id IS NULL
      AND wait_time_minutes = 0
      AND wait_time_cost = 0.00
    )
  );

DROP POLICY IF EXISTS rides_update_policy ON public.rides;
CREATE POLICY rides_update_policy ON public.rides
  FOR UPDATE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    OR (created_by = auth.uid() AND status = 'pending')
  ) WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR')
    OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    OR (created_by = auth.uid() AND status IN ('pending', 'cancelled'))
  );

DROP POLICY IF EXISTS rides_delete_policy ON public.rides;
CREATE POLICY rides_delete_policy ON public.rides
  FOR DELETE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

-- ------------------------------------------
-- 6.9 DRIVER SETTLEMENTS POLICIES (LIQUIDACIONES)
-- ------------------------------------------
DROP POLICY IF EXISTS driver_settlements_select_policy ON public.driver_settlements;
CREATE POLICY driver_settlements_select_policy ON public.driver_settlements
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
    OR (public.get_user_role() = 'SUPERVISOR' AND public.has_permission('financial_balances.view'))
    OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS driver_settlements_insert_policy ON public.driver_settlements;
CREATE POLICY driver_settlements_insert_policy ON public.driver_settlements
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

DROP POLICY IF EXISTS driver_settlements_update_policy ON public.driver_settlements;
CREATE POLICY driver_settlements_update_policy ON public.driver_settlements
  FOR UPDATE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  ) WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

DROP POLICY IF EXISTS driver_settlements_delete_policy ON public.driver_settlements;
CREATE POLICY driver_settlements_delete_policy ON public.driver_settlements
  FOR DELETE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

-- ------------------------------------------
-- 6.10 CORPORATE TICKETS POLICIES (VALES CORPORATIVOS)
-- ------------------------------------------
DROP POLICY IF EXISTS corporate_tickets_select_policy ON public.corporate_tickets;
CREATE POLICY corporate_tickets_select_policy ON public.corporate_tickets
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
    OR (public.get_user_role() = 'SUPERVISOR' AND public.has_permission('financial_balances.view'))
    OR public.get_user_role() IN ('SUPERVISOR', 'OPERATOR')
    OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS corporate_tickets_insert_policy ON public.corporate_tickets;
CREATE POLICY corporate_tickets_insert_policy ON public.corporate_tickets
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
  );

DROP POLICY IF EXISTS corporate_tickets_update_policy ON public.corporate_tickets;
CREATE POLICY corporate_tickets_update_policy ON public.corporate_tickets
  FOR UPDATE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
  ) WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
  );

DROP POLICY IF EXISTS corporate_tickets_delete_policy ON public.corporate_tickets;
CREATE POLICY corporate_tickets_delete_policy ON public.corporate_tickets
  FOR DELETE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

-- ==========================================
-- 7. ESTRATEGIA DE HISTÓRICO DE CARRERAS
-- ==========================================
-- NOTA TECNICA DE MIGRACIÓN:
-- Queda estrictamente prohibido realizar backfill automático de rides.customer_id
-- basándose únicamente en emparejamiento de nombres (requester_person).
-- 
-- Todas las filas existentes en public.rides permanecen 100% INTACTAS.
-- Sus campos requester_person y requester_company conservan sus datos históricos sin alteración.
-- El nuevo campo rides.customer_id permanecerá NULL para carreras históricas hasta que
-- se ejecute un proceso posterior controlado de reconciliación.
