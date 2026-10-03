import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { UserRole } from '@/types/database.types';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ ticketFormat: 'detailed', companyPortalEnabled: false });
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Fetch Ticket Format setting
    const { data: ticketData } = await supabaseAdmin
      .from('user_permissions')
      .select('permission_key, created_at')
      .like('permission_key', 'TICKET_CFG:%')
      .order('created_at', { ascending: false })
      .limit(1);

    let ticketFormat = 'detailed';
    if (ticketData && ticketData.length > 0) {
      const format = ticketData[0].permission_key.replace('TICKET_CFG:', '');
      if (format === 'simple' || format === 'detailed') {
        ticketFormat = format;
      }
    }

    // 2. Fetch COMPANY_PORTAL_ENABLED setting (Default: false)
    const { data: portalData } = await supabaseAdmin
      .from('user_permissions')
      .select('permission_key, created_at')
      .like('permission_key', 'COMPANY_PORTAL_CFG:%')
      .order('created_at', { ascending: false })
      .limit(1);

    let companyPortalEnabled = false;
    if (portalData && portalData.length > 0) {
      const valStr = portalData[0].permission_key.replace('COMPANY_PORTAL_CFG:', '');
      companyPortalEnabled = valStr === 'true';
    }

    // 3. Fetch PRE_SETTLEMENTS_ENABLED setting (Default: false)
    const { data: preSettlementData } = await supabaseAdmin
      .from('user_permissions')
      .select('permission_key, created_at')
      .like('permission_key', 'PRE_SETTLEMENT_CFG:%')
      .order('created_at', { ascending: false })
      .limit(1);

    let preSettlementsEnabled = false;
    if (preSettlementData && preSettlementData.length > 0) {
      const valStr = preSettlementData[0].permission_key.replace('PRE_SETTLEMENT_CFG:', '');
      preSettlementsEnabled = valStr === 'true';
    }

    return NextResponse.json({
      ticketFormat,
      companyPortalEnabled,
      preSettlementsEnabled,
    });
  } catch (err: unknown) {
    console.error('Error in GET /api/admin/settings:', err);
    return NextResponse.json({ ticketFormat: 'detailed', companyPortalEnabled: false, preSettlementsEnabled: false });
  }
}

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

    // 2. Fetch requester's authoritative profile role
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

    // Strict Authorization: ONLY SUPERADMIN (Soporte) can modify global system settings
    if (activeRole !== 'SUPERADMIN') {
      return NextResponse.json(
        { error: 'Permiso denegado: Únicamente el usuario Soporte (SUPERADMIN) está autorizado a modificar la configuración del sistema.' },
        { status: 403 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Error de configuración del servidor: Service Role Key no configurada.' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await request.json();
    const { ticketFormat, companyPortalEnabled, preSettlementsEnabled } = body as {
      ticketFormat?: string;
      companyPortalEnabled?: boolean;
      preSettlementsEnabled?: boolean;
    };

    // Update Ticket Format if provided
    if (ticketFormat) {
      if (!['detailed', 'simple'].includes(ticketFormat)) {
        return NextResponse.json(
          { error: "Formato de ticket no válido. Debe ser 'detailed' o 'simple'." },
          { status: 400 }
        );
      }

      await supabaseAdmin
        .from('user_permissions')
        .delete()
        .eq('profile_id', requester.id)
        .like('permission_key', 'TICKET_CFG:%');

      const { error: insertTicketErr } = await supabaseAdmin
        .from('user_permissions')
        .insert([
          {
            profile_id: requester.id,
            permission_key: `TICKET_CFG:${ticketFormat}`,
          },
        ]);

      if (insertTicketErr) {
        return NextResponse.json(
          { error: `Error al guardar formato de ticket: ${insertTicketErr.message}` },
          { status: 500 }
        );
      }
    }

    // Update COMPANY_PORTAL_ENABLED if provided
    if (typeof companyPortalEnabled === 'boolean') {
      await supabaseAdmin
        .from('user_permissions')
        .delete()
        .eq('profile_id', requester.id)
        .like('permission_key', 'COMPANY_PORTAL_CFG:%');

      const { error: insertPortalErr } = await supabaseAdmin
        .from('user_permissions')
        .insert([
          {
            profile_id: requester.id,
            permission_key: `COMPANY_PORTAL_CFG:${companyPortalEnabled}`,
          },
        ]);

      if (insertPortalErr) {
        return NextResponse.json(
          { error: `Error al guardar estado del Portal Empresa: ${insertPortalErr.message}` },
          { status: 500 }
        );
      }
    }

    // Update PRE_SETTLEMENTS_ENABLED if provided
    if (typeof preSettlementsEnabled === 'boolean') {
      await supabaseAdmin
        .from('user_permissions')
        .delete()
        .eq('profile_id', requester.id)
        .like('permission_key', 'PRE_SETTLEMENT_CFG:%');

      const { error: insertPreErr } = await supabaseAdmin
        .from('user_permissions')
        .insert([
          {
            profile_id: requester.id,
            permission_key: `PRE_SETTLEMENT_CFG:${preSettlementsEnabled}`,
          },
        ]);

      if (insertPreErr) {
        return NextResponse.json(
          { error: `Error al guardar estado de Pre-liquidaciones: ${insertPreErr.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      message: 'Configuración actualizada exitosamente.',
      ticketFormat: ticketFormat || 'detailed',
      companyPortalEnabled: typeof companyPortalEnabled === 'boolean' ? companyPortalEnabled : false,
      preSettlementsEnabled: typeof preSettlementsEnabled === 'boolean' ? preSettlementsEnabled : false,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Unhandled error in /api/admin/settings POST:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
