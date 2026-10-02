-- Migration: 20261002_user_protection_hardening.sql
-- Description: Hardened RLS policies and PostgreSQL triggers for strict protection of SUPERADMIN (Soporte) and ADMIN roles.
-- Ensures zero privilege escalation and prohibits unauthorized modification of administrative data.

-- ==========================================
-- 1. SECURITY TRIGGER FOR PROFILES UPDATES
-- ==========================================

CREATE OR REPLACE FUNCTION public.enforce_profile_update_security()
RETURNS TRIGGER AS $$
DECLARE
  v_requester_role VARCHAR;
BEGIN
  -- Get active requester's role
  v_requester_role := public.get_user_role();

  -- Rule 1: A SUPERADMIN (Soporte) profile role can NEVER be changed to any other role
  IF OLD.role = 'SUPERADMIN' AND NEW.role != 'SUPERADMIN' THEN
    RAISE EXCEPTION 'Permiso denegado: El rol del usuario Soporte (SUPERADMIN) es inmutable.';
  END IF;

  -- Rule 2: Nobody can set NEW.role = 'SUPERADMIN' except service_role/postgres internal execution
  IF NEW.role = 'SUPERADMIN' AND OLD.role != 'SUPERADMIN' THEN
    IF current_user NOT IN ('service_role', 'postgres') THEN
      RAISE EXCEPTION 'Permiso denegado: No está permitido promover usuarios al rol Soporte (SUPERADMIN).';
    END IF;
  END IF;

  -- Rule 3: Role modifications
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- 3a. Self role modification is strictly prohibited for non-service users
    IF OLD.id = auth.uid() AND current_user NOT IN ('service_role', 'postgres') THEN
      RAISE EXCEPTION 'Permiso denegado: Un usuario no puede cambiar administrativamente su propio rol.';
    END IF;

    -- 3b. Only SUPERADMIN (Soporte) can modify an ADMIN's role
    IF OLD.role = 'ADMIN' AND v_requester_role != 'SUPERADMIN' AND current_user NOT IN ('service_role', 'postgres') THEN
      RAISE EXCEPTION 'Permiso denegado: Solo el usuario Soporte (SUPERADMIN) puede cambiar el rol de un Administrador.';
    END IF;

    -- 3c. SUPERVISOR can only assign OPERATOR, DRIVER, or CLIENT_USER roles
    IF v_requester_role = 'SUPERVISOR' AND NEW.role NOT IN ('OPERATOR', 'DRIVER', 'CLIENT_USER') AND current_user NOT IN ('service_role', 'postgres') THEN
      RAISE EXCEPTION 'Permiso denegado: Un Supervisor solo puede asignar roles operativos (Operador, Motoquero, Cliente).';
    END IF;

    -- 3d. Users with non-administrative roles cannot change any user role
    IF v_requester_role NOT IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR') AND current_user NOT IN ('service_role', 'postgres') THEN
      RAISE EXCEPTION 'Permiso denegado: No posee privilegios para modificar roles de usuario.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Attach trigger BEFORE UPDATE on public.profiles
DROP TRIGGER IF EXISTS trg_enforce_profile_update_security ON public.profiles;
CREATE TRIGGER trg_enforce_profile_update_security
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_update_security();


-- ==========================================
-- 2. HARDENED RLS POLICIES FOR PROFILES
-- ==========================================

DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;

CREATE POLICY profiles_update_policy ON public.profiles
  FOR UPDATE USING (
    -- 1. A user can update their own profile row (personal data)
    id = auth.uid()
    OR
    -- 2. SUPERADMIN (Soporte) can update any profile row
    public.get_user_role() = 'SUPERADMIN'
    OR
    -- 3. ADMIN can update profiles ONLY IF target is NOT SUPERADMIN and NOT another ADMIN
    (
      public.get_user_role() = 'ADMIN' 
      AND role NOT IN ('SUPERADMIN', 'ADMIN')
    )
    OR
    -- 4. SUPERVISOR can update operational profiles ONLY (OPERATOR, DRIVER, CLIENT_USER)
    (
      public.get_user_role() = 'SUPERVISOR' 
      AND role IN ('OPERATOR', 'DRIVER', 'CLIENT_USER')
    )
  ) WITH CHECK (
    -- 1. Self update requires role to remain identical to user's active role
    (id = auth.uid() AND role = public.get_user_role())
    OR
    -- 2. SUPERADMIN (Soporte) can check updates
    public.get_user_role() = 'SUPERADMIN'
    OR
    -- 3. ADMIN updates checked target role
    (
      public.get_user_role() = 'ADMIN' 
      AND role NOT IN ('SUPERADMIN', 'ADMIN')
    )
    OR
    -- 4. SUPERVISOR updates checked target role
    (
      public.get_user_role() = 'SUPERVISOR' 
      AND role IN ('OPERATOR', 'DRIVER', 'CLIENT_USER')
    )
  );

-- Hardened DELETE policy: Nobody can delete a SUPERADMIN profile
DROP POLICY IF EXISTS profiles_delete_policy ON public.profiles;

CREATE POLICY profiles_delete_policy ON public.profiles
  FOR DELETE USING (
    public.get_user_role() = 'SUPERADMIN' 
    AND role != 'SUPERADMIN'
  );
