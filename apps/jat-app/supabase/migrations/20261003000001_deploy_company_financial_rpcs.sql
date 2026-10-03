-- ===================================================
-- MIGRATION: 20261003000001_deploy_company_financial_rpcs.sql
-- PURPOSE: Restore and consolidate Corporate Financial Schema, System Settings, and Atomic RPCs
-- RECOVERED COMPONENTS:
--   1. Tables: system_settings, company_settlements, company_settlement_items, company_credit_movements
--   2. Column extensions for company_payments & company_adjustments
--   3. RPCs: register_company_payment_atomic, create_company_settlement_atomic
-- SECURITY & IDEMPOTENCY:
--   - Idempotent DDL (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS)
--   - SECURITY DEFINER SET search_path = public, pg_temp
--   - Internal RBAC: SUPERADMIN, ADMIN, SUPERVISOR ONLY
--   - Explicit REVOKE from PUBLIC, anon & GRANT to authenticated, service_role
-- ===================================================

-- ===================================================
-- 1. SYSTEM SETTINGS TABLE (IDEMPOTENT)
-- ===================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.system_settings (key, value, description)
VALUES
    ('COMPANY_CREDIT_ENABLED', 'false', 'Permite generar y consolidar saldo a favor (crédito) por sobrepagos corporativos'),
    ('SETTLEMENT_PRE_SETTLEMENTS_ENABLED', 'false', 'Habilita el flujo en 2 etapas para cierres de motoqueros')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_settings_admin_policy ON public.system_settings;
