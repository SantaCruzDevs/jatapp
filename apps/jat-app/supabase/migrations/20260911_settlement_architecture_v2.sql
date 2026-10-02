-- Migration: 20260911_settlement_architecture_v2.sql
-- Description: Re-architects driver settlements to support exact cutoff timestamps (cutoff_at),
-- itemized historical snapshots (driver_settlement_items), bonuses, discounts with mandatory reasons,
-- independent payment state machine (pending_payment vs paid), and atomic lock flags on rides.
-- Safe, idempotent and fully non-destructive to existing rides data.

-- 1. Create or Update driver_settlements Table
ALTER TABLE public.driver_settlements 
  ADD COLUMN IF NOT EXISTS cutoff_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS driver_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 80.00 CHECK (driver_commission_pct >= 0 AND driver_commission_pct <= 100),
  ADD COLUMN IF NOT EXISTS driver_base_share NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (driver_base_share >= 0),
  ADD COLUMN IF NOT EXISTS cash_collected NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (cash_collected >= 0),
  ADD COLUMN IF NOT EXISTS qr_collected NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (qr_collected >= 0),
  ADD COLUMN IF NOT EXISTS ticket_collected NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (ticket_collected >= 0),
  ADD COLUMN IF NOT EXISTS bonus_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (bonus_amount >= 0),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS discount_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS final_net_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS result_type VARCHAR(30) DEFAULT 'conciliado',
  ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(50) DEFAULT 'closed',
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending_payment',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ DEFAULT NULL;

-- Ensure check constraint for mandatory discount reason when discount_amount > 0
ALTER TABLE public.driver_settlements DROP CONSTRAINT IF EXISTS chk_discount_reason;
ALTER TABLE public.driver_settlements 
  ADD CONSTRAINT chk_discount_reason 
  CHECK (
    (discount_amount = 0) OR 
    (discount_amount > 0 AND discount_reason IS NOT NULL AND length(trim(discount_reason)) > 0)
  );

-- Ensure check constraint for valid result_type
ALTER TABLE public.driver_settlements DROP CONSTRAINT IF EXISTS chk_result_type;
ALTER TABLE public.driver_settlements 
  ADD CONSTRAINT chk_result_type 
  CHECK (result_type IN ('motojat_paga', 'motoquero_rinde', 'conciliado'));

-- Ensure check constraint for valid settlement_status
ALTER TABLE public.driver_settlements DROP CONSTRAINT IF EXISTS chk_settlement_status;
ALTER TABLE public.driver_settlements 
  ADD CONSTRAINT chk_settlement_status 
  CHECK (settlement_status IN ('draft', 'closed', 'voided'));

-- Ensure check constraint for valid payment_status
ALTER TABLE public.driver_settlements DROP CONSTRAINT IF EXISTS chk_payment_status;
ALTER TABLE public.driver_settlements 
  ADD CONSTRAINT chk_payment_status 
  CHECK (payment_status IN ('pending_payment', 'paid'));

-- 2. Create driver_settlement_items Table (Historical Snapshot per Ride)
CREATE TABLE IF NOT EXISTS public.driver_settlement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID REFERENCES public.driver_settlements(id) ON DELETE CASCADE NOT NULL,
    ride_id UUID REFERENCES public.rides(id) ON DELETE RESTRICT NOT NULL,
    fare_amount_snapshot NUMERIC(10,2) NOT NULL CHECK (fare_amount_snapshot >= 0),
    driver_pct_snapshot NUMERIC(5,2) NOT NULL CHECK (driver_pct_snapshot >= 0 AND driver_pct_snapshot <= 100),
    driver_share_snapshot NUMERIC(10,2) NOT NULL CHECK (driver_share_snapshot >= 0),
    payment_method_snapshot VARCHAR(50) NOT NULL,
    ticket_id UUID REFERENCES public.corporate_tickets(id) ON DELETE SET NULL,
    ride_created_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT unq_settlement_item_ride UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS idx_settlement_items_settlement ON public.driver_settlement_items(settlement_id);
CREATE INDEX IF NOT EXISTS idx_settlement_items_ride ON public.driver_settlement_items(ride_id);

-- 3. Modify rides Table to Add Secondary Performance & Lock Flags
ALTER TABLE public.rides 
  ADD COLUMN IF NOT EXISTS is_settled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES public.driver_settlements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rides_settlement_lookup ON public.rides(driver_id, status, is_settled, created_at);

-- Enable RLS on driver_settlement_items
ALTER TABLE public.driver_settlement_items ENABLE ROW LEVEL SECURITY;

-- Preliminary RLS Policies for driver_settlement_items
DROP POLICY IF EXISTS driver_settlement_items_select_policy ON public.driver_settlement_items;
CREATE POLICY driver_settlement_items_select_policy ON public.driver_settlement_items
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
    OR settlement_id IN (SELECT id FROM public.driver_settlements WHERE driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid()))
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

DROP POLICY IF EXISTS driver_settlement_items_delete_policy ON public.driver_settlement_items;
CREATE POLICY driver_settlement_items_delete_policy ON public.driver_settlement_items
  FOR DELETE USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN')
  );
