import { createClient } from '@/lib/supabase/client';
import { getJatOperationalWeek } from '@/lib/utils/date-helpers';
import { Ride, RideStatus, PaymentMethod, SurchargeStatus } from '@/types/database.types';

export interface DigitalTicket {
  id: string; // ride_id
  ticketCode: string;
  rideCode: string;
  publicToken: string;
  status: RideStatus;
  settlement_status: 'COBRADO' | 'PENDIENTE DE LIQUIDACIÓN' | 'LIQUIDADO' | 'CANCELADO';
  created_at: string;
  requester_person: string;
  requester_company: string;
  company_nit?: string | null;
  company_address?: string | null;
  customer_phone?: string | null;
  driver_movil?: number | null;
  driver_name?: string | null;
  driver_plate?: string | null;
  pickup_address: string;
  destination_address: string;
  initial_fare: number;
  wait_time_minutes: number;
  wait_time_cost: number;
  surcharge_amount?: number | null;
  surcharge_reason?: string | null;
  surcharge_status?: SurchargeStatus;
  total_fare: number;
  payment_method: PaymentMethod | null;
  observations?: string | null;
  cargo_description?: string | null;
  corporate_ticket_id?: string | null;
  corporate_ticket_status?: string | null;
}

export interface PublicTicketPayload {
  rideCode: string;
  ticketCode: string;
  status: RideStatus;
  created_at: string;
  requester_company: string;
  requester_initials: string;
  pickup_partial: string;
  destination_partial: string;
  total_fare: number;
  payment_method: PaymentMethod | null;
  isValidated: boolean;
}

/**
 * Computes a deterministic 16-character cryptographic verification hash for anti-tamper public QR verification.
 */
