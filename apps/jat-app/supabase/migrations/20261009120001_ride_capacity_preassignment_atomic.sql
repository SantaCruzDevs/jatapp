-- ============================================================
-- MIGRACIÓN: CONTROL DE CARGA OPERATIVA Y PREASIGNACIÓN DE CARRERAS (REASSIGNMENT-03)
-- Fecha: 2026-10-09
-- Descripción:
-- 1. RPC public.assign_ride_driver_atomic: Asignación/preasignación atómica con validación de capacidad pesimista (Max 1 ONTHEWAY + Max 1 ASSIGNED = Max 2 Total).
-- 2. RPC public.update_ride_status_atomic: Liberación condicional de motoqueros (mantiene 'busy' si restan carreras en espera o en curso).
-- 3. RPC public.reassign_ride_driver_atomic: Reasignación respetando el contexto de la carrera y la capacidad del motoquero receptor.
-- ============================================================

-- 1. CREACIÓN DE LA RPC ATÓMICA DE ASIGNACIÓN: public.assign_ride_driver_atomic
CREATE OR REPLACE FUNCTION public.assign_ride_driver_atomic(
    p_ride_id UUID,
    p_driver_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp, auth
AS $$
DECLARE
    v_user_id UUID;
    v_user_role VARCHAR(50);
    v_is_authorized BOOLEAN := FALSE;
    v_ride RECORD;
    v_driver RECORD;
    v_count_ontheway INT := 0;
    v_count_assigned INT := 0;
    v_total_active INT := 0;
    v_event_title TEXT;
    v_event_desc TEXT;
BEGIN
    -- A. AUTENTICACIÓN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado. Por favor inicie sesión.');
    END IF;

    -- B. ROLES Y VERIFICACIÓN RBAC
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL THEN
        v_user_role := 'OPERATOR';
    END IF;

    IF v_user_role IN ('DRIVER', 'CLIENT_USER') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No está autorizado a asignar carreras.');
    END IF;

    IF v_user_role IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR') THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'No posee los permisos necesarios para asignar carreras.');
    END IF;

    -- C. BLOQUEO PESIMISTA DE LA CARRERA
    SELECT * INTO v_ride
    FROM public.rides
    WHERE id = p_ride_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La carrera no existe o fue eliminada.');
    END IF;

    IF v_ride.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', format('No se puede asignar conductor a una carrera en estado ''%s''. Debe estar PENDING.', UPPER(v_ride.status)));
    END IF;

    -- D. BLOQUEO PESIMISTA DEL MOTOQUERO Y VALIDACIÓN DE ESTADO
    SELECT d.id, d.movil_number, d.status, p.full_name
    INTO v_driver
    FROM public.drivers d
    JOIN public.profiles p ON d.profile_id = p.id
    WHERE d.id = p_driver_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'El conductor seleccionado no existe.');
    END IF;

    IF v_driver.status = 'baja' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El conductor seleccionado está inactivo o dado de baja.');
    ELSIF v_driver.status = 'offline' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El motoquero seleccionado se encuentra fuera de línea (offline).');
    END IF;

    -- E. EVALUACIÓN DE CAPACIDAD OPERATIVA (MÁXIMO 1 ONTHEWAY + MÁXIMO 1 ASSIGNED = MÁXIMO 2 TOTAL)
    SELECT
        COUNT(*) FILTER (WHERE status = 'ontheway'),
        COUNT(*) FILTER (WHERE status = 'assigned')
    INTO v_count_ontheway, v_count_assigned
    FROM public.rides
    WHERE driver_id = p_driver_id;

    v_total_active := v_count_ontheway + v_count_assigned;

    IF v_count_assigned >= 1 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El motoquero seleccionado ya tiene una carrera en espera. No puede recibir más carreras.'
        );
    END IF;

    IF v_total_active >= 2 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Capacidad máxima alcanzada. El motoquero ya cuenta con una carrera en curso y una carrera en espera (máximo 2 carreras simultáneas).'
        );
    END IF;

    -- F. MUTACIÓN ATÓMICA 1: ACTUALIZAR CARRERA A ASSIGNED
    UPDATE public.rides
    SET driver_id = p_driver_id,
        status = 'assigned',
        updated_at = NOW()
    WHERE id = p_ride_id;

    -- G. MUTACIÓN ATÓMICA 2: MARCAR ESTADO DEL MOTOQUERO A BUSY
    UPDATE public.drivers
    SET status = 'busy',
        updated_at = NOW()
    WHERE id = p_driver_id;

    -- H. MUTACIÓN ATÓMICA 3: REGISTRAR EVEN TO EN RIDE_TIMELINE
    IF v_count_ontheway > 0 THEN
        v_event_title := 'Motoquero Preasignado';
        v_event_desc := format('Preasignado a Móvil #%s (%s) — Carrera en espera', v_driver.movil_number, v_driver.full_name);
    ELSE
        v_event_title := 'Motoquero Asignado';
        v_event_desc := format('Asignado a Móvil #%s (%s)', v_driver.movil_number, v_driver.full_name);
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
        'pending',
        'assigned',
        v_event_title,
        v_event_desc,
        v_user_id,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'ride_id', p_ride_id,
        'driver_id', p_driver_id,
        'movil_number', v_driver.movil_number,
        'is_preassignment', (v_count_ontheway > 0),
        'message', format('Carrera %s asignada exitosamente al Móvil #%s (%s).', v_ride.ride_code, v_driver.movil_number, v_driver.full_name)
    );
