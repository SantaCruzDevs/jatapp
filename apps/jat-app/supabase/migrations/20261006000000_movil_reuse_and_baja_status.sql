-- Migration: 20261006000000_movil_reuse_and_baja_status.sql
-- Description: Enables 'baja' status for drivers, replaces global movil_number UNIQUE constraint with partial unique index,
--              implements atomic gap-filling movil assignment via BEFORE INSERT trigger, and adds atomic reactivate_driver RPC function.

-- 1. Update status check constraint to include 'baja'
DO $$
BEGIN
    -- Drop existing status check constraints if present
    ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_status_check;
    ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_status_check1;
    -- Add updated status check constraint
    ALTER TABLE public.drivers ADD CONSTRAINT drivers_status_check CHECK (status IN ('available', 'busy', 'offline', 'baja'));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 2. Drop global UNIQUE constraint on movil_number and replace with partial UNIQUE index (excluding status = 'baja')
ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_movil_number_key;
DROP INDEX IF EXISTS idx_drivers_active_movil_unique;

CREATE UNIQUE INDEX idx_drivers_active_movil_unique
ON public.drivers (movil_number)
WHERE status != 'baja';

-- 3. BEFORE INSERT Trigger for Atomic Movil Assignment
CREATE OR REPLACE FUNCTION public.assign_next_movil_number_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_next INT;
BEGIN
    -- Advisory lock to serialize movil number assignment across concurrent transactions
    PERFORM pg_advisory_xact_lock(987654321);

    -- Find the smallest positive integer candidate not occupied by any active driver (status != 'baja')
    SELECT MIN(t.candidate) INTO v_next
    FROM (
        SELECT 1 AS candidate
        UNION ALL
        SELECT movil_number + 1 AS candidate
        FROM public.drivers
        WHERE status != 'baja'
    ) t
    WHERE t.candidate NOT IN (
        SELECT movil_number
        FROM public.drivers
        WHERE status != 'baja'
    ) AND t.candidate > 0;

    -- Override NEW.movil_number with the authoritatively assigned lowest available positive integer
    NEW.movil_number := COALESCE(v_next, 1);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_drivers_assign_movil ON public.drivers;

CREATE TRIGGER trg_drivers_assign_movil
BEFORE INSERT ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION public.assign_next_movil_number_trigger();

-- 4. Atomic Reactivation Function for Drivers in 'baja'
CREATE OR REPLACE FUNCTION public.reactivate_driver(p_driver_id UUID)
RETURNS public.drivers AS $$
DECLARE
    v_driver public.drivers%ROWTYPE;
    v_old_movil INT;
    v_is_old_taken BOOLEAN;
    v_next_movil INT;
BEGIN
    -- Advisory lock to serialize movil assignment and reactivation across concurrent transactions
    PERFORM pg_advisory_xact_lock(987654321);

    SELECT * INTO v_driver
    FROM public.drivers
    WHERE id = p_driver_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Motoquero no encontrado.';
    END IF;

    IF v_driver.status != 'baja' THEN
        RAISE EXCEPTION 'El motoquero no se encuentra en estado BAJA.';
    END IF;

    v_old_movil := v_driver.movil_number;

    -- Check if old movil number is currently taken by any active driver (status != 'baja')
    SELECT EXISTS (
        SELECT 1
        FROM public.drivers
        WHERE movil_number = v_old_movil
          AND status != 'baja'
          AND id != p_driver_id
    ) INTO v_is_old_taken;

    IF NOT v_is_old_taken AND v_old_movil IS NOT NULL AND v_old_movil > 0 THEN
        -- Case A: Old movil is still free -> Recover old movil
        v_next_movil := v_old_movil;
    ELSE
        -- Case B: Old movil is taken -> Find lowest available positive integer candidate
        SELECT MIN(t.candidate) INTO v_next_movil
        FROM (
            SELECT 1 AS candidate
            UNION ALL
            SELECT movil_number + 1 AS candidate
            FROM public.drivers
            WHERE status != 'baja' AND id != p_driver_id
        ) t
        WHERE t.candidate NOT IN (
            SELECT movil_number
            FROM public.drivers
            WHERE status != 'baja' AND id != p_driver_id
        ) AND t.candidate > 0;

        IF v_next_movil IS NULL THEN
            v_next_movil := 1;
        END IF;
    END IF;

    UPDATE public.drivers
    SET status = 'available',
        movil_number = v_next_movil,
        updated_at = now()
    WHERE id = p_driver_id
    RETURNING * INTO v_driver;

    RETURN v_driver;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
