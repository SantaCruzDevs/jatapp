-- ====================================================================
-- MIGRACIÓN CORRECTIVA: Otorgamiento de Permisos GRANT sobre public.company_contracts
-- ARCHIVO: 20261007000003_company_contracts_table_grants.sql
-- 
-- MOTIVO:
-- La migración original 20260922000002_company_contracts.sql creó la tabla y definió
-- las políticas RLS para (SELECT, INSERT, UPDATE, DELETE), pero omitió el GRANT a nivel de tabla
-- para el rol 'authenticated'. Esto provocaba que PostgREST rechazara las consultas cliente
-- con el error SQL 42501 (permission denied for table company_contracts).
-- 
-- SEGURIDAD & MÍNIMO PRIVILEGIO:
-- 1. Únicamente se otorga GRANT a 'authenticated'.
-- 2. 'anon' PERMANECE SIN ACCESO (No GRANT to anon).
-- 3. Las 4 políticas RLS existentes (select, insert, update, delete) filtran y protegen
--    el acceso según el rol retornado por public.get_user_role().
-- ====================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_contracts TO authenticated;

NOTIFY pgrst, 'reload schema';