CREATE POLICY system_settings_admin_policy ON public.system_settings
  FOR ALL USING (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'))
  WITH CHECK (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated, service_role, postgres;

-- ===================================================
-- 2. TABLES AND DDL EXTENSIONS (IDEMPOTENT)
-- ===================================================

-- 2a. Table: company_settlements
CREATE TABLE IF NOT EXISTS public.company_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    settlement_code VARCHAR(50) NOT NULL UNIQUE,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    cutoff_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_charges_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_charges_snapshot >= 0),
    total_adjustments_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    period_net_charge NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    previous_accumulated_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    final_accumulated_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    settlement_status VARCHAR(50) NOT NULL DEFAULT 'closed' CHECK (settlement_status IN ('draft', 'closed', 'voided')),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_settlements_comp ON public.company_settlements(company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_company_settlements_status ON public.company_settlements(settlement_status);

-- 2b. Table: company_settlement_items
CREATE TABLE IF NOT EXISTS public.company_settlement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID NOT NULL REFERENCES public.company_settlements(id) ON DELETE RESTRICT,
    ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE RESTRICT,
    ticket_code_snapshot VARCHAR(100),
    fare_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (fare_snapshot >= 0),
    adjustments_snapshot NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    final_item_charge NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (final_item_charge >= 0),
    ride_created_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unq_company_settlement_item_ride UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_settlement_items_settlement ON public.company_settlement_items(settlement_id);
CREATE INDEX IF NOT EXISTS idx_comp_settlement_items_ride ON public.company_settlement_items(ride_id);

-- 2c. Table: company_credit_movements
CREATE TABLE IF NOT EXISTS public.company_credit_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    payment_id UUID REFERENCES public.company_payments(id) ON DELETE SET NULL,
    settlement_id UUID REFERENCES public.company_settlements(id) ON DELETE SET NULL,
    source_credit_movement_id UUID REFERENCES public.company_credit_movements(id) ON DELETE RESTRICT,
    credit_type VARCHAR(50) NOT NULL CHECK (credit_type IN ('generation', 'application', 'adjustment', 'expiry')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    balance_after NUMERIC(10,2) NOT NULL CHECK (balance_after >= 0),
    reason TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_movements_comp ON public.company_credit_movements(company_id, created_at);

-- 2d. Column Extensions for public.company_payments
ALTER TABLE public.company_payments
  ADD COLUMN IF NOT EXISTS applied_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (applied_amount >= 0),
  ADD COLUMN IF NOT EXISTS overpayment_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (overpayment_amount >= 0),
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) NOT NULL DEFAULT 'confirmed';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unq_company_payments_idempotency') THEN
        ALTER TABLE public.company_payments ADD CONSTRAINT unq_company_payments_idempotency UNIQUE (idempotency_key);
    END IF;
END $$;

-- 2e. Column Extensions for public.company_adjustments
ALTER TABLE public.company_adjustments
  ADD COLUMN IF NOT EXISTS adjustment_type VARCHAR(50) NOT NULL DEFAULT 'charge_increase',
  ADD COLUMN IF NOT EXISTS adjustment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ride_id UUID REFERENCES public.rides(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_settlement_id UUID REFERENCES public.company_settlements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS applied_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2f. Enable RLS on newly created tables
ALTER TABLE public.company_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settlement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_credit_movements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_settlements
DROP POLICY IF EXISTS company_settlements_admin_policy ON public.company_settlements;
CREATE POLICY company_settlements_admin_policy ON public.company_settlements
  FOR ALL USING (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'))
  WITH CHECK (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));

DROP POLICY IF EXISTS company_settlements_client_select_policy ON public.company_settlements;
CREATE POLICY company_settlements_client_select_policy ON public.company_settlements
  FOR SELECT USING (
    public.get_user_role() = 'CLIENT_USER' AND company_id IN (
      SELECT company_id FROM public.company_users WHERE profile_id = auth.uid()
    )
  );

-- RLS Policies for company_settlement_items
DROP POLICY IF EXISTS company_settlement_items_admin_policy ON public.company_settlement_items;
CREATE POLICY company_settlement_items_admin_policy ON public.company_settlement_items
  FOR ALL USING (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'))
  WITH CHECK (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));

DROP POLICY IF EXISTS company_settlement_items_client_select_policy ON public.company_settlement_items;
CREATE POLICY company_settlement_items_client_select_policy ON public.company_settlement_items
  FOR SELECT USING (
    public.get_user_role() = 'CLIENT_USER' AND settlement_id IN (
      SELECT id FROM public.company_settlements WHERE company_id IN (
        SELECT company_id FROM public.company_users WHERE profile_id = auth.uid()
      )
    )
  );

-- RLS Policies for company_credit_movements
DROP POLICY IF EXISTS company_credit_movements_admin_policy ON public.company_credit_movements;
CREATE POLICY company_credit_movements_admin_policy ON public.company_credit_movements
  FOR ALL USING (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'))
  WITH CHECK (public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR'));

-- Table Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settlements TO authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settlement_items TO authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_credit_movements TO authenticated, service_role, postgres;

-- ===================================================
-- 3. RPC: register_company_payment_atomic
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

    -- 10. If Credit ON & Overpayment > 0 -> Create credit movement
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

-- ===================================================
-- 4. RPC: create_company_settlement_atomic
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

    SELECT count(*) INTO v_eligible_adj_count
    FROM public.company_adjustments
    WHERE company_id = p_company_id
      AND adjustment_status IN ('pending', 'applied_to_next_period');

    IF v_eligible_rides_count = 0 AND v_eligible_adj_count = 0 THEN
        RAISE EXCEPTION 'No hay carreras completadas con método Ticket ni ajustes pendientes para el período seleccionado.'
            USING ERRCODE = 'P0002';
    END IF;

    -- 7. Calculate period_charges
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

    -- 8. Calculate period_adjustments
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

    -- 9. Previous accumulated balance from last closed settlement
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

    -- 10. Settlement code
    v_settlement_code := 'SET-COMP-' || to_char(now(), 'YYYYMMDD-HH24MI-') || UPPER(substring(gen_random_uuid()::text from 1 for 4));

    -- 11. Insert settlement
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

    -- 12. Create items
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
        SELECT ticket_code INTO v_ticket_code
        FROM public.corporate_tickets
        WHERE ride_id = v_ride_record.id
        LIMIT 1;

        IF v_ticket_code IS NULL THEN
            v_ticket_code := v_ride_record.ride_code;
        END IF;

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

    -- 13. Update company_adjustments
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

-- Permissions hardening for create_company_settlement_atomic
REVOKE ALL ON FUNCTION public.create_company_settlement_atomic(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_company_settlement_atomic(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated, service_role;
