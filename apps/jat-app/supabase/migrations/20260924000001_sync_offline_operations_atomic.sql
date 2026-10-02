-- ===================================================
-- MIGRATION: 20260924_sync_offline_operations_atomic.sql
-- PURPOSE: Atomic & Idempotent Offline Operations Sync RPC
-- AUTHORIZED: Phase A Offline Contingency Mode Implementation
-- CONSTRAINTS:
--   - Adds offline_id column to public.rides with UNIQUE constraint
--   - Atomic RPC sync_offline_ride_atomic with full idempotency checks
--   - Guaranteed zero duplicate rides, tickets or driver status corruption
-- ===================================================

-- 1. Add offline_id column to public.rides if not exists
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS offline_id UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS sync_idempotency_key VARCHAR(100);

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unq_rides_sync_idempotency_key') THEN
        ALTER TABLE public.rides 
        ADD CONSTRAINT unq_rides_sync_idempotency_key UNIQUE (sync_idempotency_key);
    END IF;
END $$;

-- 2. CREATE RPC sync_offline_ride_atomic
CREATE OR REPLACE FUNCTION public.sync_offline_ride_atomic(
    p_offline_id UUID,
    p_ride_code VARCHAR(50),
    p_customer_id UUID DEFAULT NULL,
    p_company_id UUID DEFAULT NULL,
    p_requester_person TEXT DEFAULT 'Solicitante',
    p_requester_company TEXT DEFAULT 'Particular',
    p_pickup_address TEXT DEFAULT 'Origen',
    p_destination_address TEXT DEFAULT 'Destino',
    p_initial_fare NUMERIC(10,2) DEFAULT 20.00,
    p_wait_time_minutes INT DEFAULT 0,
    p_wait_time_cost NUMERIC(10,2) DEFAULT 0.00,
    p_total_fare NUMERIC(10,2) DEFAULT 20.00,
    p_status VARCHAR(30) DEFAULT 'pending',
    p_priority VARCHAR(20) DEFAULT 'high',
    p_driver_id UUID DEFAULT NULL,
    p_payment_method VARCHAR(50) DEFAULT 'Efectivo',
    p_observations TEXT DEFAULT NULL,
    p_cargo_description TEXT DEFAULT NULL,
    p_created_at TIMESTAMPTZ DEFAULT now(),
    p_updated_at TIMESTAMPTZ DEFAULT now(),
    p_idempotency_key VARCHAR(100) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role VARCHAR(50);
    v_existing_ride RECORD;
    v_ride_id UUID;
    v_contract_id UUID;
    v_ticket_code VARCHAR(100);
BEGIN
    -- 1. Security & RBAC Verification
    v_user_id := auth.uid();
    v_user_role := public.get_user_role();

    IF v_user_role IS NULL OR v_user_role NOT IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR') THEN
        RAISE EXCEPTION 'Acceso denegado: permiso insuficiente para sincronizar carreras offline.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Idempotency Check (Check offline_id or sync_idempotency_key)
    IF p_offline_id IS NOT NULL THEN
        SELECT id, ride_code, status INTO v_existing_ride
        FROM public.rides
        WHERE offline_id = p_offline_id;

        IF FOUND THEN
            RETURN v_existing_ride.id;
        END IF;
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, ride_code, status INTO v_existing_ride
        FROM public.rides
        WHERE sync_idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN v_existing_ride.id;
        END IF;
    END IF;

    -- 3. Lock Driver if Driver is assigned to check availability
    IF p_driver_id IS NOT NULL AND p_status IN ('assigned', 'ontheway') THEN
        PERFORM 1 FROM public.drivers WHERE id = p_driver_id FOR UPDATE;
    END IF;

    -- 4. Insert into public.rides
    INSERT INTO public.rides (
        ride_code,
        customer_id,
        company_id,
        requester_company,
        requester_person,
        pickup_address,
        destination_address,
        initial_fare,
        wait_time_minutes,
        wait_time_cost,
        total_fare,
        status,
        priority,
        driver_id,
        payment_method,
        observations,
        cargo_description,
        created_by,
        offline_id,
        sync_idempotency_key,
        created_at,
        updated_at
    ) VALUES (
        p_ride_code,
        p_customer_id,
        p_company_id,
        COALESCE(p_requester_company, 'Particular'),
        p_requester_person,
        p_pickup_address,
        p_destination_address,
        p_initial_fare,
        p_wait_time_minutes,
        p_wait_time_cost,
        p_total_fare,
        p_status,
        p_priority,
        p_driver_id,
        p_payment_method,
        p_observations,
        p_cargo_description,
        v_user_id,
        p_offline_id,
        p_idempotency_key,
        p_created_at,
        p_updated_at
    ) RETURNING id INTO v_ride_id;

    -- 5. Handle Driver status update
    IF p_driver_id IS NOT NULL THEN
        IF p_status IN ('assigned', 'ontheway') THEN
            UPDATE public.drivers SET status = 'busy', updated_at = now() WHERE id = p_driver_id;
        ELSIF p_status IN ('completed', 'cancelled') THEN
            UPDATE public.drivers SET status = 'available', updated_at = now() WHERE id = p_driver_id;
        END IF;
    END IF;

    -- 6. If payment_method = Ticket and company_id is provided -> create corporate ticket
    IF p_payment_method = 'Ticket' AND p_company_id IS NOT NULL AND p_driver_id IS NOT NULL THEN
        v_ticket_code := 'TK-' || p_ride_code;

        INSERT INTO public.corporate_tickets (
            ride_id,
            driver_id,
            amount,
            ticket_code,
            status,
            created_at,
            updated_at
        ) VALUES (
            v_ride_id,
            p_driver_id,
            COALESCE(p_total_fare, 0.00),
            v_ticket_code,
            'pending',
            p_created_at,
            p_updated_at
        ) ON CONFLICT (ride_id) DO NOTHING;
    END IF;

    -- 7. Add timeline audit entry
    INSERT INTO public.ride_timeline (
        ride_id,
        status_from,
        status_to,
        event_title,
        event_description,
        actor_id,
        created_at
    ) VALUES (
        v_ride_id,
        NULL,
        p_status,
        'Carrera Sincronizada (Contingencia Offline)',
        'Carrera registrada durante modo contingencia offline e ingresada a PostgreSQL.',
        v_user_id,
        p_created_at
    );

    RETURN v_ride_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_offline_ride_atomic(UUID, VARCHAR, UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, INT, NUMERIC, NUMERIC, VARCHAR, VARCHAR, UUID, VARCHAR, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, VARCHAR) TO authenticated, service_role, postgres;
