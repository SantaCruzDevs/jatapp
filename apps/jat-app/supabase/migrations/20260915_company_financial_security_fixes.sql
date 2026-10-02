-- ===================================================
-- MIGRATION: 20260915_company_financial_security_fixes.sql
-- PURPOSE: Phase 4 Stage 2.1 - Financial Security Fixes
-- FIXES:
--   1. Overpayment physical separation (applied_amount & overpayment_amount) in company_payments
--   2. Declarative + Trigger multitenant isolation on company_credit_movements(source_credit_movement_id)
--   3. RPC register_company_payment_atomic updated to compute applied_amount & overpayment_amount
--   4. Idempotency checks updated to include amount, applied_amount, overpayment_amount, payment_status
-- ===================================================

-- ===================================================
-- 1. CORRECCIÓN A — SOBRE-PAGO (company_payments)
-- ===================================================

-- Add applied_amount and overpayment_amount columns
ALTER TABLE public.company_payments
  ADD COLUMN IF NOT EXISTS applied_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (applied_amount >= 0),
  ADD COLUMN IF NOT EXISTS overpayment_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (overpayment_amount >= 0);

-- Backfill historical rows for backwards compatibility
UPDATE public.company_payments
SET applied_amount = amount,
    overpayment_amount = 0.00
WHERE applied_amount = 0.00 
  AND overpayment_amount = 0.00 
  AND amount > 0
  AND payment_status = 'confirmed';

-- Add Check Constraint amount = applied_amount + overpayment_amount
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_company_payments_amount_sum') THEN
        ALTER TABLE public.company_payments 
        ADD CONSTRAINT chk_company_payments_amount_sum 
        CHECK (amount = applied_amount + overpayment_amount);
    END IF;
END $$;

-- ===================================================
-- 2. CORRECCIÓN B — AISLAMIENTO MULTITENANT (company_credit_movements)
-- ===================================================

-- Declarative Composite Unique & Foreign Key Protection
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unq_credit_movements_id_comp') THEN
        ALTER TABLE public.company_credit_movements
        ADD CONSTRAINT unq_credit_movements_id_comp UNIQUE (id, company_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_credit_movements_source_tenant') THEN
        ALTER TABLE public.company_credit_movements
        ADD CONSTRAINT fk_credit_movements_source_tenant
        FOREIGN KEY (source_credit_movement_id, company_id)
        REFERENCES public.company_credit_movements (id, company_id)
        ON DELETE RESTRICT;
    END IF;
END $$;

-- Additional Source Validation Trigger for Defense in Depth
CREATE OR REPLACE FUNCTION public.check_company_credit_movement_source()
RETURNS TRIGGER AS $$
DECLARE
    v_source RECORD;
BEGIN
    IF NEW.source_credit_movement_id IS NOT NULL THEN
        SELECT id, company_id, credit_type, amount INTO v_source
        FROM public.company_credit_movements
        WHERE id = NEW.source_credit_movement_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'El movimiento de crédito origen especificado no existe.'
                USING ERRCODE = '23503';
        END IF;

        IF v_source.company_id <> NEW.company_id THEN
            RAISE EXCEPTION 'Violación de aislamiento multitenant: el movimiento de crédito origen pertenece a otra empresa.'
                USING ERRCODE = '23503';
        END IF;

        IF v_source.credit_type <> 'generation' THEN
            RAISE EXCEPTION 'El movimiento de crédito origen debe ser de tipo generation.'
                USING ERRCODE = '22023';
        END IF;

        IF v_source.amount <= 0 THEN
            RAISE EXCEPTION 'El monto del crédito origen debe ser mayor a 0.'
                USING ERRCODE = '22023';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_company_credit_movement_source ON public.company_credit_movements;
CREATE TRIGGER trg_check_company_credit_movement_source
BEFORE INSERT OR UPDATE ON public.company_credit_movements
FOR EACH ROW EXECUTE FUNCTION public.check_company_credit_movement_source();

-- ===================================================
-- 3. ACTUALIZACIÓN RPC: register_company_payment_atomic
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

    -- 4d. Total confirmed applied payments to date (SUM(applied_amount), NOT SUM(amount))
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
    SELECT value INTO v_credit_setting
    FROM public.system_settings
    WHERE key = 'COMPANY_CREDIT_ENABLED';

    IF v_credit_setting IS NOT NULL AND v_credit_setting = 'true' THEN
        v_credit_enabled := TRUE;
    END IF;

    -- 7. Determine Payment Status
    IF v_overpayment_amount > 0 THEN
        IF NOT v_credit_enabled THEN
            -- Credit OFF: unreconciled_overpayment status
            v_payment_status := 'unreconciled_overpayment';
        ELSE
            -- Credit ON: confirmed status with credit ledger entry
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
                -- Payload matches: Return existing payment ID cleanly
                RETURN v_existing_payment.id;
            ELSE
                -- Payload mismatch: Reject duplicate idempotency key with different data
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

    -- 10. If Credit ON & Overpayment > 0 -> Create credit movement (generation)
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

GRANT EXECUTE ON FUNCTION public.register_company_payment_atomic(UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, TEXT) TO authenticated, service_role, postgres;
