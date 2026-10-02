-- ===================================================
-- MIGRATION: 20260914_company_financial_rpcs.sql
-- PURPOSE: Phase 4 Stage 2 - Atomic Financial RPCs in PostgreSQL
-- RPCs CREATED:
--   1. create_company_settlement_atomic
--   2. register_company_payment_atomic
-- CONSTRAINTS & SECURITY:
--   - SECURITY DEFINER with search_path = public, pg_temp
--   - Role checks: SUPERADMIN, ADMIN, SUPERVISOR ONLY
--   - FOR UPDATE locks on public.companies, rides, adjustments
--   - Strict non-overlapping period protection [period_start, period_end)
--   - Strict UNIQUE(ride_id) and UNIQUE(idempotency_key) enforcement
--   - Overpayment handling: COMPANY_CREDIT_ENABLED = false -> unreconciled_overpayment
--   - Fix company_settlement_items FK to ON DELETE RESTRICT (Snapshot Protection)
-- ===================================================

-- 1. FIX FK ON company_settlement_items TO ON DELETE RESTRICT (Protecting closed snapshots)
ALTER TABLE public.company_settlement_items 
  DROP CONSTRAINT IF EXISTS company_settlement_items_settlement_id_fkey;

ALTER TABLE public.company_settlement_items 
  ADD CONSTRAINT company_settlement_items_settlement_id_fkey 
  FOREIGN KEY (settlement_id) REFERENCES public.company_settlements(id) ON DELETE RESTRICT;

