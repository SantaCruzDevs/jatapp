-- ===================================================
-- MIGRATION: 20261005000000_corporate_numbering_yymm_sequence.sql
-- PURPOSE: Professional Corporate Ride Code Generation (JAT-YYMM-NNNNNN)
-- AUTHORIZED: Phase 7 — Eliminar Math.random() y establecer PostgreSQL como autoridad única
-- CONSTRAINTS:
--   - Replaces client-side Math.random() with PostgreSQL Server-Side Authority
--   - Uses dynamic monthly sequences (ride_code_seq_YYMM) for lock-free atomic nextval
--   - Resets sequence to 000001 monthly without lock contention
--   - Provides DEFAULT expression trigger for public.rides
--   - Updates sync_offline_ride_atomic RPC to assign official JAT-YYMM-NNNNNN codes
--   - Ensures 100% backward compatibility with historical JAT-XXXXXX codes
-- ===================================================

-- 1. Helper RPC Function to Generate Next Corporate Ride Code (JAT-YYMM-NNNNNN)
CREATE OR REPLACE FUNCTION public.generate_next_ride_code()
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_yymm VARCHAR(4);
    v_seq_name VARCHAR(64);
    v_seq_val BIGINT;
BEGIN
    -- Get year and month in Bolivia timezone (America/La_Paz)
    v_yymm := TO_CHAR(NOW() AT TIME ZONE 'America/La_Paz', 'YYMM');
    v_seq_name := 'public.ride_code_seq_' || v_yymm;

    -- Safely create sequence for current YYMM if not existing
    BEGIN
        EXECUTE 'CREATE SEQUENCE IF NOT EXISTS ' || v_seq_name || ' START WITH 1 INCREMENT BY 1;';
    EXCEPTION WHEN OTHERS THEN
        -- Ignore concurrent sequence creation exception
        NULL;
    END;

    -- Fetch atomic, lock-free next value
    EXECUTE 'SELECT NEXTVAL(''' || v_seq_name || ''');' INTO v_seq_val;

    -- Return formatted code JAT-YYMM-NNNNNN
    RETURN 'JAT-' || v_yymm || '-' || LPAD(v_seq_val::TEXT, 6, '0');
END;
$$;

-- 2. Set Default Value on public.rides.ride_code
ALTER TABLE public.rides 
  ALTER COLUMN ride_code SET DEFAULT public.generate_next_ride_code();

-- 3. Trigger to ensure ride_code is assigned if NULL or empty or OFF-
CREATE OR REPLACE FUNCTION public.trg_assign_ride_code_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.ride_code IS NULL OR NEW.ride_code = '' OR NEW.ride_code LIKE 'OFF-%' THEN
        NEW.ride_code := public.generate_next_ride_code();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_ride_code ON public.rides;
CREATE TRIGGER trg_assign_ride_code
    BEFORE INSERT ON public.rides
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_assign_ride_code_before_insert();

-- 4. Update sync_offline_ride_atomic RPC to handle OFF- codes and return official code
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
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role VARCHAR(50);
    v_existing_ride RECORD;
    v_ride_id UUID;
    v_official_ride_code VARCHAR(50);
    v_ticket_code VARCHAR(100);
BEGIN
    -- Security & RBAC Check
    v_user_id := auth.uid();
    v_user_role := public.get_user_role();

    IF v_user_role IS NULL OR v_user_role NOT IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR') THEN
        RAISE EXCEPTION 'Acceso denegado: permiso insuficiente para sincronizar carreras offline.'
            USING ERRCODE = '42501';
    END IF;

    -- Idempotency Check
    IF p_offline_id IS NOT NULL THEN
        SELECT id, ride_code, status INTO v_existing_ride
        FROM public.rides
        WHERE offline_id = p_offline_id;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'ride_id', v_existing_ride.id,
                'ride_code', v_existing_ride.ride_code,
                'synced_already', true
            );
        END IF;
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, ride_code, status INTO v_existing_ride
        FROM public.rides
        WHERE sync_idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'ride_id', v_existing_ride.id,
                'ride_code', v_existing_ride.ride_code,
                'synced_already', true
            );
        END IF;
    END IF;

    -- Determine official ride_code
    IF p_ride_code IS NULL OR p_ride_code = '' OR p_ride_code LIKE 'OFF-%' THEN
        v_official_ride_code := public.generate_next_ride_code();
    ELSE
        v_official_ride_code := p_ride_code;
    END IF;

    -- Lock Driver if Driver is assigned
    IF p_driver_id IS NOT NULL AND p_status IN ('assigned', 'ontheway') THEN
        PERFORM 1 FROM public.drivers WHERE id = p_driver_id FOR UPDATE;
    END IF;

    -- Insert into public.rides
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
        v_official_ride_code,
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
    ) RETURNING id, ride_code INTO v_ride_id, v_official_ride_code;

    -- Driver status update
    IF p_driver_id IS NOT NULL THEN
        IF p_status IN ('assigned', 'ontheway') THEN
            UPDATE public.drivers SET status = 'busy', updated_at = now() WHERE id = p_driver_id;
        ELSIF p_status IN ('completed', 'cancelled') THEN
            UPDATE public.drivers SET status = 'available', updated_at = now() WHERE id = p_driver_id;
        END IF;
    END IF;

    -- Corporate Ticket creation
    IF p_company_id IS NOT NULL AND p_driver_id IS NOT NULL THEN
        v_ticket_code := 'VALE-' || v_official_ride_code;

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

    -- Timeline entry
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
        'Carrera Sincronizada Offline',
        'Carrera sincronizada atómicamente con código ' || v_official_ride_code,
        v_user_id,
        p_created_at
    );

    RETURN jsonb_build_object(
        'ride_id', v_ride_id,
        'ride_code', v_official_ride_code,
        'synced_already', false
    );
END;
$$;
