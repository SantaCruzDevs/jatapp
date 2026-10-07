-- ===================================================
-- MIGRATION: 20261007000000_client_contract_ticket_eligibility_atomic.sql
-- PURPOSE: Add uses_ticket_contract to public.customers and create atomic ride completion RPC
-- AUTHORIZED: CLIENT-CONTRACT-04 Implementation
-- ===================================================

-- 1. ADD COLUMNS TO PUBLIC.CUSTOMERS
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS uses_ticket_contract BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.customers.uses_ticket_contract IS 
'Indica si el cliente particular está autorizado para operar bajo la modalidad de Ticket sin pertenecer a una empresa.';

-- 2. CREATE ATOMIC RIDE STATUS UPDATE RPC FUNCTION
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
    -- Valid transitions:
    -- pending   -> assigned, cancelled
    -- assigned  -> ontheway, completed (Central), cancelled
    -- ontheway  -> completed, cancelled
    -- completed -> no transitions allowed
    -- cancelled -> no transitions allowed
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

    -- J. MUTATION 2: CREATE CORPORATE TICKET IF COMPLETED VIA TICKET
    IF p_new_status = 'completed' AND v_effective_payment = 'Ticket' AND v_ride.driver_id IS NOT NULL THEN
        v_ticket_code := 'VALE-' || v_ride.ride_code;

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

-- 3. SECURITY DEFINER GRANTS & SEARCH_PATH SECURITY
REVOKE EXECUTE ON FUNCTION public.update_ride_status_atomic(UUID, VARCHAR, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_ride_status_atomic(UUID, VARCHAR, VARCHAR, TEXT) TO authenticated;

-- 4. NOTIFY SCHEMA CACHE RELOAD
NOTIFY pgrst, 'reload schema';
