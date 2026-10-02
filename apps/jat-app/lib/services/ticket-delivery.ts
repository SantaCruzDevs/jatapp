import { createClient } from '@/lib/supabase/client';

export type TicketDeliveryChannel = 'email' | 'whatsapp';
export type TicketDeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface TicketDeliveryLog {
  id: string;
  ride_id: string;
  ticket_id?: string | null;
  channel: TicketDeliveryChannel;
  recipient: string;
  status: TicketDeliveryStatus;
  delivery_key?: string | null;
  attempt_count: number;
  provider_message_id?: string | null;
  error_message?: string | null;
  sent_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetches all delivery audit logs for a specific ride/ticket.
 */
export async function getTicketDeliveries(rideId: string): Promise<{ data: TicketDeliveryLog[] | null; error: Error | null }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('ticket_deliveries')
    .select('*')
    .eq('ride_id', rideId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching ticket delivery logs:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data: (data || []) as TicketDeliveryLog[], error: null };
}

/**
 * Triggers Email delivery for a digital ticket (creates deliberate delivery attempt).
 */
export async function sendTicketEmail(params: {
  ride_id: string;
  recipient_email?: string | null;
  is_resend?: boolean;
}): Promise<{ success: boolean; deliveryId?: string; error: Error | null }> {
  try {
    const res = await fetch('/api/tickets/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      return { success: false, error: new Error(body.error || 'Error al enviar ticket por email.') };
    }

    return { success: true, deliveryId: body.deliveryId, error: null };
  } catch (err: unknown) {
    return { success: false, error: new Error((err as Error).message) };
  }
}

/**
 * Triggers WhatsApp delivery for a digital ticket (creates deliberate delivery attempt).
 */
export async function sendTicketWhatsApp(params: {
  ride_id: string;
  recipient_phone?: string | null;
  is_resend?: boolean;
}): Promise<{ success: boolean; deliveryId?: string; error: Error | null }> {
  try {
    const res = await fetch('/api/tickets/send-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      return { success: false, error: new Error(body.error || 'Error al enviar ticket por WhatsApp.') };
    }

    return { success: true, deliveryId: body.deliveryId, error: null };
  } catch (err: unknown) {
    return { success: false, error: new Error((err as Error).message) };
  }
}
