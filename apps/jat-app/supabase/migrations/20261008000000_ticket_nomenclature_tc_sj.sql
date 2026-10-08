-- ====================================================================
-- MIGRACIÓN DE NOMENCLATURA: TICKET CORPORATIVO DIGITAL (TC-)
-- ARCHIVO: 20261008000000_ticket_nomenclature_tc_sj.sql
--
-- PROPÓSITO:
-- Actualizar la generación de vales corporativos en las funciones RPC
-- public.update_ride_status_atomic y public.sync_offline_ride_atomic
-- para asignar el prefijo TC- (TC-YYMM-XXXXXX) a nuevos registros de corporate_tickets.
-- ====================================================================

-- 1. ACTUALIZAR RPC update_ride_status_atomic
CREATE OR REPLACE FUNCTION public.update_ride_status_atomic(
    p_ride_id UUID,
    p_new_status VARCHAR(30),
    p_payment_method VARCHAR(50) DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role VARCHAR(50);
    v_driver_id UUID;
    v_ride RECORD;
    v_effective_payment VARCHAR(50);
    v_is_eligible BOOLEAN := FALSE;
    v_company_uses_ticket BOOLEAN := FALSE;
    v_has_active_contract BOOLEAN := FALSE;
    v_customer_uses_ticket BOOLEAN := FALSE;
    v_customer_is_active BOOLEAN := FALSE;
    v_ticket_code TEXT;
    v_event_title TEXT;
BEGIN
    -- A. AUTHENTICATION CHECK
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado. Por favor inicie sesión.');
    END IF;

    -- B. GET AUTHORITATIVE USER ROLE
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL THEN
        v_user_role := 'OPERATOR';
    END IF;

    IF v_user_role = 'CLIENT_USER' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Los usuarios de cliente no están autorizados a modificar el estado de las carreras.');
    END IF;

    -- C. PESIMISTIC ROW LOCKING
    SELECT * INTO v_ride
    FROM public.rides
    WHERE id = p_ride_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La carrera no existe o fue eliminada.');
    END IF;

    -- D. DRIVER OWNERSHIP & TRANSITION RESTRICTIONS
    IF v_user_role = 'DRIVER' THEN
        SELECT id INTO v_driver_id
        FROM public.drivers
        WHERE profile_id = v_user_id;

        IF v_driver_id IS NULL OR v_ride.driver_id IS NULL OR v_ride.driver_id != v_driver_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'No está autorizado a modificar esta carrera.');
        END IF;

        IF v_ride.status = 'assigned' AND p_new_status = 'completed' THEN
            RETURN jsonb_build_object('success', false, 'error', 'El motoquero debe iniciar la carrera (''En Camino'') antes de poder finalizarla. El cierre directo en estado asignado es exclusivo de Central por contingencia.');
        END IF;

        IF p_new_status = 'cancelled' THEN
            RETURN jsonb_build_object('success', false, 'error', 'El motoquero no está autorizado a cancelar carreras. La cancelación debe ser procesada exclusivamente por la Central de Operaciones.');
        END IF;
    END IF;

    -- E. STATE MACHINE TRANSITION VALIDATION
    IF v_ride.status = 'pending' AND p_new_status NOT IN ('assigned', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', format('Transición de estado inválida: No es posible cambiar de ''%s'' a ''%s''.', UPPER(v_ride.status), UPPER(p_new_status)));
    ELSIF v_ride.status = 'assigned' AND p_new_status NOT IN ('ontheway', 'completed', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', format('Transición de estado inválida: No es posible cambiar de ''%s'' a ''%s''.', UPPER(v_ride.status), UPPER(p_new_status)));
    ELSIF v_ride.status = 'ontheway' AND p_new_status NOT IN ('completed', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', format('Transición de estado inválida: No es posible cambiar de ''%s'' a ''%s''.', UPPER(v_ride.status), UPPER(p_new_status)));
    ELSIF v_ride.status IN ('completed', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', format('Transición de estado inválida: No es posible cambiar de ''%s'' a ''%s''.', UPPER(v_ride.status), UPPER(p_new_status)));
    END IF;

    -- F. SURCHARGE BLOCK
    IF p_new_status = 'completed' AND v_ride.surcharge_status = 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Existe un sobrecargo pendiente de aprobación. El operador debe aprobarlo o rechazarlo antes de finalizar la carrera.');
    END IF;

    -- G. CANCELLATION REASON REQUIREMENT
    IF p_new_status = 'cancelled' AND (p_reason IS NULL OR trim(p_reason) = '') THEN
        RETURN jsonb_build_object('success', false, 'error', 'El motivo de cancelación es obligatorio.');
    END IF;

    -- H. TICKET ELIGIBILITY VALIDATION AT COMMIT TIME
    v_effective_payment := COALESCE(p_payment_method, v_ride.payment_method, 'Efectivo');

    IF p_new_status = 'completed' AND v_effective_payment = 'Ticket' THEN
        -- Priority Rule 1: COMPANY CLIENT (rides.company_id IS NOT NULL)
        IF v_ride.company_id IS NOT NULL THEN
            SELECT uses_ticket_contract INTO v_company_uses_ticket
            FROM public.companies
            WHERE id = v_ride.company_id;

            SELECT EXISTS (
                SELECT 1 FROM public.company_contracts
                WHERE company_id = v_ride.company_id
                  AND status = 'active'
                  AND (start_date IS NULL OR start_date <= CURRENT_DATE)
                  AND (end_date IS NULL OR end_date >= CURRENT_DATE)
            ) INTO v_has_active_contract;

            IF COALESCE(v_company_uses_ticket, FALSE) AND v_has_active_contract THEN
                v_is_eligible := TRUE;
            END IF;

        -- Priority Rule 2: PARTICULAR CLIENT (rides.company_id IS NULL AND rides.customer_id IS NOT NULL)
        ELSIF v_ride.customer_id IS NOT NULL THEN
            SELECT COALESCE(uses_ticket_contract, FALSE), COALESCE(is_active, TRUE)
            INTO v_customer_uses_ticket, v_customer_is_active
            FROM public.customers
            WHERE id = v_ride.customer_id;

            IF v_customer_uses_ticket AND v_customer_is_active THEN
                v_is_eligible := TRUE;
            END IF;
        END IF;

        -- IF NOT ELIGIBLE -> REJECT IMMEDIATELY (NO DATA MUTATION OCCURS)
        IF NOT v_is_eligible THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Este cliente no tiene contrato con MotoJAT. No se puede cobrar esta carrera mediante Ticket. Selecciona Efectivo o QR.'
            );
        END IF;
    END IF;

    -- I. MUTATION 1: UPDATE RIDE
    UPDATE public.rides
    SET status = p_new_status,
        payment_method = v_effective_payment,
        updated_at = NOW()
    WHERE id = p_ride_id;

    -- J. MUTATION 2: CREATE CORPORATE TICKET IF COMPLETED VIA TICKET (TC-2610-000002)
    IF p_new_status = 'completed' AND v_effective_payment = 'Ticket' AND v_ride.driver_id IS NOT NULL THEN
        v_ticket_code := 'TC-' || REPLACE(v_ride.ride_code, 'JAT-', '');

        INSERT INTO public.corporate_tickets (
            ride_id,
            driver_id,
            amount,
            ticket_code,
            status,
            created_at,
            updated_at
        ) VALUES (
            p_ride_id,
            v_ride.driver_id,
            COALESCE(v_ride.total_fare, 0.00),
            v_ticket_code,
            'pending',
            NOW(),
            NOW()
        ) ON CONFLICT (ride_id) DO NOTHING;
    END IF;

    -- K. MUTATION 3: RELEASE DRIVER TO 'available'
    IF p_new_status IN ('completed', 'cancelled') AND v_ride.driver_id IS NOT NULL THEN
        UPDATE public.drivers
        SET status = 'available',
            updated_at = NOW()
        WHERE id = v_ride.driver_id;
    END IF;

    -- L. MUTATION 4: INSERT TIMELINE ENTRY
    IF p_new_status = 'completed' THEN
        IF v_user_role = 'DRIVER' THEN
            v_event_title := 'Servicio Completado — Motoquero';
        ELSIF v_ride.status = 'assigned' THEN
            v_event_title := 'Servicio Completado — Central (Contingencia)';
        ELSE
            v_event_title := 'Servicio Completado — Central';
        END IF;
    ELSIF p_new_status = 'cancelled' THEN
        v_event_title := 'Carrera Cancelada';
    ELSIF p_new_status = 'ontheway' THEN
        v_event_title := 'En Camino / En Curso';
    ELSIF p_new_status = 'assigned' THEN
        v_event_title := 'Motoquero Asignado';
    ELSE
        v_event_title := 'Estado cambiado a ' || UPPER(p_new_status);
    END IF;

    INSERT INTO public.ride_timeline (
        ride_id,
        status_from,
        status_to,
        event_title,
        event_description,
        actor_id,
        created_at
    ) VALUES (
        p_ride_id,
        v_ride.status,
        p_new_status,
        v_event_title,
        COALESCE(p_reason, format('Transición de %s a %s', UPPER(v_ride.status), UPPER(p_new_status))),
        v_user_id,
        NOW()
    );

    RETURN jsonb_build_object('success', true, 'ride_id', p_ride_id);
END;
$$;

-- 2. ACTUALIZAR RPC sync_offline_ride_atomic
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
    v_ride_id UUID;
    v_existing_ride RECORD;
    v_user_id UUID;
    v_official_ride_code VARCHAR(50);
    v_ticket_code VARCHAR(100);
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.' USING ERRCODE = '42501';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, ride_code, status INTO v_existing_ride
        FROM public.rides
        WHERE observations LIKE '%idempotency_key:' || p_idempotency_key || '%';

        IF FOUND THEN
            RETURN v_existing_ride.id;
        END IF;
    END IF;

    SELECT id, ride_code, status INTO v_existing_ride
    FROM public.rides
    WHERE id = p_offline_id;

    IF FOUND THEN
        UPDATE public.rides
        SET status = p_status,
            payment_method = p_payment_method,
            driver_id = COALESCE(p_driver_id, driver_id),
            updated_at = NOW()
        WHERE id = p_offline_id;

        v_ride_id := p_offline_id;
        v_official_ride_code := v_existing_ride.ride_code;
    ELSE
        IF p_ride_code IS NULL OR p_ride_code = '' OR p_ride_code LIKE 'OFF-%' THEN
            v_official_ride_code := public.generate_next_ride_code();
        ELSE
            v_official_ride_code := p_ride_code;
        END IF;

        INSERT INTO public.rides (
            id,
            ride_code,
            customer_id,
            company_id,
            requester_person,
            requester_company,
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
            created_at,
            updated_at
        ) VALUES (
            p_offline_id,
            v_official_ride_code,
            p_customer_id,
            p_company_id,
            p_requester_person,
            p_requester_company,
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
            CASE WHEN p_idempotency_key IS NOT NULL
                 THEN COALESCE(p_observations, '') || ' [idempotency_key:' || p_idempotency_key || ']'
                 ELSE p_observations END,
            p_cargo_description,
            v_user_id,
            p_created_at,
            p_updated_at
        );

        v_ride_id := p_offline_id;
    END IF;

    IF p_status = 'completed' AND p_payment_method = 'Ticket' AND p_driver_id IS NOT NULL THEN
        v_ticket_code := 'TC-' || REPLACE(v_official_ride_code, 'JAT-', '');

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
            p_total_fare,
            v_ticket_code,
            'pending',
            NOW(),
            NOW()
        ) ON CONFLICT (ride_id) DO NOTHING;
    END IF;

    IF p_status IN ('completed', 'cancelled') AND p_driver_id IS NOT NULL THEN
        UPDATE public.drivers
        SET status = 'available',
            updated_at = NOW()
        WHERE id = p_driver_id;
    END IF;

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
        'offline_pending',
        p_status,
        'Sincronización Modo Contingencia',
        'Carrera sincronizada atómicamente con código ' || v_official_ride_code,
        v_user_id,
        NOW()
    );

    RETURN v_ride_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_ride_status_atomic(UUID, VARCHAR, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_ride_status_atomic(UUID, VARCHAR, VARCHAR, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_offline_ride_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_offline_ride_atomic TO authenticated, service_role, postgres;
