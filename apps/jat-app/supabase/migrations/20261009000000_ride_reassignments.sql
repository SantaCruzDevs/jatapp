-- ============================================================
-- MIGRACIÓN: REASIGNACIÓN DE CARRERAS / MOTOQUEROS Y TRAZABILIDAD
-- Fecha: 2026-10-09
-- Descripción:
-- 1. Tabla public.ride_reassignments para trazabilidad estructurada y reportes
-- 2. Índices optimizados para consultas analíticas por fecha, conductor y motivo
-- 3. Políticas RLS de seguridad (solo lectura para staff autenticado)
-- 4. RPC atómica public.reassign_ride_driver_atomic con locks pesimistas FOR UPDATE
-- ============================================================

-- 1. CREACIÓN DE LA TABLA public.ride_reassignments
CREATE TABLE IF NOT EXISTS public.ride_reassignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
    previous_driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
    previous_movil_number INT,
    new_driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE SET NULL,
    new_movil_number INT NOT NULL,
    reason_category VARCHAR(100) NOT NULL,
    reason_detail TEXT,
    reassigned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. ÍNDICES ANALÍTICOS Y DE CONSULTA
CREATE INDEX IF NOT EXISTS idx_ride_reassignments_ride_id ON public.ride_reassignments(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_reassignments_created_at ON public.ride_reassignments(created_at);
CREATE INDEX IF NOT EXISTS idx_ride_reassignments_reason_category ON public.ride_reassignments(reason_category);
CREATE INDEX IF NOT EXISTS idx_ride_reassignments_previous_driver ON public.ride_reassignments(previous_driver_id);
CREATE INDEX IF NOT EXISTS idx_ride_reassignments_new_driver ON public.ride_reassignments(new_driver_id);
CREATE INDEX IF NOT EXISTS idx_ride_reassignments_previous_movil ON public.ride_reassignments(previous_movil_number);
CREATE INDEX IF NOT EXISTS idx_ride_reassignments_new_movil ON public.ride_reassignments(new_movil_number);
CREATE INDEX IF NOT EXISTS idx_ride_reassignments_reassigned_by ON public.ride_reassignments(reassigned_by);

-- 3. SEGURIDAD DE NIVEL DE FILA (RLS)
ALTER TABLE public.ride_reassignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ride_reassignments_select_policy ON public.ride_reassignments;
CREATE POLICY ride_reassignments_select_policy ON public.ride_reassignments
    FOR SELECT
    TO authenticated
    USING (
        public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
        OR (public.get_user_role() IN ('SUPERVISOR', 'OPERATOR') AND public.has_permission('rides.reassign'))
    );

-- Bloqueo directo de INSERT, UPDATE y DELETE (las inserciones solo se permiten vía RPC)
DROP POLICY IF EXISTS ride_reassignments_insert_policy ON public.ride_reassignments;
CREATE POLICY ride_reassignments_insert_policy ON public.ride_reassignments
    FOR INSERT
    TO authenticated
    WITH CHECK (FALSE);

DROP POLICY IF EXISTS ride_reassignments_update_policy ON public.ride_reassignments;
CREATE POLICY ride_reassignments_update_policy ON public.ride_reassignments
    FOR UPDATE
    TO authenticated
    USING (FALSE);

DROP POLICY IF EXISTS ride_reassignments_delete_policy ON public.ride_reassignments;
CREATE POLICY ride_reassignments_delete_policy ON public.ride_reassignments
    FOR DELETE
    TO authenticated
    USING (FALSE);

-- 4. RPC ATÓMICA DE REASIGNACIÓN DE CARRERA: reassign_ride_driver_atomic
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
    v_new_has_other_active BOOLEAN := FALSE;
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

    -- BLOQUEO ABSOLUTO: DRIVER y CLIENT_USER NUNCA pueden reasignar carreras
    IF v_user_role IN ('DRIVER', 'CLIENT_USER') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No está autorizado a reasignar carreras.');
    END IF;

    -- EVALUACIÓN DE AUTORIZACIÓN (SUPERADMIN/ADMIN implícito, SUPERVISOR/OPERATOR requiere rides.reassign)
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
    ELSIF v_new_driver.status != 'available' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El motoquero seleccionado ya no está disponible.');
    END IF;

    -- VERIFICAR QUE EL NUEVO MOTOQUERO NO TENGA NINGUNA OTRA CARRERA ACTIVA
    SELECT EXISTS (
        SELECT 1 FROM public.rides
        WHERE driver_id = p_new_driver_id
          AND status IN ('assigned', 'ontheway')
    ) INTO v_new_has_other_active;

    IF v_new_has_other_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'El motoquero seleccionado ya tiene una carrera activa.');
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

            -- Verificar si el motoquero anterior tiene OTRA carrera activa
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

    -- J. ATOMIC MUTATION 3: ACTUALIZAR CARRERA
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

-- 5. ASIGNACIÓN DE PRIVILEGIOS DE EJECUCIÓN Y TABLA
GRANT ALL ON TABLE public.ride_reassignments TO authenticated, service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.reassign_ride_driver_atomic(UUID, UUID, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_ride_driver_atomic(UUID, UUID, VARCHAR, TEXT) TO authenticated, service_role, postgres;
