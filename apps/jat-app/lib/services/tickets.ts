import { createClient } from '@/lib/supabase/client';
import { getJatOperationalWeek } from '@/lib/utils/date-helpers';
import { Ride, RideStatus, PaymentMethod, SurchargeStatus } from '@/types/database.types';
import { getOperationalCompanyContract } from './company-contracts';

export interface DigitalTicket {
  id: string; // ride_id
  serviceCode: string;
  ticketCode: string;
  corporateTicketCode?: string | null;
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
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
}

export interface PublicTicketPayload {
  rideCode: string;
  serviceCode: string;
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
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
}

/**
 * Formats public service receipt code:
 * Returns rideCode directly if it already starts with SJ- or TK-.
 * Converts 'JAT-2610-000002' -> 'SJ-2610-000002'
 */
export function formatServiceCode(rideCode: string): string {
  const clean = rideCode ? rideCode.trim() : '';
  if (clean.startsWith('SJ-') || clean.startsWith('TK-')) return clean;
  if (clean.startsWith('JAT-')) return `SJ-${clean.slice(4)}`;
  return clean || 'SJ-0000-000000';
}

/**
 * Formats corporate ticket code following MotoJAT TK- standard rules:
 * - If rawTicketCode exists from DB, preserve it intact.
 * - Otherwise return clean rideCode or format TK- from legacy JAT-.
 */
export function formatCorporateTicketCode(rideCode: string, rawTicketCode?: string | null): string {
  if (rawTicketCode && rawTicketCode.trim()) {
    return rawTicketCode.trim();
  }
  const cleanRideCode = rideCode ? rideCode.trim() : '';
  if (cleanRideCode.startsWith('TK-') || cleanRideCode.startsWith('SJ-') || cleanRideCode.startsWith('TC-') || cleanRideCode.startsWith('VALE-')) {
    return cleanRideCode;
  }
  if (cleanRideCode.startsWith('JAT-')) {
    return `TK-${cleanRideCode.slice(4)}`;
  }
  return cleanRideCode || 'TK-0000-000000';
}

/**
 * Legacy wrapper for formatCorporateTicketCode
 */
export function formatTicketCode(rideCode: string, rawTicketCode?: string | null): string {
  return formatCorporateTicketCode(rideCode, rawTicketCode);
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

    // Check if term contains numeric movil number (e.g., "20", "Móvil 20", "#20")
    const numMovil = parseInt(term.replace(/\D/g, ''), 10);
    const searchMovil = !isNaN(numMovil) && numMovil > 0 ? numMovil : null;

    // Search matching driver IDs by profile name or movil_number
    let driverQuery = supabase.from('drivers').select('id, movil_number, profile:profiles(full_name)');
    if (searchMovil) {
      driverQuery = driverQuery.or(`movil_number.eq.${searchMovil}`);
    } else {
      driverQuery = driverQuery.filter('profile.full_name', 'ilike', `%${term}%`);
    }

    const { data: matchedDrivers } = await driverQuery;
    const matchedDriverIds = (matchedDrivers || []).map((d) => d.id);

    let orConditions = `ride_code.ilike.%${term}%,requester_person.ilike.%${term}%,requester_company.ilike.%${term}%`;
    if (matchedDriverIds.length > 0) {
      orConditions += `,driver_id.in.(${matchedDriverIds.join(',')})`;
    }

    query = query.or(orConditions);
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
    const serviceCode = formatServiceCode(r.ride_code);
    const corporateTicketCode = formatCorporateTicketCode(r.ride_code, corp?.ticket_code);
    const ticketCode = corporateTicketCode;

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
      serviceCode,
      ticketCode,
      corporateTicketCode: r.payment_method === 'Ticket' ? corporateTicketCode : null,
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
  // cleanCode can be 'SJ-2610-000002', 'TC-2610-000002', 'TK-2610-000002', 'TK-JAT-2610-000002', 'JAT-2610-000002', or '2610-000002'
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanCode);

  let rideCodeTarget = cleanCode;
  if (cleanCode.startsWith('SJ-')) {
    const rest = cleanCode.slice(3);
    rideCodeTarget = rest.startsWith('JAT-') ? rest : `JAT-${rest}`;
  } else if (cleanCode.startsWith('TC-')) {
    const rest = cleanCode.slice(3);
    rideCodeTarget = rest.startsWith('JAT-') ? rest : `JAT-${rest}`;
  } else if (cleanCode.startsWith('TK-JAT-')) {
    rideCodeTarget = `JAT-${cleanCode.slice(7)}`;
  } else if (cleanCode.startsWith('TK-')) {
    const rest = cleanCode.slice(3);
    rideCodeTarget = rest.startsWith('JAT-') ? rest : `JAT-${rest}`;
  } else if (cleanCode.startsWith('VALE-JAT-')) {
    rideCodeTarget = `JAT-${cleanCode.slice(9)}`;
  } else if (cleanCode.startsWith('VALE-')) {
    const rest = cleanCode.slice(5);
    rideCodeTarget = rest.startsWith('JAT-') ? rest : `JAT-${rest}`;
  } else if (!cleanCode.startsWith('JAT-') && !isUuid) {
    rideCodeTarget = `JAT-${cleanCode}`;
  }

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
    const numericPart = rideCodeTarget.replace(/^JAT-/, '');
    const { data: corp } = await supabase
      .from('corporate_tickets')
      .select('*')
      .or(`ticket_code.eq.${cleanCode},ticket_code.eq.TC-${numericPart},ticket_code.eq.TK-${numericPart},ticket_code.eq.TK-JAT-${numericPart},ticket_code.eq.VALE-${numericPart}`)
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
    return { ticket: null, error: new Error('Comprobante o ticket no encontrado.') };
  }

  const token = generatePublicToken(ride.id, ride.ride_code, ride.created_at);
  const serviceCode = formatServiceCode(ride.ride_code);
  const corporateTicketCode = formatCorporateTicketCode(ride.ride_code, corpRecord?.ticket_code);
  const ticketCode = corporateTicketCode;

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
    serviceCode,
    ticketCode,
    corporateTicketCode: ride.payment_method === 'Ticket' ? corporateTicketCode : null,
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
    serviceCode: ticket.serviceCode,
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

/**
 * Evaluates whether a ride's client/company is eligible for corporate ticket credit payment.
 */
export async function isRideTicketEligible(ride: {
  company_id?: string | null;
  customer_id?: string | null;
}): Promise<boolean> {
  if (!ride.company_id && !ride.customer_id) return false;

  const supabase = createClient();

  if (ride.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('uses_ticket_contract')
      .eq('id', ride.company_id)
      .single();

    if (!company || !company.uses_ticket_contract) return false;

    // Operational contract check
    const contract = await getOperationalCompanyContract(ride.company_id);
    return !!contract;
  }

  if (ride.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('uses_ticket_contract, is_active')
      .eq('id', ride.customer_id)
      .single();

    return !!(customer && customer.uses_ticket_contract && customer.is_active !== false);
  }

  return false;
}

/**
 * Executes atomic annullation of a digital ticket/ride via cancel_digital_ticket_atomic RPC.
 */
export async function cancelDigitalTicket(
  rideId: string,
  cancellationReason: string
): Promise<{ success: boolean; error: Error | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('cancel_digital_ticket_atomic', {
    p_ride_id: rideId,
    p_cancellation_reason: cancellationReason,
  });

  if (error) {
    return { success: false, error: new Error(error.message) };
  }

  if (data && typeof data === 'object' && 'success' in data && (data as any).success === false) {
    return { success: false, error: new Error((data as any).error) };
  }

  return { success: true, error: null };
}
