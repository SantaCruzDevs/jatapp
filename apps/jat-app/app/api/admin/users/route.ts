import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { UserRole } from '@/types/database.types';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate requester via session cookies
    const supabaseServer = await createServerClient();
    const { data: { user: requester } } = await supabaseServer.auth.getUser();

    if (!requester) {
      return NextResponse.json(
        { error: 'Usuario no autenticado. Por favor inicie sesión.' },
        { status: 401 }
      );
    }

    // 2. Fetch requester's authoritative profile role from public.profiles
    const { data: requesterProfile, error: profileErr } = await supabaseServer
      .from('profiles')
      .select('role')
      .eq('id', requester.id)
      .single();

    if (profileErr || !requesterProfile) {
      return NextResponse.json(
        { error: 'No se pudo verificar el perfil del usuario solicitante.' },
        { status: 403 }
      );
    }

    const activeRole = requesterProfile.role as UserRole;

    // RBAC: Only SUPERADMIN, ADMIN, and SUPERVISOR can manage/create users or driver profiles
    if (!['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(activeRole)) {
      return NextResponse.json(
        { error: 'Permiso denegado: Su rol no posee privilegios para administrar usuarios.' },
        { status: 403 }
      );
    }

    // Initialize Supabase Admin Client using Service Role Key (Server-Side Only)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Error de configuración del servidor: Service Role Key no configurada.' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await request.json();

    // =========================================================================
    // MODE B: Complete Driver Profile for Existing DRIVER User (action === 'complete_driver_profile')
    // =========================================================================
    if (body.action === 'complete_driver_profile') {
      const { profile_id, movil_number, vehicle_type, vehicle_plate, zone } = body as {
        profile_id: string;
        movil_number: number;
        vehicle_type: string;
        vehicle_plate: string;
        zone: string;
      };

      if (!profile_id || !movil_number || !vehicle_type || !vehicle_plate || !zone) {
        return NextResponse.json(
          { error: 'Todos los campos de motoquero (Móvil, Vehículo, Placa, Zona) son obligatorios.' },
          { status: 400 }
        );
      }

      // Check if profile exists and has role DRIVER
      const { data: targetProfile, error: targetProfErr } = await supabaseAdmin
        .from('profiles')
        .select('id, role, full_name')
        .eq('id', profile_id)
        .single();

      if (targetProfErr || !targetProfile) {
        return NextResponse.json(
          { error: 'El perfil de usuario especificado no existe.' },
          { status: 404 }
        );
      }

      if (targetProfile.role !== 'DRIVER') {
        return NextResponse.json(
          { error: 'El usuario debe tener rol DRIVER (Motoquero) para registrar una ficha de conductor.' },
          { status: 400 }
        );
      }

      // Check if driver profile already exists
      const { data: existingDriverRecord } = await supabaseAdmin
        .from('drivers')
        .select('id')
        .eq('profile_id', profile_id)
        .maybeSingle();

      if (existingDriverRecord) {
        return NextResponse.json(
          { error: 'Este usuario ya cuenta con una ficha de motoquero registrada.' },
          { status: 400 }
        );
      }

      // Server-Side movil_number Uniqueness Check
      const { data: existingMovil } = await supabaseAdmin
        .from('drivers')
        .select('id, movil_number')
        .eq('movil_number', Number(movil_number))
        .maybeSingle();

      if (existingMovil) {
        return NextResponse.json(
          { error: `El número de móvil #${movil_number} ya está registrado en la flota por otro conductor.` },
          { status: 400 }
        );
      }

      // Insert new public.drivers row
      const { data: newDriverRecord, error: insertDriverErr } = await supabaseAdmin
        .from('drivers')
        .insert([{
          profile_id,
          movil_number: Number(movil_number),
          vehicle_type: vehicle_type.trim(),
          vehicle_plate: vehicle_plate.trim().toUpperCase(),
          zone: zone.trim(),
          rating: 5.00,
          status: 'available',
        }])
        .select()
        .single();

      if (insertDriverErr) {
        console.error('Error completing driver profile:', insertDriverErr);
        return NextResponse.json(
          { error: `Error al crear ficha de motoquero: ${insertDriverErr.message}` },
          { status: 400 }
        );
      }

      return NextResponse.json({
        message: `Ficha de motoquero Móvil #${movil_number} registrada exitosamente.`,
        driver: newDriverRecord,
      });
    }

    // =========================================================================
    // MODE A: Full User Creation (auth.users -> public.profiles [-> public.drivers])
    // =========================================================================
    const { 
      full_name, 
      email, 
      phone, 
      password, 
      role: targetRole,
      movil_number,
      vehicle_type,
      vehicle_plate,
      zone
    } = body as {
      full_name: string;
      email: string;
      phone?: string;
      password: string;
      role: UserRole;
      movil_number?: number;
      vehicle_type?: string;
      vehicle_plate?: string;
      zone?: string;
    };

    if (!full_name || !email || !password || !targetRole) {
      return NextResponse.json(
        { error: 'Todos los campos requeridos (Nombre, Email, Contraseña, Rol) deben ser proporcionados.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña inicial debe tener al menos 6 caracteres.' },
        { status: 400 }
      );
    }

    // RBAC Hierarchy Checks
    const allowedRoles: UserRole[] = ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR', 'DRIVER', 'CLIENT_USER'];
    if (!allowedRoles.includes(targetRole)) {
      return NextResponse.json(
        { error: `El rol '${targetRole}' no es válido en el sistema.` },
        { status: 400 }
      );
    }

    if (activeRole === 'SUPERVISOR' && !['OPERATOR', 'DRIVER', 'CLIENT_USER'].includes(targetRole)) {
      return NextResponse.json(
        { error: 'Permiso denegado: Un Supervisor solo puede crear usuarios operativos (Operador, Motoquero, Cliente).' },
        { status: 403 }
      );
    }

    // Strict Prohibition: SUPERADMIN creation is disabled in system API
    if (targetRole === 'SUPERADMIN') {
      return NextResponse.json(
        { error: 'Permiso denegado: No está permitido crear nuevos usuarios con el rol interno Soporte (SUPERADMIN).' },
        { status: 403 }
      );
    }

    // Server-Side Driver Fields Pre-Validation (if targetRole === 'DRIVER')
    if (targetRole === 'DRIVER') {
      if (!movil_number || !vehicle_type || !vehicle_plate || !zone) {
        return NextResponse.json(
          { error: 'Para registrar un Motoquero, los campos (Móvil, Tipo de Vehículo, Placa, Zona) son obligatorios.' },
          { status: 400 }
        );
      }

      // Check if movil_number already exists BEFORE creating auth user
      const { data: existingMovil } = await supabaseAdmin
        .from('drivers')
        .select('id, movil_number')
        .eq('movil_number', Number(movil_number))
        .maybeSingle();

      if (existingMovil) {
        return NextResponse.json(
          { error: `El número de móvil #${movil_number} ya está registrado en la flota.` },
          { status: 400 }
        );
      }
    }

    // 1. Create Auth User in auth.users via Supabase Auth Admin API
    const { data: newAuthData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role: targetRole,
      },
    });

    if (createErr || !newAuthData.user) {
      console.error('Error in auth.admin.createUser:', createErr);
      return NextResponse.json(
        { error: `Error al crear usuario en Supabase Auth: ${createErr?.message || 'Error desconocido'}` },
        { status: 400 }
      );
    }

    const newUserId = newAuthData.user.id;

    // 2. Update public.profiles row created by trigger handle_new_user()
    const { data: profileData, error: updateProfileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUserId,
        full_name,
        phone: phone || null,
        role: targetRole,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (updateProfileErr) {
      console.error('Error updating public.profiles after createUser:', updateProfileErr);
      // Rollback auth user creation
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return NextResponse.json(
        { error: `Falló la inicialización del perfil de usuario: ${updateProfileErr.message}. La cuenta fue revertida.` },
        { status: 500 }
      );
    }

    // 3. If targetRole === 'DRIVER', insert public.drivers record with rollback protection
    let createdDriverData = null;
    if (targetRole === 'DRIVER') {
      const { data: driverData, error: createDriverErr } = await supabaseAdmin
        .from('drivers')
        .insert([{
          profile_id: newUserId,
          movil_number: Number(movil_number),
          vehicle_type: vehicle_type!.trim(),
          vehicle_plate: vehicle_plate!.trim().toUpperCase(),
          zone: zone!.trim(),
          rating: 5.00,
          status: 'available',
        }])
        .select()
        .single();

      if (createDriverErr) {
        console.error('Error creating driver record after profile creation:', createDriverErr);
        // ROLLBACK: Atomic cleanup of newly created auth.user & profile
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        return NextResponse.json(
          { error: `Error al crear la ficha de motoquero: ${createDriverErr.message}. La creación del usuario fue revertida para evitar registros huérfanos.` },
          { status: 400 }
        );
      }

      createdDriverData = driverData;
    }

    return NextResponse.json({
      message: targetRole === 'DRIVER' 
        ? `Motoquero Móvil #${movil_number} y usuario registrado exitosamente.` 
        : 'Usuario registrado exitosamente.',
      user: profileData,
      driver: createdDriverData,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Unhandled error in /api/admin/users POST:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor al procesar la solicitud.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user: requester } } = await supabaseServer.auth.getUser();

    if (!requester) {
      return NextResponse.json(
        { error: 'Usuario no autenticado.' },
        { status: 401 }
      );
    }

    const { data: requesterProfile } = await supabaseServer
      .from('profiles')
      .select('role')
      .eq('id', requester.id)
      .single();

    if (!requesterProfile || !['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(requesterProfile.role)) {
      return NextResponse.json(
        { error: 'Permiso denegado: Su rol no posee privilegios para consultar usuarios.' },
        { status: 403 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Service Role Key no configurada.' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 500 });
    }

    const emails: Record<string, string> = {};
    for (const u of authData.users) {
      if (u.id && u.email) {
        emails[u.id] = u.email;
      }
    }

    return NextResponse.json({ emails });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

