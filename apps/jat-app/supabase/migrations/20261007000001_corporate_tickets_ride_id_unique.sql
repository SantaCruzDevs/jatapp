-- ===================================================
-- MIGRATION: 20261007000001_corporate_tickets_ride_id_unique.sql
-- PURPOSE: Add UNIQUE constraint to public.corporate_tickets(ride_id)
-- AUTHORIZED BY: CLIENT-CONTRACT-04.7 Implementation
-- ===================================================

ALTER TABLE public.corporate_tickets
ADD CONSTRAINT corporate_tickets_ride_id_key UNIQUE (ride_id);

COMMENT ON CONSTRAINT corporate_tickets_ride_id_key ON public.corporate_tickets IS
'Garantiza que cada carrera (rides.id) pueda tener como máximo un único vale/ticket corporativo en el sistema.';
