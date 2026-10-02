-- Migration: Add cargo_description to public.rides for JATapp v1.0
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS cargo_description TEXT DEFAULT NULL;
