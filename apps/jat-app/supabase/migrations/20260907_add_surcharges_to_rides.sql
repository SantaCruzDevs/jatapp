-- Migration: Add surcharge tracking columns to public.rides for JATapp v1.0
ALTER TABLE public.rides
ADD COLUMN IF NOT EXISTS surcharge_amount NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS surcharge_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS surcharge_status VARCHAR(20) DEFAULT NULL;

-- Add check constraint for valid surcharge statuses if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_surcharge_status'
    ) THEN
        ALTER TABLE public.rides 
        ADD CONSTRAINT check_surcharge_status 
        CHECK (surcharge_status IS NULL OR surcharge_status IN ('pending', 'approved', 'rejected'));
    END IF;
END $$;