END;
$$;


-- 2. ACTUALIZACIÓN DE RPC public.update_ride_status_atomic (LIBERACIÓN CONDICIONAL DE MOTOQUERO)
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
    v_final_code VARCHAR(50);
    v_event_title TEXT;
    v_has_other_active_rides BOOLEAN := FALSE;
BEGIN
    -- A. CHECK DE AUTENTICACIÓN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado. Por favor inicie sesión.');
    END IF;

    -- B. ROL AUTORITATIVO
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL THEN
        v_user_role := 'OPERATOR';
    END IF;

    IF v_user_role = 'CLIENT_USER' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Los usuarios de cliente no están autorizados a modificar el estado de las carreras.');
    END IF;

    -- C. BLOQUEO PESIMISTA DE FILA
    SELECT * INTO v_ride
    FROM public.rides
    WHERE id = p_ride_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La carrera no existe o fue eliminada.');
    END IF;

    -- D. RESTRICCIONES DE CONDUCTOR
    IF v_user_role = 'DRIVER' THEN
        SELECT id INTO v_driver_id
        FROM public.drivers
        WHERE profile_id = v_user_id;

        IF v_driver_id IS NULL OR v_ride.driver_id IS NULL OR v_ride.driver_id != v_driver_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'No está autorizado a modificar esta carrera.');
        END IF;

        IF v_ride.status = 'assigned' AND p_new_status = 'completed' THEN
            RETURN jsonb_build_object('success', false, 'error', 'El motoquero debe iniciar la carrera (''En Camino'') antes de poder finalizarla.');
        END IF;

        IF p_new_status = 'cancelled' THEN
            RETURN jsonb_build_object('success', false, 'error', 'El motoquero no está autorizado a cancelar o anular carreras.');
        END IF;
    END IF;

    -- E. VALIDACIÓN DE MÁQUINA DE ESTADOS
    IF v_ride.status = 'pending' AND p_new_status NOT IN ('assigned', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', format('Transición de estado inválida: No es posible cambiar de ''%s'' a ''%s''.', UPPER(v_ride.status), UPPER(p_new_status)));
    ELSIF v_ride.status = 'assigned' AND p_new_status NOT IN ('ontheway', 'completed', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', format('Transición de estado inválida: No es posible cambiar de ''%s'' a ''%s''.', UPPER(v_ride.status), UPPER(p_new_status)));
    ELSIF v_ride.status = 'ontheway' AND p_new_status NOT IN ('completed', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', format('Transición de estado inválida: No es posible cambiar de ''%s'' a ''%s''.', UPPER(v_ride.status), UPPER(p_new_status)));
    ELSIF v_ride.status IN ('completed', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', format('Transición de estado inválida: No es posible cambiar de ''%s'' a ''%s''.', UPPER(v_ride.status), UPPER(p_new_status)));
    END IF;

    -- F. BLOQUEO DE SOBRECARGO PENDIENTE
    IF p_new_status = 'completed' AND v_ride.surcharge_status = 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Existe un sobrecargo pendiente de aprobación. El operador debe aprobarlo o rechazarlo antes de finalizar la carrera.');
    END IF;

    -- G. MOTIVO DE CANCELACIÓN OBLIGATORIO
    IF p_new_status = 'cancelled' AND (p_reason IS NULL OR trim(p_reason) = '') THEN
        RETURN jsonb_build_object('success', false, 'error', 'El motivo de cancelación o anulación es obligatorio.');
    END IF;

    -- H. ELEGIBILIDAD TICKET A NIVEL DE COMMIT
    v_effective_payment := COALESCE(p_payment_method, v_ride.payment_method, 'Efectivo');

    IF p_new_status = 'completed' AND v_effective_payment = 'Ticket' THEN
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

        ELSIF v_ride.customer_id IS NOT NULL THEN
            SELECT COALESCE(uses_ticket_contract, FALSE), COALESCE(is_active, TRUE)
            INTO v_customer_uses_ticket, v_customer_is_active
            FROM public.customers
            WHERE id = v_ride.customer_id;

            IF v_customer_uses_ticket AND v_customer_is_active THEN
                v_is_eligible := TRUE;
            END IF;
        END IF;

        IF NOT v_is_eligible THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Este cliente no tiene contrato con MotoJAT. No se puede cobrar esta carrera mediante Ticket. Selecciona Efectivo o QR.'
            );
        END IF;
    END IF;

    -- I. DETERMINAR CÓDIGO FINAL DE COMPROBANTE DE FORMA ATÓMICA
    v_final_code := v_ride.ride_code;

    IF p_new_status = 'completed' THEN
        IF v_effective_payment = 'Ticket' THEN
            IF v_final_code LIKE 'JAT-%' OR v_final_code LIKE 'TC-%' OR v_final_code LIKE 'SJ-%' OR v_final_code LIKE 'OFF-%' THEN
                v_final_code := REPLACE(REPLACE(REPLACE(v_final_code, 'JAT-', 'TK-'), 'TC-', 'TK-'), 'SJ-', 'TK-');
            END IF;
        ELSE
            IF v_final_code LIKE 'JAT-%' OR v_final_code LIKE 'TC-%' OR v_final_code LIKE 'OFF-%' THEN
                v_final_code := REPLACE(REPLACE(v_final_code, 'JAT-', 'SJ-'), 'TC-', 'SJ-');
            END IF;
        END IF;
    END IF;

    -- J. MUTACIÓN 1: ACTUALIZAR CARRERA
    UPDATE public.rides
    SET status = p_new_status,
        payment_method = v_effective_payment,
        ride_code = v_final_code,
        cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN NOW() ELSE cancelled_at END,
        cancelled_by = CASE WHEN p_new_status = 'cancelled' THEN v_user_id ELSE cancelled_by END,
        cancellation_reason = CASE WHEN p_new_status = 'cancelled' THEN trim(p_reason) ELSE cancellation_reason END,
        updated_at = NOW()
    WHERE id = p_ride_id;

    -- K. MUTACIÓN 2: CREAR / ACTUALIZAR TICKET CORPORATIVO SI CORRESPONDE
    IF p_new_status = 'completed' AND v_effective_payment = 'Ticket' AND v_ride.driver_id IS NOT NULL THEN
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
            v_final_code,
            'pending',
            NOW(),
            NOW()
        ) ON CONFLICT (ride_id) DO UPDATE
        SET ticket_code = EXCLUDED.ticket_code,
            status = 'pending',
            updated_at = NOW();
    END IF;

    -- L. MUTACIÓN 3: LIBERACIÓN CONDICIONAL DEL MOTOQUERO A 'available'
    IF p_new_status IN ('completed', 'cancelled') AND v_ride.driver_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.rides
            WHERE driver_id = v_ride.driver_id
              AND id != p_ride_id
              AND status IN ('assigned', 'ontheway')
        ) INTO v_has_other_active_rides;

        IF NOT v_has_other_active_rides THEN
            UPDATE public.drivers
            SET status = 'available',
                updated_at = NOW()
            WHERE id = v_ride.driver_id;
        END IF;
    END IF;

    -- M. MUTACIÓN 4: INSERTAR TIMELINE
    IF p_new_status = 'completed' THEN
        IF v_user_role = 'DRIVER' THEN
            v_event_title := 'Servicio Completado — Motoquero';
        ELSIF v_ride.status = 'assigned' THEN
            v_event_title := 'Servicio Completado — Central (Contingencia)';
        ELSE
            v_event_title := 'Servicio Completado — Central';
        END IF;
    ELSIF p_new_status = 'cancelled' THEN
        v_event_title := 'Carrera Cancelada / Anulada';
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
        CASE
            WHEN p_new_status = 'cancelled' THEN 'Motivo: ' || trim(p_reason)
            WHEN p_new_status = 'completed' THEN format('Finalizada vía %s. Código: %s', v_effective_payment, v_final_code)
            ELSE format('Transición de %s a %s', UPPER(v_ride.status), UPPER(p_new_status))
        END,
        v_user_id,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'ride_id', p_ride_id,
        'ride_code', v_final_code,
        'status', p_new_status,
        'payment_method', v_effective_payment,
        'message', format('Estado de carrera %s actualizado exitosamente a %s.', v_final_code, UPPER(p_new_status))
    );
