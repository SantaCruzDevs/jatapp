-- ==============================================================================
-- JATapp - Single-Company Local Development Seed File
-- 
-- WARNING: DO NOT RUN THIS SEED IN PRODUCTION (SUPABASE CLOUD).
-- Production setup requires authenticating real users via Supabase Auth.
-- NO support or administrative credentials are stored in this file.
-- ==============================================================================

-- Note: In local development with Supabase CLI, users can be inserted into auth.users.
-- For local testing, drivers and representative rides can be populated below without tenant_id.

-- 1. Example Local Development Drivers (Flota MotoJAT - Entorno Local)
INSERT INTO public.drivers (id, profile_id, movil_number, vehicle_type, vehicle_plate, zone, rating, status)
VALUES
    ('d0000000-0000-0000-0000-000000000001', NULL, 1, 'Vespa 150cc', 'SCZ-228', 'Centro', 4.80, 'available'),
    ('d0000000-0000-0000-0000-000000000002', NULL, 2, 'Honda Titan 150', 'SCZ-994', 'Equipetrol', 4.90, 'available'),
    ('d0000000-0000-0000-0000-000000000003', NULL, 3, 'Yamaha FZ 16', 'SCZ-441', 'Norte', 4.60, 'busy'),
    ('d0000000-0000-0000-0000-000000000004', NULL, 4, 'Suzuki GN 125', 'SCZ-112', 'Sur', 4.70, 'available'),
    ('d0000000-0000-0000-0000-000000000005', NULL, 5, 'Honda Navi 110', 'ZZZ-456', 'Centro', 4.80, 'available')
ON CONFLICT (id) DO NOTHING;

-- 2. Example Local Development Ride (Carrera de prueba local)
INSERT INTO public.rides (
    id, ride_code, requester_company, requester_person, pickup_address, destination_address, 
    initial_fare, wait_time_minutes, wait_time_cost, total_fare, status, priority, driver_id, payment_method, observations
)
VALUES (
    'r0000000-0000-0000-0000-000000000101',
    'RIDE-101',
    'Farmacorp S.A.',
    'Ing. Fabiola Tórrez',
    'Av. Las Américas 450',
    'Equipetrol Calle 8 Norte',
    35.00,
    0,
    0.00,
    35.00,
    'pending',
    'high',
    NULL,
    'Ticket',
    'Documentación médica urgente'
) ON CONFLICT (id) DO NOTHING;

-- 3. Example Local Ride Timeline
INSERT INTO public.ride_timeline (id, ride_id, status_from, status_to, event_title, event_description)
VALUES (
    gen_random_uuid(),
    'r0000000-0000-0000-0000-000000000101',
    NULL,
    'pending',
    'Solicitud Recibida',
    'Ingreso al sistema desde Farmacorp S.A.'
) ON CONFLICT (id) DO NOTHING;

