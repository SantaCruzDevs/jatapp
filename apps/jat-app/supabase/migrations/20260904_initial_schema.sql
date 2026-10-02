-- Migration: 20260904_initial_schema.sql
-- Description: Single-Company PostgreSQL relational schema for JATapp (MotoJAT) with Row Level Security (RLS) and SUPERADMIN support.

-- 1. Helper trigger function for automatic updated_at timestamping
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- 2. Helper SECURITY DEFINER function to retrieve user role safely without RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS VARCHAR AS $$
DECLARE
    u_role VARCHAR;
BEGIN
    SELECT role INTO u_role FROM public.profiles WHERE id = auth.uid();
    RETURN COALESCE(u_role, 'CLIENT_USER');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- 3. Create Tables

-- 3.1 Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL DEFAULT 'CLIENT_USER' CHECK (role IN ('SUPERADMIN', 'ADMIN', 'OPERATOR', 'DRIVER', 'CLIENT_USER')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3.2 Drivers Table (MotoJAT Fleet)
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    movil_number INT NOT NULL UNIQUE,
    vehicle_type VARCHAR(100) NOT NULL,
    vehicle_plate VARCHAR(50) NOT NULL,
    zone VARCHAR(100) NOT NULL,
    rating NUMERIC(3,2) DEFAULT 5.00 CHECK (rating >= 1.00 AND rating <= 5.00),
    status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'busy', 'offline')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3.3 Rides Table (Express Services / Expedientes de Carrera)
CREATE TABLE IF NOT EXISTS public.rides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_code VARCHAR(50) UNIQUE NOT NULL,
    requester_company VARCHAR(255) NOT NULL,
    requester_person VARCHAR(255) NOT NULL,
    pickup_address TEXT NOT NULL,
    destination_address TEXT NOT NULL,
    initial_fare NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (initial_fare >= 0),
    wait_time_minutes INT DEFAULT 0 CHECK (wait_time_minutes >= 0),
    wait_time_cost NUMERIC(10,2) DEFAULT 0.00 CHECK (wait_time_cost >= 0),
    total_fare NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_fare >= 0),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'ontheway', 'completed', 'cancelled')),
    priority VARCHAR(50) DEFAULT 'high' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
    payment_method VARCHAR(50) CHECK (payment_method IN ('Efectivo', 'QR', 'Ticket')),
    observations TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3.4 Ride Timeline Table (Service Audit Trail)
CREATE TABLE IF NOT EXISTS public.ride_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID REFERENCES public.rides(id) ON DELETE CASCADE NOT NULL,
    status_from VARCHAR(50),
    status_to VARCHAR(50) NOT NULL,
    event_title VARCHAR(255) NOT NULL,
    event_description TEXT,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3.5 Driver Settlements Table (Financial Liquidations)
CREATE TABLE IF NOT EXISTS public.driver_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    total_rides INT NOT NULL DEFAULT 0 CHECK (total_rides >= 0),
    gross_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (gross_amount >= 0),
    central_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00 CHECK (central_commission_pct >= 0 AND central_commission_pct <= 100),
    central_commission_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (central_commission_amount >= 0),
    driver_payout_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (driver_payout_amount >= 0),
    status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'voided')),
    settled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3.6 Corporate Tickets Table (Vales de servicio corporativo)