END;
$$;


-- 3. ACTUALIZACIÓN DE RPC public.reassign_ride_driver_atomic (CAPACIDAD DE PREASIGNACIÓN Y RECEPTOR)
CREATE OR REPLACE FUNCTION public.reassign_ride_driver_atomic(
    p_ride_id UUID,
    p_new_driver_id UUID,
    p_reason_category VARCHAR(100),
    p_reason_detail TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp, auth
AS $$
DECLARE
    v_user_id UUID;
    v_user_role VARCHAR(50);
    v_is_authorized BOOLEAN := FALSE;
    v_ride RECORD;
    v_prev_driver RECORD;
    v_new_driver RECORD;
    v_prev_movil INT := NULL;
    v_new_movil INT;
    v_prev_driver_name TEXT := 'Sin Asignar';
    v_new_driver_name TEXT;
    v_reason_cat_clean VARCHAR(100);
    v_detail_trimmed TEXT;
    v_prev_has_other_active BOOLEAN := FALSE;
    v_new_count_ontheway INT := 0;
    v_new_count_assigned INT := 0;
    v_new_total INT := 0;
    v_event_desc TEXT;
BEGIN
    -- A. AUTHENTICATION CHECK
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado. Por favor inicie sesión.');
    END IF;

    -- B. GET AUTHORITATIVE USER ROLE & RBAC CHECK
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL THEN
        v_user_role := 'OPERATOR';
    END IF;

    IF v_user_role IN ('DRIVER', 'CLIENT_USER') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No está autorizado a reasignar carreras.');
    END IF;

    IF v_user_role IN ('SUPERADMIN', 'ADMIN') THEN
        v_is_authorized := TRUE;
    ELSIF public.has_permission('rides.reassign') THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'No posee el permiso requerido (rides.reassign) para reasignar carreras.');
    END IF;

    -- C. MOTIVO VALIDATION
    v_reason_cat_clean := upper(trim(COALESCE(p_reason_category, '')));
    IF v_reason_cat_clean = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debes indicar el motivo de la reasignación.');
    END IF;

    v_detail_trimmed := trim(COALESCE(p_reason_detail, ''));
    IF v_reason_cat_clean = 'OTRO' AND v_detail_trimmed = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debes indicar el detalle cuando seleccionas Otro.');
    END IF;

    -- D. PESSIMISTIC RIDE LOCKING
    SELECT * INTO v_ride
    FROM public.rides
    WHERE id = p_ride_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La carrera no existe o fue eliminada.');
    END IF;

    -- E. RIDE STATUS & SETTLEMENT VALIDATION
    IF v_ride.status = 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'La carrera ya fue completada.');
    ELSIF v_ride.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se puede reasignar una carrera que fue anulada o cancelada.');
    ELSIF v_ride.status NOT IN ('assigned', 'ontheway') THEN
        RETURN jsonb_build_object('success', false, 'error', format('No se puede reasignar una carrera en estado ''%s''. Debe estar asignada o en camino.', UPPER(v_ride.status)));
    END IF;

    IF v_ride.is_settled = TRUE OR v_ride.settlement_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No es posible reasignar esta carrera porque ya fue procesada en una liquidación financiera.');
    END IF;

    -- F. NEW DRIVER VALIDATION & PESSIMISTIC LOCKING
    SELECT d.id, d.movil_number, d.status, p.full_name
    INTO v_new_driver
    FROM public.drivers d
    JOIN public.profiles p ON d.profile_id = p.id
    WHERE d.id = p_new_driver_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'El conductor seleccionado no existe.');
    END IF;

    IF v_new_driver.id = v_ride.driver_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'El motoquero seleccionado es exactamente el mismo que ya está asignado.');
    END IF;

    IF v_new_driver.status = 'baja' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El conductor seleccionado está inactivo o dado de baja.');
    ELSIF v_new_driver.status = 'offline' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El motoquero seleccionado se encuentra fuera de línea (offline).');
    END IF;

    -- EVALUAR CAPACIDAD DEL MOTOQUERO RECEPTOR SEGÚN EL ESTADO DE LA CARRERA REASIGNADA
    SELECT
        COUNT(*) FILTER (WHERE status = 'ontheway'),
        COUNT(*) FILTER (WHERE status = 'assigned')
    INTO v_new_count_ontheway, v_new_count_assigned
    FROM public.rides
    WHERE driver_id = p_new_driver_id;

    v_new_total := v_new_count_ontheway + v_new_count_assigned;

    IF v_ride.status = 'ontheway' AND v_new_count_ontheway > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El motoquero seleccionado ya tiene una carrera en curso. No se le puede reasignar otra carrera en curso.');
    END IF;

    IF v_ride.status = 'assigned' AND v_new_count_assigned > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El motoquero seleccionado ya tiene una carrera en espera. No se le puede reasignar otra carrera en espera.');
    END IF;

    IF v_new_total >= 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Capacidad máxima alcanzada. El motoquero seleccionado ya cuenta con 2 carreras asociadas (1 en curso y 1 en espera).');
    END IF;

    -- G. PREVIOUS DRIVER DETAILS & LOCKING
    IF v_ride.driver_id IS NOT NULL THEN
        SELECT d.id, d.movil_number, d.status, p.full_name
        INTO v_prev_driver
        FROM public.drivers d
        JOIN public.profiles p ON d.profile_id = p.id
        WHERE d.id = v_ride.driver_id
        FOR UPDATE;

        IF FOUND THEN
            v_prev_movil := v_prev_driver.movil_number;
            v_prev_driver_name := v_prev_driver.full_name;

            SELECT EXISTS (
                SELECT 1 FROM public.rides
                WHERE driver_id = v_ride.driver_id
                  AND id != p_ride_id
                  AND status IN ('assigned', 'ontheway')
            ) INTO v_prev_has_other_active;
        END IF;
    END IF;

    v_new_movil := v_new_driver.movil_number;
    v_new_driver_name := v_new_driver.full_name;

    -- H. ATOMIC MUTATION 1: LIBERAR MOTOQUERO ANTERIOR (SI NO TIENE OTRA CARRERA ACTIVA)
    IF v_ride.driver_id IS NOT NULL AND NOT v_prev_has_other_active THEN
        UPDATE public.drivers
        SET status = 'available',
            updated_at = NOW()
        WHERE id = v_ride.driver_id;
    END IF;

    -- I. ATOMIC MUTATION 2: OCUPAR NUEVO MOTOQUERO
    UPDATE public.drivers
    SET status = 'busy',
        updated_at = NOW()
    WHERE id = p_new_driver_id;

    -- J. ATOMIC MUTATION 3: ACTUALIZAR CARRERA (PRESERVA DRIVER_ID)
    UPDATE public.rides
    SET driver_id = p_new_driver_id,
        updated_at = NOW()
    WHERE id = p_ride_id;

    -- K. ATOMIC MUTATION 4: REGISTRAR EN public.ride_reassignments
    INSERT INTO public.ride_reassignments (
        ride_id,
        previous_driver_id,
        previous_movil_number,
        new_driver_id,
        new_movil_number,
        reason_category,
        reason_detail,
        reassigned_by,
        created_at
    ) VALUES (
        p_ride_id,
        v_ride.driver_id,
        v_prev_movil,
        p_new_driver_id,
        v_new_movil,
        v_reason_cat_clean,
        CASE WHEN v_detail_trimmed = '' THEN NULL ELSE v_detail_trimmed END,
        v_user_id,
        NOW()
    );

    -- L. ATOMIC MUTATION 5: REGISTRAR EVEN TO EN public.ride_timeline
    v_event_desc := format('Carrera reasignada de Móvil #%s (%s) a Móvil #%s (%s). Motivo: %s',
        COALESCE(v_prev_movil::text, 'S/M'),
        COALESCE(v_prev_driver_name, 'Sin Asignar'),
        v_new_movil,
        v_new_driver_name,
        v_reason_cat_clean
    );
    IF v_detail_trimmed != '' THEN
        v_event_desc := v_event_desc || format('. Detalle: %s', v_detail_trimmed);
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
        v_ride.status,
        'Carrera Reasignada',
        v_event_desc,
        v_user_id,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'ride_id', p_ride_id,
        'ride_code', v_ride.ride_code,
        'new_driver_id', p_new_driver_id,
        'new_movil_number', v_new_movil,
        'message', format('Carrera %s reasignada exitosamente al Móvil #%s (%s).', v_ride.ride_code, v_new_movil, v_new_driver_name)
    );
END;
$$;


-- 4. PRIVILEGIOS DE EJECUCIÓN
REVOKE EXECUTE ON FUNCTION public.assign_ride_driver_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_ride_driver_atomic(UUID, UUID) TO authenticated, service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.update_ride_status_atomic(UUID, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_ride_status_atomic(UUID, VARCHAR, VARCHAR, TEXT) TO authenticated, service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.reassign_ride_driver_atomic(UUID, UUID, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_ride_driver_atomic(UUID, UUID, VARCHAR, TEXT) TO authenticated, service_role, postgres;
