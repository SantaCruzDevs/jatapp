-- Migration: 20261003000000_create_and_pay_driver_settlement_rpc.sql
-- Description: Adds create_and_pay_driver_settlement_atomic RPC function for 1-step direct settlement (CLOSED + PAID).
-- Supports direct mode settlement where settlement header is created as CLOSED and payment_status = PAID atomically.
-- Safe, idempotent, SECURITY DEFINER with strict RBAC checking (SUPERADMIN, ADMIN, SUPERVISOR).
-- Grants EXECUTE to authenticated and service_role, explicitly revoking from PUBLIC and anon.

CREATE OR REPLACE FUNCTION public.create_and_pay_driver_settlement_atomic(
    p_driver_id UUID,
    p_cutoff_at TIMESTAMPTZ,
    p_driver_commission_pct NUMERIC DEFAULT 80.00,
    p_bonus_amount NUMERIC DEFAULT 0.00,
    p_discount_amount NUMERIC DEFAULT 0.00,
    p_discount_reason TEXT DEFAULT NULL
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
    v_user_role := public.get_user_role();
    
    IF v_user_role NOT IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR') THEN
        RAISE EXCEPTION 'No tiene permisos para crear y pagar liquidaciones financieras (Rol actual: %).', v_user_role;
    END IF;

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

    -- Lock candidate rides FOR UPDATE to prevent race conditions
    PERFORM id 
    FROM public.rides 
    WHERE driver_id = p_driver_id 
      AND status = 'completed' 
      AND is_settled = FALSE 
      AND created_at <= p_cutoff_at 
    FOR UPDATE;

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

    v_central_commission_pct := 100.00 - p_driver_commission_pct;
    v_driver_base_share := ROUND(v_gross_amount * (p_driver_commission_pct / 100.00), 2);
    v_central_commission_amount := v_gross_amount - v_driver_base_share;
    
    -- FINANCIAL RULE: Money collected by driver = Cash + QR. Net balance = 80% share - Cash - QR.
    v_gross_net_balance := v_driver_base_share - v_cash_collected - v_qr_collected;
    v_final_net_balance := v_gross_net_balance + p_bonus_amount - p_discount_amount;

    IF v_final_net_balance > 0.009 THEN
        v_result_type := 'motojat_paga';
    ELSIF v_final_net_balance < -0.009 THEN
        v_result_type := 'motoquero_rinde';
    ELSE
        v_result_type := 'conciliado';
    END IF;

    -- Insert Driver Settlement Header as CLOSED and PAID atomically
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
        settled_by,
        paid_at,
        paid_by
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
        'closed',
        'paid',
        v_user_id,
        v_user_id,
        now(),
        v_user_id
    ) RETURNING id INTO v_settlement_id;

    -- Insert snapshot items
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

    -- Lock rides
    UPDATE public.rides
    SET is_settled = TRUE,
        settlement_id = v_settlement_id
    WHERE driver_id = p_driver_id 
      AND status = 'completed' 
      AND is_settled = FALSE 
      AND created_at <= p_cutoff_at;

    -- Update linked corporate tickets if any
    UPDATE public.corporate_tickets
    SET status = 'settled',
        settlement_id = v_settlement_id,
        updated_at = now()
    WHERE ride_id IN (
        SELECT ride_id FROM public.driver_settlement_items WHERE settlement_id = v_settlement_id
    );

    RETURN v_settlement_id;
END;
$$;

-- Security & Permissions: Revoke from PUBLIC and anon, grant to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.create_and_pay_driver_settlement_atomic(UUID, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_and_pay_driver_settlement_atomic(UUID, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;