CREATE TABLE IF NOT EXISTS public.corporate_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID REFERENCES public.rides(id) ON DELETE CASCADE NOT NULL,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    ticket_code VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'cancelled')),
    settlement_id UUID REFERENCES public.driver_settlements(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. Triggers for Automatic updated_at (Idempotent)
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_drivers_updated_at ON public.drivers;
CREATE TRIGGER trg_drivers_updated_at BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_rides_updated_at ON public.rides;
CREATE TRIGGER trg_rides_updated_at BEFORE UPDATE ON public.rides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_driver_settlements_updated_at ON public.driver_settlements;
CREATE TRIGGER trg_driver_settlements_updated_at BEFORE UPDATE ON public.driver_settlements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_corporate_tickets_updated_at ON public.corporate_tickets;
CREATE TRIGGER trg_corporate_tickets_updated_at BEFORE UPDATE ON public.corporate_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Trigger for New User Auth Profile Creation (Idempotent)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    assigned_role VARCHAR;
    meta_role VARCHAR;
BEGIN
    meta_role := NEW.raw_user_meta_data->>'role';
    -- Only allow non-administrative roles via public signup metadata.
    -- SUPERADMIN and ADMIN CANNOT be granted via user metadata.
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Indexes for High Performance
CREATE INDEX IF NOT EXISTS idx_drivers_movil ON public.drivers(movil_number);
CREATE INDEX IF NOT EXISTS idx_rides_status ON public.rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON public.rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_corporate_tickets_driver_status ON public.corporate_tickets(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_driver ON public.driver_settlements(driver_id);

-- 7. Enable Row Level Security (RLS) on ALL Tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_settlements ENABLE ROW LEVEL SECURITY;

-- 8. Define RLS Policies (Idempotent with DROP POLICY IF EXISTS)

-- 8.1 Profiles Policies
DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;
CREATE POLICY profiles_select_policy ON public.profiles
  FOR SELECT USING (
    id = auth.uid() OR public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
  );

DROP POLICY IF EXISTS profiles_insert_policy ON public.profiles;
CREATE POLICY profiles_insert_policy ON public.profiles
  FOR INSERT WITH CHECK (
    public.get_user_role() = 'SUPERADMIN'
    OR (public.get_user_role() = 'ADMIN' AND role != 'SUPERADMIN')
  );

DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;
CREATE POLICY profiles_update_policy ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR public.get_user_role() = 'SUPERADMIN'
    OR (public.get_user_role() = 'ADMIN' AND role != 'SUPERADMIN')
  ) WITH CHECK (
    (id = auth.uid() AND role = public.get_user_role())
    OR public.get_user_role() = 'SUPERADMIN'
    OR (public.get_user_role() = 'ADMIN' AND role != 'SUPERADMIN')
  );

DROP POLICY IF EXISTS profiles_delete_policy ON public.profiles;
CREATE POLICY profiles_delete_policy ON public.profiles
  FOR DELETE USING (
    public.get_user_role() = 'SUPERADMIN'
  );

-- 8.2 Drivers Policies
DROP POLICY IF EXISTS drivers_select_policy ON public.drivers;
CREATE POLICY drivers_select_policy ON public.drivers
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR') OR profile_id = auth.uid()
  );

DROP POLICY IF EXISTS drivers_insert_policy ON public.drivers;
CREATE POLICY drivers_insert_policy ON public.drivers
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

DROP POLICY IF EXISTS drivers_update_policy ON public.drivers;
CREATE POLICY drivers_update_policy ON public.drivers
  FOR UPDATE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR') OR profile_id = auth.uid()
  ) WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR') OR profile_id = auth.uid()
  );

DROP POLICY IF EXISTS drivers_delete_policy ON public.drivers;
CREATE POLICY drivers_delete_policy ON public.drivers
  FOR DELETE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

-- 8.3 Rides Policies
DROP POLICY IF EXISTS rides_select_policy ON public.rides;
CREATE POLICY rides_select_policy ON public.rides
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
    OR (status = 'pending' AND public.get_user_role() = 'DRIVER')
    OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS rides_insert_policy ON public.rides;
CREATE POLICY rides_insert_policy ON public.rides
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
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
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
    OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    OR (created_by = auth.uid() AND status = 'pending')
  ) WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
    OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    OR (created_by = auth.uid() AND status IN ('pending', 'cancelled'))
  );

DROP POLICY IF EXISTS rides_delete_policy ON public.rides;
CREATE POLICY rides_delete_policy ON public.rides
  FOR DELETE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

-- 8.4 Ride Timeline Policies
DROP POLICY IF EXISTS ride_timeline_select_policy ON public.ride_timeline;
CREATE POLICY ride_timeline_select_policy ON public.ride_timeline
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
    OR actor_id = auth.uid()
    OR ride_id IN (
      SELECT id FROM public.rides 
      WHERE created_by = auth.uid() 
         OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS ride_timeline_insert_policy ON public.ride_timeline;
CREATE POLICY ride_timeline_insert_policy ON public.ride_timeline
  FOR INSERT WITH CHECK (
    (actor_id IS NULL OR actor_id = auth.uid())
    AND (
      public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
      OR ride_id IN (
        SELECT id FROM public.rides 
        WHERE created_by = auth.uid() 
           OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS ride_timeline_update_policy ON public.ride_timeline;
CREATE POLICY ride_timeline_update_policy ON public.ride_timeline
  FOR UPDATE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  ) WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

DROP POLICY IF EXISTS ride_timeline_delete_policy ON public.ride_timeline;
CREATE POLICY ride_timeline_delete_policy ON public.ride_timeline
  FOR DELETE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );

-- 8.5 Corporate Tickets Policies
DROP POLICY IF EXISTS corporate_tickets_select_policy ON public.corporate_tickets;
CREATE POLICY corporate_tickets_select_policy ON public.corporate_tickets
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
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

-- 8.6 Driver Settlements Policies
DROP POLICY IF EXISTS driver_settlements_select_policy ON public.driver_settlements;
CREATE POLICY driver_settlements_select_policy ON public.driver_settlements
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'OPERATOR')
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