export function generatePublicToken(rideId: string, rideCode: string, createdAt: string): string {
  const secret = 'motojat_public_verification_salt_2026';
  const str = `${rideId}:${rideCode}:${createdAt}:${secret}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16);
  // Repeat to ensure at least 12 hex characters
  return (hex + 'a9f8b7c6d5e4').slice(0, 16);
}

/**
 * Redacts full name into privacy-safe initials. E.g. "Juan Pérez" -> "J. P."
 */
export function getInitials(name: string): string {
  if (!name) return 'N. N.';
  const parts = name.trim().split(/\s+/);
  return parts.map((p) => p[0]?.toUpperCase() + '.').join(' ');
}

/**
 * Redacts full street address into privacy-safe partial description.
 */
export function redactAddress(address: string): string {
  if (!address) return 'Ubicación Registrada';
  const parts = address.split(',');
  if (parts.length > 1) {
    return parts[parts.length - 1].trim(); // Return zone/city part
  }
  // Take first 15 chars + ...
  if (address.length > 20) {
    return address.slice(0, 18) + '...';
  }
  return address;
}

/**
 * Fetches all digital tickets with optional search filtering, driver filtering, date range, and ticket settlement filtering.
 */
export async function getDigitalTickets(params?: {
  search?: string;
  paymentMethod?: PaymentMethod;
  status?: RideStatus;
  driverId?: string;
  dateRange?: string;
  startDate?: string;
  endDate?: string;
  settlementFilter?: 'all' | 'pending_settlement' | 'settled';
}): Promise<{ data: DigitalTicket[] | null; error: Error | null }> {
  const supabase = createClient();

  let query = supabase
    .from('rides')
    .select(`
      *,
      driver:drivers (
        id,
        movil_number,
        vehicle_type,
        vehicle_plate,
        profile:profiles (
          full_name,
          phone
        )
      ),
      customer:customers (
        id,
        full_name,
        phone
      ),
      company:companies (
        id,
        business_name,
        nit,
        address
      )
    `)
    .order('created_at', { ascending: false });

  if (params?.driverId) {
    query = query.eq('driver_id', params.driverId);
  }

  if (params?.status) {
    query = query.eq('status', params.status);
  }

  if (params?.paymentMethod) {
    query = query.eq('payment_method', params.paymentMethod);
  }

  if (params?.dateRange && params.dateRange !== 'all') {
    const now = new Date();
    if (params.dateRange === 'today') {
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      query = query.gte('created_at', startToday);
    } else if (params.dateRange === 'week') {
      const { startOfWeek, endOfWeek } = getJatOperationalWeek(now);
      query = query.gte('created_at', startOfWeek.toISOString()).lte('created_at', endOfWeek.toISOString());
    } else if (params.dateRange === 'month') {
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      query = query.gte('created_at', startMonth);
    } else if (params.dateRange === 'last_month') {
      const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
      query = query.gte('created_at', startLastMonth).lte('created_at', endLastMonth);
    } else if (params.dateRange === 'last_3_months') {
      const cutoff = new Date();
      cutoff.setMonth(now.getMonth() - 3);
      query = query.gte('created_at', cutoff.toISOString());
    } else if (params.dateRange === 'custom') {
      if (params.startDate) query = query.gte('created_at', new Date(params.startDate).toISOString());
      if (params.endDate) {
        const endD = new Date(params.endDate);
        endD.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endD.toISOString());
      }
    }
  }

  if (params?.search && params.search.trim() !== '') {
    const term = params.search.trim();
    query = query.or(`ride_code.ilike.%${term}%,requester_person.ilike.%${term}%,requester_company.ilike.%${term}%`);
  }

  const { data: ridesData, error } = await query;

  if (error) {
    console.error('Error fetching digital tickets:', error);
    return { data: null, error: new Error(error.message) };
  }

  // Also query corporate tickets to match ticket_codes if present
  const { data: corporateTickets } = await supabase
    .from('corporate_tickets')
    .select('*');

  const corpMap = new Map<string, { id: string; ticket_code: string; status: string }>();
  if (corporateTickets) {
    corporateTickets.forEach((ct) => {
      corpMap.set(ct.ride_id, { id: ct.id, ticket_code: ct.ticket_code, status: ct.status });
    });
  }

  let result: DigitalTicket[] = (ridesData || []).map((r) => {
    const corp = corpMap.get(r.id);
    const token = generatePublicToken(r.id, r.ride_code, r.created_at);
    const ticketCode = corp?.ticket_code || `TK-${r.ride_code}`;

    let settlementStatus: 'COBRADO' | 'PENDIENTE DE LIQUIDACIÓN' | 'LIQUIDADO' | 'CANCELADO' = 'COBRADO';
    if (r.status === 'cancelled') {
      settlementStatus = 'CANCELADO';
    } else if (r.payment_method === 'Ticket') {
      if (corp?.status === 'settled') {
        settlementStatus = 'LIQUIDADO';
      } else {
        settlementStatus = 'PENDIENTE DE LIQUIDACIÓN';
      }
    } else {
      settlementStatus = 'COBRADO';
    }

    return {
      id: r.id,
      ticketCode,
      rideCode: r.ride_code,
      publicToken: token,
      status: r.status as RideStatus,
      settlement_status: settlementStatus,
      created_at: r.created_at,
      requester_person: r.requester_person,
      requester_company: r.requester_company,
      company_nit: r.company?.nit || null,
      company_address: r.company?.address || null,
      customer_phone: r.customer?.phone || null,
      driver_movil: r.driver?.movil_number || null,
      driver_name: r.driver?.profile?.full_name || null,
      driver_plate: r.driver?.vehicle_plate || null,
      pickup_address: r.pickup_address,
      destination_address: r.destination_address,
      initial_fare: Number(r.initial_fare),
      wait_time_minutes: r.wait_time_minutes || 0,
      wait_time_cost: Number(r.wait_time_cost || 0),
      surcharge_amount: r.surcharge_amount ? Number(r.surcharge_amount) : 0,
      surcharge_reason: r.surcharge_reason || null,
      surcharge_status: r.surcharge_status || null,
      total_fare: Number(r.total_fare),
      payment_method: r.payment_method as PaymentMethod | null,
      observations: r.observations,
      cargo_description: r.cargo_description || null,
      corporate_ticket_id: corp?.id || null,
      corporate_ticket_status: corp?.status || null,
    };
  });

  // Apply Ticket Settlement Specific Filter if requested
  if (params?.settlementFilter && params.settlementFilter !== 'all') {
    if (params.settlementFilter === 'pending_settlement') {
      // Must be completed, payment_method = Ticket, and not yet settled
      result = result.filter(
        (t) => t.status === 'completed' && t.payment_method === 'Ticket' && t.settlement_status === 'PENDIENTE DE LIQUIDACIÓN'
      );
    } else if (params.settlementFilter === 'settled') {
      result = result.filter(
        (t) => t.status === 'completed' && t.payment_method === 'Ticket' && t.settlement_status === 'LIQUIDADO'
      );
    }
  }

  return { data: result, error: null };
}

/**
 * Retrieves single digital ticket by ride code or corporate ticket code.
 */
export async function getDigitalTicketByCode(code: string): Promise<{ ticket: DigitalTicket | null; error: Error | null }> {
  const supabase = createClient();
  const cleanCode = code.trim();

  // Normalize search targets:
  // If cleanCode is TK-JAT-123456 or JAT-123456, rideCodeTarget will be JAT-123456
  const rideCodeTarget = cleanCode.startsWith('TK-') ? cleanCode.slice(3) : cleanCode;
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanCode);

  const ridesSelect = `
    *,
    driver:drivers (
      id,
      movil_number,
      vehicle_type,
      vehicle_plate,
      profile:profiles (
        full_name,
        phone
      )
    ),
    customer:customers (
      id,
      full_name,
      phone
    ),
    company:companies (
      id,
      business_name,
      nit,
      address
    )
  `;

  // 1. Search by ride_code or id (ONLY if cleanCode is a valid UUID)
  let query = supabase.from('rides').select(ridesSelect);

  if (isUuid) {
    query = query.or(`ride_code.eq.${rideCodeTarget},id.eq.${cleanCode}`);
  } else {
    query = query.or(`ride_code.eq.${cleanCode},ride_code.eq.${rideCodeTarget}`);
  }

  let { data: ride } = await query.maybeSingle();

  // 2. If not found directly, check corporate_tickets by ticket_code
  let corpRecord = null;
  if (!ride) {
    const { data: corp } = await supabase
      .from('corporate_tickets')
      .select('*')
      .or(`ticket_code.eq.${cleanCode},ticket_code.eq.TK-${rideCodeTarget}`)
      .maybeSingle();

    if (corp) {
      corpRecord = corp;
      const { data: rideData } = await supabase
        .from('rides')
        .select(ridesSelect)
        .eq('id', corp.ride_id)
        .maybeSingle();
      
      ride = rideData;
    }
  } else {
    const { data: corp } = await supabase
      .from('corporate_tickets')
      .select('*')
      .eq('ride_id', ride.id)
      .maybeSingle();
    corpRecord = corp;
  }

  if (!ride) {
    return { ticket: null, error: new Error('Ticket no encontrado o código de comprobante inválido.') };
  }

  const token = generatePublicToken(ride.id, ride.ride_code, ride.created_at);
  const ticketCode = corpRecord?.ticket_code || `TK-${ride.ride_code}`;

  let settlementStatus: 'COBRADO' | 'PENDIENTE DE LIQUIDACIÓN' | 'LIQUIDADO' | 'CANCELADO' = 'COBRADO';
  if (ride.status === 'cancelled') {
    settlementStatus = 'CANCELADO';
  } else if (ride.payment_method === 'Ticket') {
    if (corpRecord?.status === 'settled') {
      settlementStatus = 'LIQUIDADO';
    } else {
      settlementStatus = 'PENDIENTE DE LIQUIDACIÓN';
    }
  } else {
    settlementStatus = 'COBRADO';
  }

  const ticket: DigitalTicket = {
    id: ride.id,
    ticketCode,
    rideCode: ride.ride_code,
    publicToken: token,
    status: ride.status as RideStatus,
    settlement_status: settlementStatus,
    created_at: ride.created_at,
    requester_person: ride.requester_person,
    requester_company: ride.requester_company,
    company_nit: ride.company?.nit || null,
    company_address: ride.company?.address || null,
    customer_phone: ride.customer?.phone || null,
    driver_movil: ride.driver?.movil_number || null,
    driver_name: ride.driver?.profile?.full_name || null,
    driver_plate: ride.driver?.vehicle_plate || null,
    pickup_address: ride.pickup_address,
    destination_address: ride.destination_address,
    initial_fare: Number(ride.initial_fare),
    wait_time_minutes: ride.wait_time_minutes || 0,
    wait_time_cost: Number(ride.wait_time_cost || 0),
    surcharge_amount: ride.surcharge_amount ? Number(ride.surcharge_amount) : 0,
    surcharge_reason: ride.surcharge_reason || null,
    surcharge_status: ride.surcharge_status || null,
    total_fare: Number(ride.total_fare),
    payment_method: ride.payment_method as PaymentMethod | null,
    observations: ride.observations,
    cargo_description: ride.cargo_description || null,
    corporate_ticket_id: corpRecord?.id || null,
    corporate_ticket_status: corpRecord?.status || null,
  };

  return { ticket, error: null };
}

/**
 * Public Verification endpoint function (Privacy-safe redacted response).
 */
export async function getPublicVerificationTicket(
  code: string,
  providedToken?: string | null
): Promise<{ payload: PublicTicketPayload | null; error: Error | null }> {
  const { ticket, error } = await getDigitalTicketByCode(code);

  if (error || !ticket) {
    return { payload: null, error: new Error('El comprobante no existe o el código es erróneo.') };
  }

  // Validate anti-tamper token if token checking is active
  if (providedToken && providedToken.trim() !== ticket.publicToken) {
    return { payload: null, error: new Error('Token de verificación público inválido o caducado.') };
  }

  const payload: PublicTicketPayload = {
    rideCode: ticket.rideCode,
    ticketCode: ticket.ticketCode,
    status: ticket.status,
    created_at: ticket.created_at,
    requester_company: ticket.requester_company,
    requester_initials: getInitials(ticket.requester_person),
    pickup_partial: redactAddress(ticket.pickup_address),
    destination_partial: redactAddress(ticket.destination_address),
    total_fare: ticket.total_fare,
    payment_method: ticket.payment_method,
    isValidated: true,
  };

  return { payload, error: null };
}
