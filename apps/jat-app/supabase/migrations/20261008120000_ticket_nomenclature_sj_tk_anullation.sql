-- ====================================================================
-- MIGRACIÓN DE NOMENCLATURA DOCUMENTAL Y ANULACIÓN DE COMPROBANTES
-- ARCHIVO: 20261008120000_ticket_nomenclature_sj_tk_anullation.sql
-- 
-- PROPÓSITO:
-- 1. Establecer modelo definitivo de numeración pública: SJ- / TK-
--    con secuencia mensual única compartida (ride_code_seq_YYMM).
-- 2. Asignación atómica de códigos al crear o finalizar la carrera:
--    - Efectivo / QR -> SJ-YYMM-NNNNNN
--    - Ticket Digital -> TK-YYMM-NNNNNN
-- 3. Inmutabilidad del código de comprobante una vez emitido.
-- 4. Soporte para columnas de anulación en public.rides (cancelled_at, cancelled_by, cancellation_reason).
-- 5. Crear la función RPC public.cancel_digital_ticket_atomic(...) para anulación transaccional con auditoría.
-- 6. Integración con RBAC (permiso tickets.cancel) y restricción absoluta para DRIVER y CLIENT_USER.
-- ====================================================================

-- 1. AGREGAR COLUMNAS DE ANULACIÓN A public.rides
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id) DEFAULT NULL;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS cancellation_reason TEXT DEFAULT NULL;

-- 2. RE-DEFINIR GENERADOR DE CÓDIGOS CON PREFIJO SEGÚN PAGO (SJ- / TK-)
CREATE OR REPLACE FUNCTION public.generate_next_ride_code(p_payment_method VARCHAR DEFAULT 'Efectivo')
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_yymm VARCHAR(4);
    v_seq_name VARCHAR(64);
    v_seq_val BIGINT;
    v_prefix VARCHAR(10);
