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
    const { ride_id, recipient_phone, is_resend } = body;

    if (!ride_id) {
      return NextResponse.json({ success: false, error: 'Se requiere el ID de la carrera.' }, { status: 400 });
    }

    // 1. Fetch digital ticket details
    const { ticket, error: ticketErr } = await getDigitalTicketByCode(ride_id);
    if (ticketErr || !ticket) {
      return NextResponse.json({ success: false, error: 'Carrera o ticket no encontrado.' }, { status: 404 });
    }

    // 2. Resolve recipient phone
    const targetPhone = recipient_phone || ticket.customer_phone || '+59170000000';
    const deliveryKey = `wa_${ticket.id}_${Date.now()}`;

    const waCloudToken = process.env.WHATSAPP_CLOUD_API_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    let providerMsgId: string | null = null;
    let deliveryStatus: 'sent' | 'failed' = 'sent';
    let errorMessage: string | null = null;

    if (waCloudToken && waPhoneId) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.motojat.com';
        const displayCode = ticket.serviceCode || ticket.ticketCode;
        const publicUrl = `${appUrl}/t/${ticket.rideCode}?token=${ticket.publicToken}`;

        const waEndpoint = `https://graph.facebook.com/v19.0/${waPhoneId}/messages`;
        const waPayload = {
          messaging_product: 'whatsapp',
          to: targetPhone.replace(/\D/g, ''),
          type: 'text',
          text: {
            preview_url: true,
            body: `🏍️ *MOTOSERVI JUSTO A TIEMPO S.R.L.*\n*Comprobante Digital de Servicio*\n\nComprobante: *#${displayCode}*${ticket.corporateTicketCode ? `\nTicket Corporativo: *#${ticket.corporateTicketCode}*` : ''}\nSolicitante: ${ticket.requester_person}\nImporte: *Bs. ${ticket.total_fare.toFixed(2)}*\n\nConsulte el comprobante interactivo de verificación aquí:\n${publicUrl}`,
          },
        };

        const waRes = await fetch(waEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${waCloudToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(waPayload),
        });

        const waBody = await waRes.json();
        if (waRes.ok && waBody.messages?.[0]?.id) {
          providerMsgId = waBody.messages[0].id;
          deliveryStatus = 'sent';
        } else {
          deliveryStatus = 'failed';
          errorMessage = waBody.error?.message || 'Error en respuesta de WhatsApp Cloud API.';
        }
      } catch (err: unknown) {
        deliveryStatus = 'failed';
        errorMessage = (err as Error).message || 'Error de conexión con WhatsApp Cloud API.';
      }
    } else {
      const allowMock = process.env.ALLOW_MOCK_TICKET_DELIVERY === 'true';
      if (allowMock) {
        providerMsgId = `mock_wa_${Date.now()}`;
        deliveryStatus = 'sent';
      } else {
        deliveryStatus = 'failed';
        errorMessage = 'Servicio de WhatsApp no configurado (falta WHATSAPP_API_TOKEN / PHONE_NUMBER_ID en el servidor).';
      }
    }

    // 3. Log delivery attempt in PostgreSQL ticket_deliveries
    const { data: inserted, error: dbErr } = await supabase
      .from('ticket_deliveries')
      .insert([
        {
          ride_id: ticket.id,
          ticket_id: ticket.corporate_ticket_id || null,
          channel: 'whatsapp',
          recipient: targetPhone,
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
      console.error('Error logging WhatsApp delivery in ticket_deliveries:', dbErr);
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
