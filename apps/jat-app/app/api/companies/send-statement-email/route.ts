import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const body = await req.json();
    const { company_id, recipient_email, period_label, pdf_base64, total_pending } = body;

    if (!company_id || !recipient_email || !pdf_base64) {
      return NextResponse.json(
        { success: false, error: 'Faltan parámetros requeridos (company_id, recipient_email, pdf_base64).' },
        { status: 400 }
      );
    }

    // 1. Validate user permissions & multi-tenant access to company
    const { data: userRole } = await supabase.rpc('get_user_role');
    const role = userRole as string | null;

    if (role === 'CLIENT_USER') {
      const { data: compUser } = await supabase
        .from('company_users')
        .select('id')
        .eq('profile_id', authData.user.id)
        .eq('company_id', company_id)
        .single();

      if (!compUser) {
        return NextResponse.json(
          { success: false, error: 'Acceso denegado: no tiene permisos para gestionar esta empresa.' },
          { status: 403 }
        );
      }
    } else if (!role || !['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Acceso denegado.' }, { status: 403 });
    }

    // 2. Fetch company business name and registered email directly from database (Authoritative Source)
    const { data: company, error: compErr } = await supabase
      .from('companies')
      .select('id, business_name, nit, email')
      .eq('id', company_id)
      .single();

    if (compErr || !company) {
      return NextResponse.json({ success: false, error: 'Empresa no encontrada.' }, { status: 404 });
    }

    // 2b. Validate target email against database registration
    const targetEmail = (company.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return NextResponse.json(
        { success: false, error: 'Esta empresa no tiene un correo oficial registrado en la base de datos.' },
        { status: 400 }
      );
    }

    if (recipient_email && recipient_email.trim().toLowerCase() !== targetEmail) {
      return NextResponse.json(
        { success: false, error: 'Acceso denegado: el correo especificado no coincide con el correo oficial registrado de la empresa.' },
        { status: 403 }
      );
    }

    // 3. Send email with PDF attachment via Resend API
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.TICKET_FROM_EMAIL || 'tickets@motojat.com';
    const dateStamp = new Date().toISOString().split('T')[0];
    const sanitizedComp = company.business_name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
    const fileName = `Estado-de-Cuenta-${sanitizedComp}-${dateStamp}.pdf`;

    let providerMsgId: string | null = null;
    let deliveryStatus: 'sent' | 'failed' = 'sent';
    let errorMessage: string | null = null;

    if (resendApiKey) {
      try {
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; background-color: #0F172A; color: #FFFFFF; padding: 24px; border-radius: 12px;">
            <h2 style="color: #FDDE12; margin-bottom: 4px;">MOTOSERVI JUSTO A TIEMPO S.R.L.</h2>
            <p style="color: #94A3B8; font-size: 14px; margin-top: 0;">DEPARTAMENTO DE COBRANZAS Y GESTIÓN CORPORATIVA</p>

            <div style="background-color: #1E293B; border: 1px solid #334155; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Empresa:</strong> ${company.business_name}</p>
              <p style="margin: 4px 0;"><strong>NIT:</strong> ${company.nit || 'Sin NIT'}</p>
              <p style="margin: 4px 0;"><strong>Período Consultado:</strong> ${period_label || 'Todos los pendientes'}</p>
              <p style="margin: 4px 0;"><strong>Total Deuda Pendiente:</strong> <strong style="font-size: 18px; color: #FDDE12;">Bs. ${Number(total_pending || 0).toFixed(2)}</strong></p>
            </div>

            <p style="color: #CBD5E1; font-size: 14px;">
              Estimados,<br/><br/>
              Adjuntamos en formato PDF el <strong>Estado de Cuenta Corporativo</strong> correspondiente a los servicios pendientes registrados en MotoJAT.
            </p>
            <p style="color: #CBD5E1; font-size: 14px;">
              El documento contiene el detalle completo de cada ticket, carrera, solicitante, ruta (Origen → Destino) e importes pendientes para su revisión y conciliación.
            </p>

            <div style="border-top: 1px solid #334155; margin-top: 20px; padding-top: 12px; font-size: 12px; color: #64748B;">
              MotoJAT — Motoservi Justo a Tiempo S.R.L. | Santa Cruz, Bolivia
            </div>
          </div>
        `;

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `MotoJAT Cobranzas <${fromEmail}>`,
            to: [targetEmail],
            subject: `Estado de Cuenta Corporativo — ${company.business_name} — MotoJAT`,
            html: htmlContent,
            attachments: [
              {
                filename: fileName,
                content: pdf_base64,
              },
            ],
          }),
        });

        const resendBody = await resendRes.json();
        if (resendRes.ok) {
          providerMsgId = resendBody.id;
          deliveryStatus = 'sent';
        } else {
          deliveryStatus = 'failed';
          errorMessage = resendBody.message || 'Error del proveedor Resend API.';
        }
      } catch (err: unknown) {
        deliveryStatus = 'failed';
        errorMessage = (err as Error).message || 'Error de red con proveedor de correo.';
      }
    } else {
      const allowMock = process.env.ALLOW_MOCK_TICKET_DELIVERY === 'true';
      if (allowMock) {
        providerMsgId = `mock_statement_${Date.now()}`;
        deliveryStatus = 'sent';
      } else {
        deliveryStatus = 'failed';
        errorMessage = 'Servicio de correo no configurado (falta RESEND_API_KEY en el servidor).';
      }
    }

    return NextResponse.json({
      success: deliveryStatus === 'sent',
      messageId: providerMsgId,
      error: errorMessage,
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

function companyIdOr(id: string) {
  return id;
}
