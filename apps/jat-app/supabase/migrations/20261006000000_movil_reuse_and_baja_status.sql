-- Migration: 20261006000000_movil_reuse_and_baja_status.sql
-- Description: Enables 'baja' status for drivers, replaces global movil_number UNIQUE constraint with partial unique index,
--              and implements atomic gap-filling movil assignment via BEFORE INSERT trigger.

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