-- ===================================================
-- RPC 1: create_company_settlement_atomic
-- ===================================================
CREATE OR REPLACE FUNCTION public.create_company_settlement_atomic(
    p_company_id UUID,
    p_period_start TIMESTAMPTZ,
    p_period_end TIMESTAMPTZ,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role VARCHAR(50);
    v_settlement_id UUID;
    v_settlement_code VARCHAR(50);
    v_ride_record RECORD;
    v_adj_record RECORD;
    v_eligible_rides_count INTEGER := 0;
    v_eligible_adj_count INTEGER := 0;
    v_total_charges NUMERIC(10,2) := 0.00;
    v_total_adjustments NUMERIC(10,2) := 0.00;
    v_period_net_charge NUMERIC(10,2) := 0.00;
    v_previous_accumulated_balance NUMERIC(10,2) := 0.00;
    v_final_accumulated_balance NUMERIC(10,2) := 0.00;
    v_ticket_code VARCHAR(100);
    v_ride_adj_amount NUMERIC(10,2);
    v_final_item_charge NUMERIC(10,2);
BEGIN
    -- 1. Security & RBAC Verification
    v_user_id := auth.uid();
    v_user_role := public.get_user_role();

    IF v_user_role IS NULL OR v_user_role NOT IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR') THEN
        RAISE EXCEPTION 'Acceso denegado: permiso insuficiente para crear un cierre corporativo.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate Period Dates
    IF p_period_start >= p_period_end THEN
        RAISE EXCEPTION 'El inicio del período debe ser estrictamente anterior al fin del período.'
            USING ERRCODE = '22023';
    END IF;

    -- 3. Lock Target Company (Primary Serializer)
    PERFORM 1 FROM public.companies WHERE id = p_company_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La empresa especificada no existe.'
            USING ERRCODE = '22023';
    END IF;

    -- 4. Check Non-Overlapping Active Periods
    IF EXISTS (
        SELECT 1 FROM public.company_settlements 
        WHERE company_id = p_company_id 
          AND settlement_status IN ('draft', 'closed')
          AND tstzrange(period_start, period_end, '[)') && tstzrange(p_period_start, p_period_end, '[)')
    ) THEN
        RAISE EXCEPTION 'Ya existe un cierre o borrador corporativo activo para esta empresa que se solapa con el período especificado.'
            USING ERRCODE = '23P01';
    END IF;

    -- 5. Lock Eligible Rides
    PERFORM 1 FROM public.rides
    WHERE company_id = p_company_id
      AND status = 'completed'
      AND payment_method = 'Ticket'
      AND created_at >= p_period_start
      AND created_at < p_period_end
      AND NOT EXISTS (
          SELECT 1 FROM public.company_settlement_items WHERE ride_id = rides.id
      )
    FOR UPDATE OF rides;

    -- Count eligible rides
    SELECT count(*) INTO v_eligible_rides_count
    FROM public.rides
    WHERE company_id = p_company_id
      AND status = 'completed'
      AND payment_method = 'Ticket'
      AND created_at >= p_period_start
      AND created_at < p_period_end
      AND NOT EXISTS (
          SELECT 1 FROM public.company_settlement_items WHERE ride_id = rides.id
      );

    -- 6. Lock Eligible Adjustments
    PERFORM 1 FROM public.company_adjustments
    WHERE company_id = p_company_id
      AND adjustment_status IN ('pending', 'applied_to_next_period')
    FOR UPDATE;

    -- Count eligible adjustments
    SELECT count(*) INTO v_eligible_adj_count
    FROM public.company_adjustments
    WHERE company_id = p_company_id
      AND adjustment_status IN ('pending', 'applied_to_next_period');

    -- 7. Case: No Rides and No Adjustments
    IF v_eligible_rides_count = 0 AND v_eligible_adj_count = 0 THEN
        RAISE EXCEPTION 'No hay carreras completadas con método Ticket ni ajustes pendientes para el período seleccionado.'
            USING ERRCODE = 'P0002';
    END IF;

    -- 8. Calculate period_charges
    SELECT COALESCE(SUM(total_fare), 0.00) INTO v_total_charges
    FROM public.rides
    WHERE company_id = p_company_id
      AND status = 'completed'
      AND payment_method = 'Ticket'
      AND created_at >= p_period_start
      AND created_at < p_period_end
      AND NOT EXISTS (
          SELECT 1 FROM public.company_settlement_items WHERE ride_id = rides.id
      );

    -- 9. Calculate period_adjustments
    SELECT COALESCE(SUM(
        CASE 
            WHEN adjustment_type = 'charge_increase' THEN ABS(amount)
            WHEN adjustment_type = 'credit_discount' THEN -ABS(amount)
            ELSE amount
        END
    ), 0.00) INTO v_total_adjustments
    FROM public.company_adjustments
    WHERE company_id = p_company_id
      AND adjustment_status IN ('pending', 'applied_to_next_period');

    v_period_net_charge := v_total_charges + v_total_adjustments;

    -- 10. Deterministic previous_accumulated_balance (From last CLOSED settlement only)
    SELECT COALESCE(final_accumulated_balance, 0.00)
    INTO v_previous_accumulated_balance
    FROM public.company_settlements
    WHERE company_id = p_company_id
      AND settlement_status = 'closed'
    ORDER BY period_end DESC, closed_at DESC
    LIMIT 1;

    IF v_previous_accumulated_balance IS NULL THEN
        v_previous_accumulated_balance := 0.00;
    END IF;

    v_final_accumulated_balance := v_previous_accumulated_balance + v_period_net_charge;

    -- 11. Generate Settlement Code
    v_settlement_code := 'SET-COMP-' || to_char(now(), 'YYYYMMDD-HH24MI-') || UPPER(substring(gen_random_uuid()::text from 1 for 4));

    -- 12. Insert Into company_settlements
    INSERT INTO public.company_settlements (
        company_id,
        settlement_code,
        period_start,
        period_end,
        cutoff_at,
        total_charges_snapshot,
        total_adjustments_snapshot,
        period_net_charge,
        previous_accumulated_balance,
        final_accumulated_balance,
        settlement_status,
        notes,
        created_by,
        closed_at
    ) VALUES (
        p_company_id,
        v_settlement_code,
        p_period_start,
        p_period_end,
        now(),
        v_total_charges,
        v_total_adjustments,
        v_period_net_charge,
        v_previous_accumulated_balance,
        v_final_accumulated_balance,
        'closed',
        p_notes,
        v_user_id,
        now()
    ) RETURNING id INTO v_settlement_id;

    -- 13. Create Settlement Items (Ride Snapshots)
    FOR v_ride_record IN 
        SELECT r.id, r.ride_code, r.total_fare, r.created_at
        FROM public.rides r
        WHERE r.company_id = p_company_id
          AND r.status = 'completed'
          AND r.payment_method = 'Ticket'
          AND r.created_at >= p_period_start
          AND r.created_at < p_period_end
          AND NOT EXISTS (
              SELECT 1 FROM public.company_settlement_items WHERE ride_id = r.id
          )
    LOOP
        -- Retrieve corporate ticket code if available
        SELECT ticket_code INTO v_ticket_code
        FROM public.corporate_tickets
        WHERE ride_id = v_ride_record.id
        LIMIT 1;

        IF v_ticket_code IS NULL THEN
            v_ticket_code := v_ride_record.ride_code;
        END IF;

        -- Sum adjustments linked specifically to this ride
        SELECT COALESCE(SUM(
            CASE 
                WHEN adjustment_type = 'charge_increase' THEN ABS(amount)
                WHEN adjustment_type = 'credit_discount' THEN -ABS(amount)
                ELSE amount
            END
        ), 0.00) INTO v_ride_adj_amount
        FROM public.company_adjustments
        WHERE ride_id = v_ride_record.id
          AND company_id = p_company_id
          AND adjustment_status IN ('pending', 'applied_to_next_period');

        v_final_item_charge := GREATEST(0.00, v_ride_record.total_fare + v_ride_adj_amount);

        INSERT INTO public.company_settlement_items (
            settlement_id,
            ride_id,
            ticket_code_snapshot,
            fare_snapshot,
            adjustments_snapshot,
            final_item_charge,
            ride_created_at,
            created_at
        ) VALUES (
            v_settlement_id,
            v_ride_record.id,
            v_ticket_code,
            v_ride_record.total_fare,
            v_ride_adj_amount,
            v_final_item_charge,
            v_ride_record.created_at,
            now()
        );
    END LOOP;

    -- 14. Update Included company_adjustments
    UPDATE public.company_adjustments
    SET adjustment_status = 'applied_to_settlement',
        applied_settlement_id = v_settlement_id,
        applied_at = now(),
        applied_by = v_user_id
    WHERE company_id = p_company_id
      AND adjustment_status IN ('pending', 'applied_to_next_period');

    RETURN v_settlement_id;
END;
$$;

-- ===================================================
-- RPC 2: register_company_payment_atomic
-- ===================================================
CREATE OR REPLACE FUNCTION public.register_company_payment_atomic(
    p_company_id UUID,
    p_amount NUMERIC(10,2),
    p_payment_method VARCHAR(50),
    p_idempotency_key VARCHAR(100),
    p_reference_number VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role VARCHAR(50);
    v_payment_id UUID;
    v_existing_payment RECORD;
    v_credit_enabled BOOLEAN := FALSE;
    v_credit_setting VARCHAR(50);
    v_total_closed_debt NUMERIC(10,2) := 0.00;
    v_unsettled_charges NUMERIC(10,2) := 0.00;
    v_unsettled_adjustments NUMERIC(10,2) := 0.00;
    v_total_confirmed_payments NUMERIC(10,2) := 0.00;
    v_total_accumulated_debt NUMERIC(10,2) := 0.00;
    v_current_pending_debt NUMERIC(10,2) := 0.00;
    v_overpayment_amount NUMERIC(10,2) := 0.00;
    v_payment_status VARCHAR(50) := 'confirmed';
    v_current_credit_balance NUMERIC(10,2) := 0.00;
    v_new_credit_balance NUMERIC(10,2) := 0.00;
BEGIN
    -- 1. Security & RBAC Verification
    v_user_id := auth.uid();
    v_user_role := public.get_user_role();

    IF v_user_role IS NULL OR v_user_role NOT IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR') THEN
        RAISE EXCEPTION 'Acceso denegado: permiso insuficiente para registrar un pago de empresa.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Amount Validation
    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'El monto del pago debe ser estrictamente mayor a 0.00.'
            USING ERRCODE = '22023';
    END IF;

    -- 3. Idempotency Check & Payload Match Verification
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, company_id, amount, payment_method INTO v_existing_payment
        FROM public.company_payments
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            IF v_existing_payment.company_id = p_company_id 
               AND v_existing_payment.amount = p_amount 
               AND v_existing_payment.payment_method = p_payment_method THEN
                -- Payload matches: Return existing payment ID cleanly
                RETURN v_existing_payment.id;
            ELSE
                -- Payload mismatch: Reject duplicate idempotency key with different data
                RAISE EXCEPTION 'Clave de idempotencia duplicada con datos de pago diferentes.'
                    USING ERRCODE = '23505';
            END IF;
        END IF;
    END IF;

    -- 4. Lock Target Company
    PERFORM 1 FROM public.companies WHERE id = p_company_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La empresa especificada no existe.'
            USING ERRCODE = '22023';
    END IF;

    -- 5. Calculate Current Global Debt Position
    -- 5a. Last closed accumulated balance
    SELECT COALESCE(final_accumulated_balance, 0.00) INTO v_total_closed_debt
    FROM public.company_settlements
    WHERE company_id = p_company_id AND settlement_status = 'closed'
    ORDER BY period_end DESC, closed_at DESC LIMIT 1;

    -- 5b. Unsettled rides charges
    SELECT COALESCE(SUM(total_fare), 0.00) INTO v_unsettled_charges
    FROM public.rides
    WHERE company_id = p_company_id
      AND status = 'completed'
      AND payment_method = 'Ticket'
      AND NOT EXISTS (
          SELECT 1 FROM public.company_settlement_items WHERE ride_id = rides.id
      );

    -- 5c. Unsettled pending adjustments
    SELECT COALESCE(SUM(
        CASE 
            WHEN adjustment_type = 'charge_increase' THEN ABS(amount)
            WHEN adjustment_type = 'credit_discount' THEN -ABS(amount)
            ELSE amount
        END
    ), 0.00) INTO v_unsettled_adjustments
    FROM public.company_adjustments
    WHERE company_id = p_company_id
      AND adjustment_status IN ('pending', 'applied_to_next_period');

    -- 5d. Total confirmed payments to date
    SELECT COALESCE(SUM(amount), 0.00) INTO v_total_confirmed_payments
    FROM public.company_payments
    WHERE company_id = p_company_id
      AND payment_status IN ('confirmed', 'unreconciled_overpayment');

    v_total_accumulated_debt := v_total_closed_debt + v_unsettled_charges + v_unsettled_adjustments;
    v_current_pending_debt := GREATEST(0.00, v_total_accumulated_debt - v_total_confirmed_payments);

    -- 6. Check Feature Flag COMPANY_CREDIT_ENABLED
    SELECT value INTO v_credit_setting
    FROM public.system_settings
    WHERE key = 'COMPANY_CREDIT_ENABLED';

    IF v_credit_setting IS NOT NULL AND v_credit_setting = 'true' THEN
        v_credit_enabled := TRUE;
    END IF;

    -- 7. Handle Overpayment
    IF p_amount > v_current_pending_debt AND v_current_pending_debt >= 0 THEN
        v_overpayment_amount := p_amount - v_current_pending_debt;

        IF NOT v_credit_enabled THEN
            -- Credit OFF: Mark payment status as unreconciled_overpayment, no credit ledger entries created
            v_payment_status := 'unreconciled_overpayment';
        ELSE
            -- Credit ON: Confirmed payment + credit ledger generation entry
            v_payment_status := 'confirmed';
        END IF;
    ELSE
        v_payment_status := 'confirmed';
    END IF;

    -- 8. Insert Payment Record
    INSERT INTO public.company_payments (
        company_id,
        amount,
        payment_date,
        payment_method,
        reference_number,
        notes,
        registered_by,
        idempotency_key,
        payment_status,
        created_at
    ) VALUES (
        p_company_id,
        p_amount,
        now(),
        p_payment_method,
        p_reference_number,
        p_notes,
        v_user_id,
        p_idempotency_key,
        v_payment_status,
        now()
    ) RETURNING id INTO v_payment_id;

    -- 9. If Credit ON & Overpayment > 0 -> Create credit movement (generation)
    IF v_credit_enabled AND v_overpayment_amount > 0 THEN
        -- Get current credit balance
        SELECT COALESCE(balance_after, 0.00) INTO v_current_credit_balance
        FROM public.company_credit_movements
        WHERE company_id = p_company_id
        ORDER BY created_at DESC, id DESC LIMIT 1;

        v_new_credit_balance := v_current_credit_balance + v_overpayment_amount;

        INSERT INTO public.company_credit_movements (
            company_id,
            payment_id,
            settlement_id,
            source_credit_movement_id,
            credit_type,
            amount,
            balance_after,
            reason,
            created_by,
            created_at
        ) VALUES (
            p_company_id,
            v_payment_id,
            NULL,
            NULL,
            'generation',
            v_overpayment_amount,
            v_new_credit_balance,
            'Saldo a favor generado por sobrepago de pago ' || v_payment_id::text,
            v_user_id,
            now()
        );
    END IF;

    RETURN v_payment_id;
END;
$$;

-- Grant EXECUTE Permissions
GRANT EXECUTE ON FUNCTION public.create_company_settlement_atomic(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.register_company_payment_atomic(UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, TEXT) TO authenticated, service_role, postgres;
