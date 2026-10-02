-- Migration: 20260911_settlement_rpc_and_rbac.sql
-- Description: Phase 2 implementation of atomic PostgreSQL RPC functions for driver settlements:
-- 1. create_driver_settlement_atomic: Creates header, snapshot items, and locks rides using FOR UPDATE concurrency control.
-- 2. mark_settlement_as_paid_atomic: Registers payout date/user and prevents double payout.
-- 3. void_driver_settlement_atomic: Annulls unpaid settlements and releases locked rides, blocking voiding on 'paid' settlements.
-- 4. RBAC & RLS updates granting SUPERADMIN, ADMIN, and SUPERVISOR permission to execute financial settlements.

-- ==========================================
-- 1. RPC FUNCTION: create_driver_settlement_atomic
-- ==========================================
CREATE OR REPLACE FUNCTION public.create_driver_settlement_atomic(
    p_driver_id UUID,
    p_cutoff_at TIMESTAMPTZ,
    p_driver_commission_pct NUMERIC DEFAULT 80.00,
    p_bonus_amount NUMERIC DEFAULT 0.00,
    p_discount_amount NUMERIC DEFAULT 0.00,
    p_discount_reason TEXT DEFAULT NULL,
    p_status VARCHAR DEFAULT 'closed'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role VARCHAR;
    v_settlement_id UUID;
    v_total_rides INT;
    v_gross_amount NUMERIC(10,2);
    v_cash_collected NUMERIC(10,2);
    v_qr_collected NUMERIC(10,2);
    v_ticket_collected NUMERIC(10,2);
    v_driver_base_share NUMERIC(10,2);
    v_central_commission_amount NUMERIC(10,2);
    v_central_commission_pct NUMERIC(5,2);
    v_gross_net_balance NUMERIC(10,2);
    v_final_net_balance NUMERIC(10,2);
    v_result_type VARCHAR(30);
    v_min_created_at TIMESTAMPTZ;
    v_max_created_at TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    
    -- 1. Verify User Role Authorization
    v_user_role := public.get_user_role();
    IF v_user_role NOT IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR') THEN
        RAISE EXCEPTION 'No tiene permisos para crear liquidaciones financieras (Rol actual: %).', v_user_role;
    END IF;

    -- 2. Input Validations
    IF p_driver_commission_pct < 0 OR p_driver_commission_pct > 100 THEN
        RAISE EXCEPTION 'El porcentaje del motoquero debe estar entre 0 y 100.';
    END IF;

    IF p_bonus_amount < 0 THEN
        RAISE EXCEPTION 'El bono no puede ser negativo.';
    END IF;

    IF p_discount_amount < 0 THEN
        RAISE EXCEPTION 'El descuento no puede ser negativo.';
    END IF;

    IF p_discount_amount > 0 AND (p_discount_reason IS NULL OR length(trim(p_discount_reason)) = 0) THEN
        RAISE EXCEPTION 'El motivo del descuento es obligatorio cuando se aplica un descuento.';
    END IF;

    IF p_status NOT IN ('draft', 'closed') THEN
        RAISE EXCEPTION 'El estado inicial debe ser draft o closed.';
    END IF;

    -- 3. Lock candidate rides FOR UPDATE to prevent race conditions & concurrent duplicate settlements
    PERFORM id 
    FROM public.rides 
    WHERE driver_id = p_driver_id 
      AND status = 'completed' 
      AND is_settled = FALSE 
      AND created_at <= p_cutoff_at 
    FOR UPDATE;

    -- 4. Calculate aggregates over candidate rides
    SELECT 
        COUNT(*),
        COALESCE(SUM(total_fare), 0.00),
        COALESCE(SUM(total_fare) FILTER (WHERE payment_method = 'Efectivo'), 0.00),
        COALESCE(SUM(total_fare) FILTER (WHERE payment_method = 'QR'), 0.00),
        COALESCE(SUM(total_fare) FILTER (WHERE payment_method = 'Ticket'), 0.00),
        MIN(created_at),
        MAX(created_at)
    INTO 
        v_total_rides,
        v_gross_amount,
        v_cash_collected,
        v_qr_collected,
        v_ticket_collected,
        v_min_created_at,
        v_max_created_at
    FROM public.rides
    WHERE driver_id = p_driver_id 
      AND status = 'completed' 
      AND is_settled = FALSE 
      AND created_at <= p_cutoff_at;

    IF v_total_rides = 0 THEN
        RAISE EXCEPTION 'No se encontraron carreras completadas pendientes de liquidar para este conductor hasta el momento de corte.';
    END IF;

    -- 5. Financial Math Computations
    v_central_commission_pct := 100.00 - p_driver_commission_pct;
    v_driver_base_share := ROUND(v_gross_amount * (p_driver_commission_pct / 100.00), 2);
    v_central_commission_amount := v_gross_amount - v_driver_base_share;
    
    v_gross_net_balance := v_driver_base_share - v_cash_collected;
    v_final_net_balance := v_gross_net_balance + p_bonus_amount - p_discount_amount;

    IF v_final_net_balance > 0.009 THEN
        v_result_type := 'motojat_paga';
    ELSIF v_final_net_balance < -0.009 THEN
        v_result_type := 'motoquero_rinde';
    ELSE
        v_result_type := 'conciliado';
    END IF;

    -- 6. Insert Driver Settlement Header
    INSERT INTO public.driver_settlements (
        driver_id,
        cutoff_at,
        period_start,
        period_end,
        total_rides,
        gross_amount,
        central_commission_pct,
        central_commission_amount,
        driver_payout_amount,
        driver_commission_pct,
        driver_base_share,
        cash_collected,
        qr_collected,
        ticket_collected,
        bonus_amount,
        discount_amount,
        discount_reason,
        final_net_balance,
        result_type,
        settlement_status,
        payment_status,
        created_by,
        settled_by
    ) VALUES (
        p_driver_id,
        p_cutoff_at,
        v_min_created_at,
        v_max_created_at,
        v_total_rides,
        v_gross_amount,
        v_central_commission_pct,
        v_central_commission_amount,
        v_driver_base_share,
        p_driver_commission_pct,
        v_driver_base_share,
        v_cash_collected,
        v_qr_collected,
        v_ticket_collected,
        p_bonus_amount,
        p_discount_amount,
        p_discount_reason,
        v_final_net_balance,
        v_result_type,
        p_status,
        'pending_payment',
        v_user_id,
        v_user_id
    ) RETURNING id INTO v_settlement_id;

    -- 7. Insert Historical Snapshot per Ride in driver_settlement_items
    INSERT INTO public.driver_settlement_items (
        settlement_id,
        ride_id,
        fare_amount_snapshot,
        driver_pct_snapshot,
        driver_share_snapshot,
        payment_method_snapshot,
        ticket_id,
        ride_created_at
    )
    SELECT 
        v_settlement_id,
        r.id,
        r.total_fare,
        p_driver_commission_pct,
        ROUND(r.total_fare * (p_driver_commission_pct / 100.00), 2),
        r.payment_method,
        t.id,
        r.created_at
    FROM public.rides r
    LEFT JOIN public.corporate_tickets t ON t.ride_id = r.id
    WHERE r.driver_id = p_driver_id 
      AND r.status = 'completed' 
      AND r.is_settled = FALSE 
      AND r.created_at <= p_cutoff_at;

    -- 8. Lock Rides if settlement_status is 'closed'
    IF p_status = 'closed' THEN
        UPDATE public.rides
        SET is_settled = TRUE,
            settlement_id = v_settlement_id
        WHERE driver_id = p_driver_id 
          AND status = 'completed' 
          AND is_settled = FALSE 
          AND created_at <= p_cutoff_at;

        -- Update linked corporate tickets to 'settled' if any exist
        UPDATE public.corporate_tickets
        SET status = 'settled',
            settlement_id = v_settlement_id,
            updated_at = now()
        WHERE ride_id IN (
            SELECT ride_id FROM public.driver_settlement_items WHERE settlement_id = v_settlement_id
        );
    END IF;

    RETURN v_settlement_id;
END;
$$;

-- ==========================================
-- 2. RPC FUNCTION: mark_settlement_as_paid_atomic
-- ==========================================
CREATE OR REPLACE FUNCTION public.mark_settlement_as_paid_atomic(
    p_settlement_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role VARCHAR;
    v_settlement_status VARCHAR;
    v_payment_status VARCHAR;
BEGIN
    v_user_id := auth.uid();
    v_user_role := public.get_user_role();

    IF v_user_role NOT IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR') THEN
        RAISE EXCEPTION 'No tiene permisos para registrar el pago de liquidaciones.';
    END IF;

    -- Lock settlement header FOR UPDATE
    SELECT settlement_status, payment_status
    INTO v_settlement_status, v_payment_status
    FROM public.driver_settlements
    WHERE id = p_settlement_id
    FOR UPDATE;

    IF v_settlement_status IS NULL THEN
        RAISE EXCEPTION 'La liquidación especificada no existe.';
    END IF;

    IF v_settlement_status = 'voided' THEN
        RAISE EXCEPTION 'No se puede registrar el pago de una liquidación anulada.';
    END IF;

    IF v_payment_status = 'paid' THEN
        RAISE EXCEPTION 'La liquidación ya fue registrada como pagada anteriormente.';
    END IF;

    UPDATE public.driver_settlements
    SET payment_status = 'paid',
        paid_at = now(),
        paid_by = v_user_id,
        updated_at = now()
    WHERE id = p_settlement_id;
END;
$$;

-- ==========================================
-- 3. RPC FUNCTION: void_driver_settlement_atomic
-- ==========================================
CREATE OR REPLACE FUNCTION public.void_driver_settlement_atomic(
    p_settlement_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role VARCHAR;
    v_settlement_status VARCHAR;
    v_payment_status VARCHAR;
BEGIN
    v_user_id := auth.uid();
    v_user_role := public.get_user_role();

    IF v_user_role NOT IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR') THEN
        RAISE EXCEPTION 'No tiene permisos para anular liquidaciones.';
    END IF;

    -- Lock settlement header FOR UPDATE
    SELECT settlement_status, payment_status
    INTO v_settlement_status, v_payment_status
    FROM public.driver_settlements
    WHERE id = p_settlement_id
    FOR UPDATE;

    IF v_settlement_status IS NULL THEN
        RAISE EXCEPTION 'La liquidación especificada no existe.';
    END IF;

    IF v_payment_status = 'paid' THEN
        RAISE EXCEPTION 'No se puede anular una liquidación que ya fue efectivamente pagada al motoquero.';
    END IF;

    IF v_settlement_status = 'voided' THEN
        RAISE EXCEPTION 'La liquidación ya se encuentra anulada.';
    END IF;

    -- Release linked rides so they become available for future cutoffs
    UPDATE public.rides
    SET is_settled = FALSE,
        settlement_id = NULL
    WHERE settlement_id = p_settlement_id;

    -- Update settlement header to voided
    UPDATE public.driver_settlements
    SET settlement_status = 'voided',
        updated_at = now()
    WHERE id = p_settlement_id;
END;
$$;

-- ==========================================
-- 4. UPDATE RLS POLICIES FOR DRIVER SETTLEMENTS & ITEMS
-- ==========================================

-- 4.1 driver_settlements Policies
DROP POLICY IF EXISTS driver_settlements_select_policy ON public.driver_settlements;
CREATE POLICY driver_settlements_select_policy ON public.driver_settlements
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
    OR driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS driver_settlements_insert_policy ON public.driver_settlements;
CREATE POLICY driver_settlements_insert_policy ON public.driver_settlements
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
  );

DROP POLICY IF EXISTS driver_settlements_update_policy ON public.driver_settlements;
CREATE POLICY driver_settlements_update_policy ON public.driver_settlements
  FOR UPDATE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
  ) WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
  );

-- 4.2 driver_settlement_items Policies
DROP POLICY IF EXISTS driver_settlement_items_select_policy ON public.driver_settlement_items;
CREATE POLICY driver_settlement_items_select_policy ON public.driver_settlement_items
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
    OR settlement_id IN (
      SELECT id FROM public.driver_settlements 
      WHERE driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS driver_settlement_items_insert_policy ON public.driver_settlement_items;
CREATE POLICY driver_settlement_items_insert_policy ON public.driver_settlement_items
  FOR INSERT WITH CHECK (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
  );

DROP POLICY IF EXISTS driver_settlement_items_update_policy ON public.driver_settlement_items;
CREATE POLICY driver_settlement_items_update_policy ON public.driver_settlement_items
  FOR UPDATE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
  );
