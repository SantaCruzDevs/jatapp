-- ===================================================
-- MIGRATION: 20261003000002_company_payment_allocations.sql
-- PURPOSE: Corporate Payment Allocations (FIFO) and Payment Detail Traceability
-- CREATES:
--   1. Table public.company_payment_allocations (FK payment_id, FK ride_id, amount_applied)
--   2. Atomic RPC register_company_payment_atomic update with automatic FIFO Allocation loop
-- SECURITY & IDEMPOTENCY:
--   - Idempotent DDL (CREATE TABLE IF NOT EXISTS)
--   - SECURITY DEFINER SET search_path = public, pg_temp
--   - Internal RBAC: SUPERADMIN, ADMIN, SUPERVISOR ONLY
--   - Explicit REVOKE from PUBLIC, anon & GRANT to authenticated, service_role
-- ===================================================

-- ===================================================
-- 1. TABLE: company_payment_allocations
-- ===================================================
CREATE TABLE IF NOT EXISTS public.company_payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES public.company_payments(id) ON DELETE CASCADE,
    ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE RESTRICT,
    amount_applied NUMERIC(10,2) NOT NULL CHECK (amount_applied > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unq_payment_ride_allocation UNIQUE (payment_id, ride_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON public.company_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_ride ON public.company_payment_allocations(ride_id);

ALTER TABLE public.company_payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_payment_allocations_admin_policy ON public.company_payment_allocations;
CREATE POLICY company_payment_allocations_admin_policy ON public.company_payment_allocations
  FOR ALL USING (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'))
  WITH CHECK (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));

DROP POLICY IF EXISTS company_payment_allocations_client_select_policy ON public.company_payment_allocations;
CREATE POLICY company_payment_allocations_client_select_policy ON public.company_payment_allocations
  FOR SELECT USING (
    public.get_user_role() = 'CLIENT_USER' AND payment_id IN (
      SELECT id FROM public.company_payments WHERE company_id IN (
        SELECT company_id FROM public.company_users WHERE profile_id = auth.uid()
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_payment_allocations TO authenticated, service_role, postgres;

-- ===================================================
-- 2. UPDATED ATOMIC RPC: register_company_payment_atomic (WITH FIFO ALLOCATION)
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
    v_applied_amount NUMERIC(10,2) := 0.00;
    v_overpayment_amount NUMERIC(10,2) := 0.00;
    v_payment_status VARCHAR(50) := 'confirmed';
    v_current_credit_balance NUMERIC(10,2) := 0.00;
    v_new_credit_balance NUMERIC(10,2) := 0.00;
    
    -- FIFO Allocation variables
    v_remaining_to_allocate NUMERIC(10,2) := 0.00;
    v_ride_rec RECORD;
    v_ride_already_allocated NUMERIC(10,2) := 0.00;
    v_ride_outstanding NUMERIC(10,2) := 0.00;
    v_alloc_amount NUMERIC(10,2) := 0.00;
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
        RAISE EXCEPTION 'El monto del pago debe ser strictly mayor a 0.00.'
            USING ERRCODE = '22023';
    END IF;

    -- 3. Lock Target Company (Primary Serializer)
    PERFORM 1 FROM public.companies WHERE id = p_company_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La empresa especificada no existe.'
            USING ERRCODE = '22023';
    END IF;

    -- 4. Calculate Current Global Debt Position
    -- 4a. Last closed accumulated balance
    SELECT COALESCE(final_accumulated_balance, 0.00) INTO v_total_closed_debt
    FROM public.company_settlements
    WHERE company_id = p_company_id AND settlement_status = 'closed'
    ORDER BY period_end DESC, closed_at DESC LIMIT 1;

    IF v_total_closed_debt IS NULL THEN
        v_total_closed_debt := 0.00;
    END IF;

    -- 4b. Unsettled rides charges
    SELECT COALESCE(SUM(total_fare), 0.00) INTO v_unsettled_charges
    FROM public.rides
    WHERE company_id = p_company_id
      AND status = 'completed'
      AND payment_method = 'Ticket'
      AND NOT EXISTS (
          SELECT 1 FROM public.company_settlement_items WHERE ride_id = rides.id
      );

    -- 4c. Unsettled pending adjustments
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

    -- 4d. Total confirmed applied payments to date (SUM(applied_amount))
    SELECT COALESCE(SUM(applied_amount), 0.00) INTO v_total_confirmed_payments
    FROM public.company_payments
    WHERE company_id = p_company_id
      AND payment_status IN ('confirmed', 'unreconciled_overpayment');

    v_total_accumulated_debt := v_total_closed_debt + v_unsettled_charges + v_unsettled_adjustments;
    v_current_pending_debt := GREATEST(0.00, v_total_accumulated_debt - v_total_confirmed_payments);

    -- 5. Calculate Applied and Overpayment Amounts
    v_applied_amount := LEAST(p_amount, v_current_pending_debt);
    v_overpayment_amount := GREATEST(0.00, p_amount - v_current_pending_debt);

    -- 6. Check Feature Flag COMPANY_CREDIT_ENABLED
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'system_settings') THEN
        SELECT value INTO v_credit_setting
        FROM public.system_settings
        WHERE key = 'COMPANY_CREDIT_ENABLED';

        IF v_credit_setting IS NOT NULL AND v_credit_setting = 'true' THEN
            v_credit_enabled := TRUE;
        END IF;
    END IF;

    -- 7. Determine Payment Status
    IF v_overpayment_amount > 0 THEN
        IF NOT v_credit_enabled THEN
            v_payment_status := 'unreconciled_overpayment';
        ELSE
            v_payment_status := 'confirmed';
        END IF;
    ELSE
        v_payment_status := 'confirmed';
    END IF;

    -- 8. Idempotency Check & Payload Match Verification
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, company_id, amount, applied_amount, overpayment_amount, payment_method, payment_status
        INTO v_existing_payment
        FROM public.company_payments
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            IF v_existing_payment.company_id = p_company_id 
               AND v_existing_payment.amount = p_amount 
               AND v_existing_payment.applied_amount = v_applied_amount
               AND v_existing_payment.overpayment_amount = v_overpayment_amount
               AND v_existing_payment.payment_method = p_payment_method
               AND v_existing_payment.payment_status = v_payment_status THEN
                RETURN v_existing_payment.id;
            ELSE
                RAISE EXCEPTION 'Clave de idempotencia duplicada con datos de pago diferentes.'
                    USING ERRCODE = '23505';
            END IF;
        END IF;
    END IF;

    -- 9. Insert Payment Record
    INSERT INTO public.company_payments (
        company_id,
        amount,
        applied_amount,
        overpayment_amount,
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
        v_applied_amount,
        v_overpayment_amount,
        now(),
        p_payment_method,
        p_reference_number,
        p_notes,
        v_user_id,
        p_idempotency_key,
        v_payment_status,
        now()
    ) RETURNING id INTO v_payment_id;

    -- 10. FIFO ALLOCATION LOOP (Assigning payment to oldest unpaid completed Ticket rides)
    v_remaining_to_allocate := v_applied_amount;

    IF v_remaining_to_allocate > 0 THEN
        FOR v_ride_rec IN
            SELECT r.id, r.total_fare, r.created_at
            FROM public.rides r
            WHERE r.company_id = p_company_id
              AND r.status = 'completed'
              AND r.payment_method = 'Ticket'
              AND NOT EXISTS (
                  SELECT 1 FROM public.company_settlement_items WHERE ride_id = r.id
              )
            ORDER BY r.created_at ASC, r.id ASC
        LOOP
            EXIT WHEN v_remaining_to_allocate <= 0;

            -- Calculate total already allocated to this ride across all previous payments
            SELECT COALESCE(SUM(amount_applied), 0.00) INTO v_ride_already_allocated
            FROM public.company_payment_allocations
            WHERE ride_id = v_ride_rec.id;

            v_ride_outstanding := GREATEST(0.00, v_ride_rec.total_fare - v_ride_already_allocated);

            IF v_ride_outstanding > 0 THEN
                v_alloc_amount := LEAST(v_remaining_to_allocate, v_ride_outstanding);

                INSERT INTO public.company_payment_allocations (
                    payment_id,
                    ride_id,
                    amount_applied,
                    created_at
                ) VALUES (
                    v_payment_id,
                    v_ride_rec.id,
                    v_alloc_amount,
                    now()
                );

                v_remaining_to_allocate := v_remaining_to_allocate - v_alloc_amount;
            END IF;
        END LOOP;
    END IF;

    -- 11. If Credit ON & Overpayment > 0 -> Create credit movement
    IF v_credit_enabled AND v_overpayment_amount > 0 THEN
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

-- Permissions hardening for register_company_payment_atomic
REVOKE ALL ON FUNCTION public.register_company_payment_atomic(UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_company_payment_atomic(UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, TEXT) TO authenticated, service_role;
