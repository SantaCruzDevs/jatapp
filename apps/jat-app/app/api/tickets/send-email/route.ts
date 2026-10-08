import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDigitalTicketByCode } from '@/lib/services/tickets';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const body = await req.json();
    const { ride_id, recipient_email, is_resend } = body;

    if (!ride_id) {
      return NextResponse.json({ success: false, error: 'Se requiere el ID de la carrera.' }, { status: 400 });
    }

    // 1. Fetch digital ticket details
    const { ticket, error: ticketErr } = await getDigitalTicketByCode(ride_id);
    if (ticketErr || !ticket) {
      return NextResponse.json({ success: false, error: 'Carrera o ticket no encontrado.' }, { status: 404 });
    }

    // 2. Resolve recipient email
    const targetEmail = recipient_email || ticket.company_address || 'cliente@empresa.com';
    const deliveryKey = `email_${ticket.id}_${Date.now()}`;

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.TICKET_FROM_EMAIL || 'tickets@motojat.com';

    let providerMsgId: string | null = null;
    let deliveryStatus: 'sent' | 'failed' = 'sent';
    let errorMessage: string | null = null;

    if (resendApiKey) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.motojat.com';
        const displayCode = ticket.serviceCode || ticket.ticketCode;
        const publicUrl = `${appUrl}/t/${ticket.rideCode}?token=${ticket.publicToken}`;

        const htmlContent = `
          <div style="font-family: Arial, sans-serif; background-color: #0F172A; color: #FFFFFF; padding: 24px; border-radius: 12px;">
            <h2 style="color: #FDDE12; margin-bottom: 4px;">MOTOSERVI JUSTO A TIEMPO S.R.L.</h2>
            <p style="color: #94A3B8; font-size: 14px; margin-top: 0;">COMPROBANTE DIGITAL DE SERVICIO</p>

            <div style="background-color: #1E293B; border: 1px solid #334155; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p><strong>Comprobante:</strong> <span style="font-family: monospace; color: #FDDE12;">${displayCode}</span></p>
              <p><strong>Solicitante:</strong> ${ticket.requester_person} (${ticket.requester_company})</p>
              <p><strong>Origen:</strong> ${ticket.pickup_address}</p>
              <p><strong>Destino:</strong> ${ticket.destination_address}</p>
              <p><strong>Importe Total:</strong> <strong style="font-size: 18px; color: #10B981;">Bs. ${ticket.total_fare.toFixed(2)}</strong></p>
              <p><strong>Forma de Pago:</strong> ${ticket.payment_method === 'Ticket' ? 'TICKET DIGITAL' : (ticket.payment_method || 'EFECTIVO').toUpperCase()}</p>
            </div>

            <p style="text-align: center; margin-top: 24px;">
              <a href="${publicUrl}" style="background-color: #FDDE12; color: #0F172A; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 8px; display: inline-block;">
                Ver Comprobante Digital de Verificación
              </a>
            </p>
          </div>
        `;

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `MotoJAT Comprobantes <${fromEmail}>`,
            to: [targetEmail],
            subject: `Comprobante Digital de Servicio - #${displayCode}`,
            html: htmlContent,
          }),
        });

        const resendBody = await resendRes.json();
        if (resendRes.ok) {
          providerMsgId = resendBody.id;
          deliveryStatus = 'sent';
        } else {
          deliveryStatus = 'failed';
          errorMessage = resendBody.message || 'Error enviado por proveedor Resend API.';
        }
      } catch (err: unknown) {
        deliveryStatus = 'failed';
        errorMessage = (err as Error).message || 'Error de red con proveedor Resend API.';
      }
    } else {
      const allowMock = process.env.ALLOW_MOCK_TICKET_DELIVERY === 'true';
      if (allowMock) {
        providerMsgId = `mock_email_${Date.now()}`;
        deliveryStatus = 'sent';
      } else {
        deliveryStatus = 'failed';
        errorMessage = 'Servicio de correo no configurado (falta RESEND_API_KEY en el servidor).';
      }
    }

    // 3. Log delivery attempt in PostgreSQL ticket_deliveries
    const { data: inserted, error: dbErr } = await supabase
      .from('ticket_deliveries')
      .insert([
        {
          ride_id: ticket.id,
          ticket_id: ticket.corporate_ticket_id || null,
          channel: 'email',
          recipient: targetEmail,
          status: deliveryStatus,
          delivery_key: deliveryKey,
          attempt_count: is_resend ? 2 : 1,
          provider_message_id: providerMsgId,
          error_message: errorMessage,
          sent_at: deliveryStatus === 'sent' ? new Date().toISOString() : null,
          created_by: authData.user.id,
        },
      ])
      .select('id')
      .single();

    if (dbErr) {
      console.error('Error logging email delivery in ticket_deliveries:', dbErr);
    }

    return NextResponse.json({
      success: deliveryStatus === 'sent',
      deliveryId: inserted?.id || null,
      error: errorMessage,
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