BEGIN
    -- Determinar prefijo según forma de pago
    IF p_payment_method = 'Ticket' THEN
        v_prefix := 'TK-';
    ELSE
        v_prefix := 'SJ-';
    END IF;

    -- Obtener año y mes en zona horaria de Bolivia
    v_yymm := TO_CHAR(NOW() AT TIME ZONE 'America/La_Paz', 'YYMM');
    v_seq_name := 'public.ride_code_seq_' || v_yymm;

    -- Crear secuencia si no existe
    BEGIN
        EXECUTE 'CREATE SEQUENCE IF NOT EXISTS ' || v_seq_name || ' START WITH 1 INCREMENT BY 1;';
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- Obtener siguiente valor atómico
    EXECUTE 'SELECT NEXTVAL(''' || v_seq_name || ''');' INTO v_seq_val;

    RETURN v_prefix || v_yymm || '-' || LPAD(v_seq_val::TEXT, 6, '0');
END;
$$;

-- Mantener sobrecarga de generate_next_ride_code() sin argumentos para DEFAULT / TRIGGER
CREATE OR REPLACE FUNCTION public.generate_next_ride_code()
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.generate_next_ride_code('Efectivo');
END;
$$;

-- 3. TRIGGER DE ASIGNACIÓN DE CÓDIGO ANTES DE INSERT EN RIDES
CREATE OR REPLACE FUNCTION public.trg_assign_ride_code_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.ride_code IS NULL OR NEW.ride_code = '' OR NEW.ride_code LIKE 'OFF-%' OR NEW.ride_code LIKE 'JAT-%' THEN
        NEW.ride_code := public.generate_next_ride_code(COALESCE(NEW.payment_method, 'Efectivo'));
    END IF;
    RETURN NEW;
END;
$$;

-- 4. ACTUALIZAR RPC update_ride_status_atomic
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

    -- C. PESSIMISTIC ROW LOCKING
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
            RETURN jsonb_build_object('success', false, 'error', 'El motoquero debe iniciar la carrera (''En Camino'') antes de poder finalizarla.');
        END IF;

        IF p_new_status = 'cancelled' THEN
            RETURN jsonb_build_object('success', false, 'error', 'El motoquero no está autorizado a cancelar o anular carreras.');
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
        RETURN jsonb_build_object('success', false, 'error', 'El motivo de cancelación o anulación es obligatorio.');
    END IF;

    -- H. TICKET ELIGIBILITY VALIDATION AT COMMIT TIME
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

    -- J. MUTATION 1: UPDATE RIDE
    UPDATE public.rides
    SET status = p_new_status,
        payment_method = v_effective_payment,
        ride_code = v_final_code,
        cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN NOW() ELSE cancelled_at END,
        cancelled_by = CASE WHEN p_new_status = 'cancelled' THEN v_user_id ELSE cancelled_by END,
        cancellation_reason = CASE WHEN p_new_status = 'cancelled' THEN trim(p_reason) ELSE cancellation_reason END,
        updated_at = NOW()
    WHERE id = p_ride_id;

    -- K. MUTATION 2: CREATE / UPDATE CORPORATE TICKET IF COMPLETED VIA TICKET
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

    -- L. MUTATION 3: RELEASE DRIVER TO 'available'
    IF p_new_status IN ('completed', 'cancelled') AND v_ride.driver_id IS NOT NULL THEN
        UPDATE public.drivers
        SET status = 'available',
            updated_at = NOW()
        WHERE id = v_ride.driver_id;
    END IF;

    -- M. MUTATION 4: INSERT TIMELINE ENTRY
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
        COALESCE(p_reason, format('Transición de %s a %s', UPPER(v_ride.status), UPPER(p_new_status))),
        v_user_id,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'ride_id', p_ride_id,
        'status', p_new_status,
        'ride_code', v_final_code,
        'message', format('Estado de carrera actualizado a %s exitosamente.', UPPER(p_new_status))
    );
END;
$$;

-- 5. RPC DE ANULACIÓN CONTROLADA DE COMPROBANTES: cancel_digital_ticket_atomic
CREATE OR REPLACE FUNCTION public.cancel_digital_ticket_atomic(
    p_ride_id UUID,
    p_cancellation_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role VARCHAR(50);
    v_ride RECORD;
    v_corp_ticket RECORD;
    v_reason_trimmed TEXT;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    -- A. AUTHENTICATION CHECK
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado. Por favor inicie sesión.');
    END IF;

    -- B. USER ROLE & ABSOLUTE WALL FOR DRIVERS AND CLIENT USERS
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL THEN
        v_user_role := 'OPERATOR';
    END IF;

    -- BLOQUEO ABSOLUTO: DRIVER y CLIENT_USER NUNCA pueden anular comprobantes
    IF v_user_role IN ('DRIVER', 'CLIENT_USER') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No está autorizado a anular comprobantes.');
    END IF;

    -- C. EVALUACIÓN DE AUTORIZACIÓN
    -- SUPERADMIN o ADMIN (Administradora Principal / Fabiana Perez) tienen autorización completa implícita
    IF v_user_role IN ('SUPERADMIN', 'ADMIN') THEN
        v_is_authorized := TRUE;
    ELSIF public.has_permission('tickets.cancel') THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'No posee el permiso requerido (tickets.cancel) para anular comprobantes.');
    END IF;

    -- D. VALIDACIÓN DE MOTIVO OBLIGATORIO
    v_reason_trimmed := trim(COALESCE(p_cancellation_reason, ''));
    IF v_reason_trimmed = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El motivo de anulación es obligatorio.');
    END IF;

    -- E. LOCK PESIMISTA DE LA CARRERA
    SELECT * INTO v_ride
    FROM public.rides
    WHERE id = p_ride_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La carrera no existe o fue eliminada.');
    END IF;

    -- F. VALIDACIÓN DE ESTADO PREVIO
    IF v_ride.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El comprobante ya se encuentra anulado.');
    END IF;

    -- G. VERIFICACIÓN FINANCIERA (BLOQUEO SI YA FUE PROCESADO EN LIQUIDACIÓN O EXTRACTO)
    IF v_ride.is_settled = TRUE OR v_ride.settlement_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No es posible anular este comprobante porque ya fue procesado en una operación financiera. Contacte al Administrador.');
    END IF;

    SELECT * INTO v_corp_ticket
    FROM public.corporate_tickets
    WHERE ride_id = p_ride_id;

    IF FOUND AND v_corp_ticket.settlement_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No es posible anular este comprobante porque ya fue procesado en una operación financiera. Contacte al Administrador.');
    END IF;

    -- H. ATOMIC ANNULLATION MUTATION
    -- 1. Marcar carrera como cancelled
    UPDATE public.rides
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by = v_user_id,
        cancellation_reason = v_reason_trimmed,
        updated_at = NOW()
    WHERE id = p_ride_id;

    -- 2. Liberar conductor si estaba asignado
    IF v_ride.driver_id IS NOT NULL THEN
        UPDATE public.drivers
        SET status = 'available',
            updated_at = NOW()
        WHERE id = v_ride.driver_id;
    END IF;

    -- 3. Marcar corporate_ticket como cancelled si existe
    IF FOUND THEN
        UPDATE public.corporate_tickets
        SET status = 'cancelled',
            updated_at = NOW()
        WHERE ride_id = p_ride_id;
    END IF;

    -- 4. Registrar evento de auditoría en timeline
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
        'cancelled',
        'Comprobante Anulado',
        format('Comprobante %s anulado. Motivo: %s', v_ride.ride_code, v_reason_trimmed),
        v_user_id,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'ride_id', p_ride_id,
        'ride_code', v_ride.ride_code,
        'message', format('Comprobante %s anulado exitosamente.', v_ride.ride_code)
    );
END;
$$;

-- PERMISOS Y SEGURIDAD SOBRE CANCEL_DIGITAL_TICKET_ATOMIC
REVOKE EXECUTE ON FUNCTION public.cancel_digital_ticket_atomic(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_digital_ticket_atomic(UUID, TEXT) TO authenticated, service_role, postgres;
