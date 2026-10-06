-- ===================================================
-- MIGRATION: 20261005000001_company_tax_treatment.sql
-- PURPOSE: Corporate Tax Treatment Configuration (IVA_13, EFECTIVA_14_94, SIN_FACTURA)
-- AUTHORIZED: Tax Treatment Implementation for MotoJAT Companies
-- CONSTRAINTS:
--   - Adds tax_mode column to public.companies (DEFAULT 'SIN_FACTURA')
--   - Adds historical freeze tax columns to public.company_settlements
--   - Provides calculate_tax_surcharge immutable helper function
--   - Updates create_company_settlement_atomic RPC to freeze historical tax calculation
-- ===================================================

-- 1. Create company_tax_mode check constraint on public.companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS tax_mode VARCHAR(20) NOT NULL DEFAULT 'SIN_FACTURA';

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_companies_tax_mode') THEN
        ALTER TABLE public.companies 
        ADD CONSTRAINT chk_companies_tax_mode CHECK (tax_mode IN ('IVA_13', 'EFECTIVA_14_94', 'SIN_FACTURA'));
    END IF;
END $$;

-- 2. Add tax freeze columns to public.company_settlements
ALTER TABLE public.company_settlements
  ADD COLUMN IF NOT EXISTS tax_mode VARCHAR(20) NOT NULL DEFAULT 'SIN_FACTURA',
  ADD COLUMN IF NOT EXISTS tax_rate_pct NUMERIC(6,4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS subtotal_base NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00;

-- 3. Pure Calculation Helper for Tax Surcharges (Bolivian Tax Standard)
CREATE OR REPLACE FUNCTION public.calculate_tax_surcharge(
    p_base NUMERIC(10,2),
    p_tax_mode VARCHAR(20)
)
RETURNS TABLE (
    subtotal_base NUMERIC(10,2),
    tax_mode VARCHAR(20),
    tax_rate_pct NUMERIC(6,4),
    tax_amount NUMERIC(10,2),
    total_with_tax NUMERIC(10,2)
)
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    v_base NUMERIC(10,2) := ROUND(COALESCE(p_base, 0.00), 2);
    v_mode VARCHAR(20) := COALESCE(p_tax_mode, 'SIN_FACTURA');
    v_tax_amount NUMERIC(10,2) := 0.00;
    v_rate NUMERIC(6,4) := 0.0000;
BEGIN
    IF v_mode = 'IVA_13' THEN
        v_rate := 0.1300;
        v_tax_amount := ROUND(v_base * 0.13, 2);
    ELSIF v_mode = 'EFECTIVA_14_94' THEN
        v_rate := 0.1494;
        -- Formula directa de impuesto 14.94%
        v_tax_amount := ROUND(v_base * 0.1494, 2);
    ELSE
        v_mode := 'SIN_FACTURA';
        v_rate := 0.0000;
        v_tax_amount := 0.00;
    END IF;

    RETURN QUERY SELECT
        v_base,
        v_mode,
        v_rate,
        v_tax_amount,
        ROUND(v_base + v_tax_amount, 2);
END;
$$;

-- 4. Update create_company_settlement_atomic RPC to incorporate frozen tax treatment
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
    v_company RECORD;
    v_settlement_id UUID;
    v_settlement_code VARCHAR(50);
    v_total_charges NUMERIC(10,2) := 0.00;
    v_total_adjustments NUMERIC(10,2) := 0.00;
    v_previous_balance NUMERIC(10,2) := 0.00;
    v_subtotal_base NUMERIC(10,2) := 0.00;
    v_tax_amount NUMERIC(10,2) := 0.00;
    v_tax_rate NUMERIC(6,4) := 0.0000;
    v_tax_mode VARCHAR(20) := 'SIN_FACTURA';
    v_final_net_charge NUMERIC(10,2) := 0.00;
    v_final_balance NUMERIC(10,2) := 0.00;
    v_ride_record RECORD;
    v_yymm VARCHAR(4);
    v_seq_val BIGINT;
BEGIN
    -- Security & RBAC Check
    v_user_id := auth.uid();
    v_user_role := public.get_user_role();

    IF v_user_role IS NULL OR v_user_role NOT IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR') THEN
        RAISE EXCEPTION 'Acceso denegado: permiso insuficiente para crear cierres corporativos.'
            USING ERRCODE = '42501';
    END IF;

    -- Fetch Company & current tax_mode
    SELECT id, business_name, COALESCE(tax_mode, 'SIN_FACTURA') as tax_mode
    INTO v_company
    FROM public.companies
    WHERE id = p_company_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Empresa no encontrada.' USING ERRCODE = 'P0002';
    END IF;

    v_tax_mode := v_company.tax_mode;

    -- Generate settlement_code CS-YYMM-NNNNNN
    v_yymm := TO_CHAR(NOW() AT TIME ZONE 'America/La_Paz', 'YYMM');
    BEGIN
        EXECUTE 'CREATE SEQUENCE IF NOT EXISTS public.comp_settle_seq_' || v_yymm || ' START WITH 1 INCREMENT BY 1;';
    EXCEPTION WHEN OTHERS THEN NULL; END;
    EXECUTE 'SELECT NEXTVAL(''public.comp_settle_seq_' || v_yymm || ''');' INTO v_seq_val;
    v_settlement_code := 'CS-' || v_yymm || '-' || LPAD(v_seq_val::TEXT, 6, '0');

    -- Calculate base charges of completed rides within period
    SELECT COALESCE(SUM(total_fare), 0.00) INTO v_subtotal_base
    FROM public.rides
    WHERE company_id = p_company_id
      AND status = 'completed'
      AND created_at >= p_period_start
      AND created_at <= p_period_end;

    -- Calculate adjustments within period
    SELECT COALESCE(SUM(amount), 0.00) INTO v_total_adjustments
    FROM public.company_adjustments
    WHERE company_id = p_company_id
      AND created_at >= p_period_start
      AND created_at <= p_period_end;

    -- Calculate tax surcharge on base
    IF v_tax_mode = 'IVA_13' THEN
        v_tax_rate := 0.1300;
        v_tax_amount := ROUND(v_subtotal_base * 0.13, 2);
    ELSIF v_tax_mode = 'EFECTIVA_14_94' THEN
        v_tax_rate := 0.1494;
        v_tax_amount := ROUND(v_subtotal_base * 0.1494, 2);
    ELSE
        v_tax_mode := 'SIN_FACTURA';
        v_tax_rate := 0.0000;
        v_tax_amount := 0.00;
    END IF;

    v_total_charges := v_subtotal_base + v_tax_amount;
    v_final_net_charge := v_total_charges + v_total_adjustments;

    -- Fetch previous accumulated balance
    SELECT COALESCE(final_accumulated_balance, 0.00) INTO v_previous_balance
    FROM public.company_settlements
    WHERE company_id = p_company_id
      AND settlement_status = 'closed'
    ORDER BY period_end DESC
    LIMIT 1;

    v_final_balance := v_previous_balance + v_final_net_charge;

    -- Insert into public.company_settlements with historical tax freeze
    INSERT INTO public.company_settlements (
        company_id,
        settlement_code,
        period_start,
        period_end,
        total_charges_snapshot,
        total_adjustments_snapshot,
        period_net_charge,
        previous_accumulated_balance,
        final_accumulated_balance,
        settlement_status,
        notes,
        created_by,
        closed_at,
        tax_mode,
        tax_rate_pct,
        subtotal_base,
        tax_amount
    ) VALUES (
        p_company_id,
        v_settlement_code,
        p_period_start,
        p_period_end,
        v_total_charges,
        v_total_adjustments,
        v_final_net_charge,
        v_previous_balance,
        v_final_balance,
        'closed',
        p_notes,
        v_user_id,
        now(),
        v_tax_mode,
        v_tax_rate,
        v_subtotal_base,
        v_tax_amount
    ) RETURNING id INTO v_settlement_id;

    -- Insert settlement items
    FOR v_ride_record IN (
        SELECT id, ride_code, total_fare, created_at
        FROM public.rides
        WHERE company_id = p_company_id
          AND status = 'completed'
          AND created_at >= p_period_start
          AND created_at <= p_period_end
    ) LOOP
        INSERT INTO public.company_settlement_items (
            settlement_id,
            ride_id,
            ticket_code_snapshot,
            fare_snapshot,
            adjustments_snapshot,
            final_item_charge,
            ride_created_at
        ) VALUES (
            v_settlement_id,
            v_ride_record.id,
            'VALE-' || v_ride_record.ride_code,
            v_ride_record.total_fare,
            0.00,
            v_ride_record.total_fare,
            v_ride_record.created_at
        ) ON CONFLICT (ride_id) DO NOTHING;
    END LOOP;

    RETURN v_settlement_id;
END;
$$;
