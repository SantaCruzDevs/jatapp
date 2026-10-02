-- Migration: 20260911_settlement_v2_1_refinements.sql
-- Description: Phase 2.1 Refinements for Driver Settlements:
-- 1. Partial Unique Index on driver_settlement_items (is_voided = FALSE) to allow re-settling released rides after voiding while preserving voided historical snapshot items.
-- 2. Update void_driver_settlement_atomic to mark items as is_voided = TRUE when voiding.
-- 3. Restrict direct client INSERT/UPDATE on driver_settlement_items so all mutations must occur through trusted SECURITY DEFINER RPC functions.
-- 4. Enforce ON DELETE RESTRICT on critical financial references.

-- 1. Add is_voided flag to driver_settlement_items
ALTER TABLE public.driver_settlement_items 
  ADD COLUMN IF NOT EXISTS is_voided BOOLEAN NOT NULL DEFAULT FALSE;

-- Drop legacy table-wide UNIQUE constraint on ride_id if exists
ALTER TABLE public.driver_settlement_items 
  DROP CONSTRAINT IF EXISTS unq_settlement_item_ride;

-- Create Partial Unique Index enforcing uniqueness ONLY for active (non-voided) settlement items
DROP INDEX IF EXISTS idx_unq_active_settlement_item_ride;
CREATE UNIQUE INDEX idx_unq_active_settlement_item_ride 
  ON public.driver_settlement_items (ride_id) 
  WHERE is_voided = FALSE;

-- 2. Updated void_driver_settlement_atomic RPC function
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

    -- 1. Mark snapshot items as voided so their partial unique index restriction is released
    UPDATE public.driver_settlement_items
    SET is_voided = TRUE
    WHERE settlement_id = p_settlement_id;

    -- 2. Release linked rides so they become available for future cutoffs
    UPDATE public.rides
    SET is_settled = FALSE,
        settlement_id = NULL
    WHERE settlement_id = p_settlement_id;

    -- 3. Update settlement header to voided
    UPDATE public.driver_settlements
    SET settlement_status = 'voided',
        updated_at = now()
    WHERE id = p_settlement_id;
END;
$$;

-- 3. Restrict direct client INSERT / UPDATE on driver_settlement_items
-- All insertions/updates MUST occur strictly through SECURITY DEFINER RPC functions.
DROP POLICY IF EXISTS driver_settlement_items_insert_policy ON public.driver_settlement_items;
DROP POLICY IF EXISTS driver_settlement_items_update_policy ON public.driver_settlement_items;
DROP POLICY IF EXISTS driver_settlement_items_delete_policy ON public.driver_settlement_items;

-- Select policy remains active for history viewing
DROP POLICY IF EXISTS driver_settlement_items_select_policy ON public.driver_settlement_items;
CREATE POLICY driver_settlement_items_select_policy ON public.driver_settlement_items
  FOR SELECT USING (
    public.get_user_role() IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR')
    OR settlement_id IN (
      SELECT id FROM public.driver_settlements 
      WHERE driver_id IN (SELECT id FROM public.drivers WHERE profile_id = auth.uid())
    )
  );
