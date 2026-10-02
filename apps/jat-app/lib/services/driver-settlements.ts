import { createClient } from '@/lib/supabase/client';
import { getJatOperationalWeek } from '@/lib/utils/date-helpers';
import { DriverSettlement, DriverSettlementItem, Ride, PaymentMethod } from '@/types/database.types';

export interface DriverCashSummary {
  driver_id: string;
  period_start: string;
  period_end: string;
  total_rides: number;
  gross_amount: number; // T (Total Facturado)
  driver_share_80: number; // G = T * 0.80 (Mi 80%)
  central_share_20: number; // C = T * 0.20 (20% MotoJAT)
  cash_amount: number; // E (Efectivo Cobrado)
  qr_amount: number; // QR (QR Cobrado)
  ticket_amount: number; // Total Tickets
  ticket_pending_amount: number; // Tickets pendientes de liquidación
  ticket_settled_amount: number; // Tickets liquidados
  net_balance: number; // S = G - E
  result_type: 'motojat_paga' | 'motoquero_rinde' | 'conciliado';
  result_amount: number;
  rides: Ride[];
}

export interface PreSettlementCandidateSummary {
  driver_id: string;
  cutoff_at: string;
  total_rides: number;
  gross_amount: number;
  driver_commission_pct: number;
  driver_base_share: number;
  central_commission_amount: number;
  cash_collected: number;
  qr_collected: number;
  ticket_collected: number;
  gross_net_balance: number;
  rides: Ride[];
}

export interface DriverSettlementWithDetails extends DriverSettlement {
  driver?: {
    id: string;
    movil_number: number;
    vehicle_plate: string;
    profile?: {
      full_name: string;
      phone: string | null;
    } | null;
  } | null;
  settled_by_profile?: {
    full_name: string;
    role: string;
  } | null;
}

/**
 * Computes pre-settlement candidate summary for a driver up to cutoff_at.
 * Filtering condition: status = 'completed' AND is_settled = false AND created_at <= cutoff_at.
 */
export async function getDriverPreSettlementCandidateSummary(
  driverId: string,
  cutoffAt?: string,
  driverCommissionPct: number = 80.00
): Promise<{ summary: PreSettlementCandidateSummary | null; error: Error | null }> {
  const supabase = createClient();
  const cutoffIso = cutoffAt ? new Date(cutoffAt).toISOString() : new Date().toISOString();

  const { data: ridesData, error } = await supabase
    .from('rides')
    .select('*')
    .eq('driver_id', driverId)
    .eq('status', 'completed')
    .eq('is_settled', false)
    .lte('created_at', cutoffIso)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching pre-settlement candidate rides:', error);
    return { summary: null, error: new Error(error.message) };
  }

  const rides = (ridesData || []) as Ride[];
  let gross = 0;
  let cash = 0;
  let qr = 0;
  let ticket = 0;

  rides.forEach((r) => {
    const fare = Number(r.total_fare || 0);
    gross += fare;
    const pm = r.payment_method as PaymentMethod;
    if (pm === 'Efectivo') cash += fare;
    else if (pm === 'QR') qr += fare;
    else if (pm === 'Ticket') ticket += fare;
    else cash += fare;
  });

  const driverBaseShare = Number((gross * (driverCommissionPct / 100)).toFixed(2));
  const centralCommissionAmount = Number((gross - driverBaseShare).toFixed(2));
  const grossNetBalance = Number((driverBaseShare - cash - qr).toFixed(2));

  const summary: PreSettlementCandidateSummary = {
    driver_id: driverId,
    cutoff_at: cutoffIso,
    total_rides: rides.length,
    gross_amount: Number(gross.toFixed(2)),
    driver_commission_pct: driverCommissionPct,
    driver_base_share: driverBaseShare,
    central_commission_amount: centralCommissionAmount,
    cash_collected: Number(cash.toFixed(2)),
    qr_collected: Number(qr.toFixed(2)),
    ticket_collected: Number(ticket.toFixed(2)),
    gross_net_balance: grossNetBalance,
    rides,
  };

  return { summary, error: null };
}

/**
 * Creates a driver settlement atomically using PostgreSQL RPC create_driver_settlement_atomic.
 * If status === 'draft', header is inserted without locking rides or creating items.
 * If status === 'closed', header, snapshot items and ride locks are created atomically.
 */
export async function createDriverSettlementAtomic(params: {
  driver_id: string;
  cutoff_at: string;
  driver_commission_pct?: number;
  bonus_amount?: number;
  discount_amount?: number;
  discount_reason?: string;
  status?: 'draft' | 'closed';
}): Promise<{ settlementId: string | null; error: Error | null }> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('create_driver_settlement_atomic', {
    p_driver_id: params.driver_id,
    p_cutoff_at: params.cutoff_at,
    p_driver_commission_pct: params.driver_commission_pct ?? 80.00,
    p_bonus_amount: params.bonus_amount ?? 0.00,
    p_discount_amount: params.discount_amount ?? 0.00,
    p_discount_reason: params.discount_reason ?? null,
    p_status: params.status ?? 'closed',
  });

  if (error) {
    console.error('Error creating driver settlement atomically:', error);
    return { settlementId: null, error: new Error(error.message) };
  }

  return { settlementId: data as string, error: null };
}

/**
 * Confirms a draft settlement to closed atomically using confirm_draft_settlement_atomic.
 */
export async function confirmDraftSettlementAtomic(
  settlementId: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();

  const { error } = await supabase.rpc('confirm_draft_settlement_atomic', {
    p_settlement_id: settlementId,
  });

  if (error) {
    console.error('Error confirming draft settlement atomically:', error);
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Registers payout for a closed settlement atomically using mark_settlement_as_paid_atomic.
 */
export async function markSettlementAsPaidAtomic(
  settlementId: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();

  const { error } = await supabase.rpc('mark_settlement_as_paid_atomic', {
    p_settlement_id: settlementId,
  });

  if (error) {
    console.error('Error marking settlement as paid:', error);
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Annulls an unpaid settlement and releases locked rides using void_driver_settlement_atomic.
 */
export async function voidDriverSettlementAtomic(
  settlementId: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();

  const { error } = await supabase.rpc('void_driver_settlement_atomic', {
    p_settlement_id: settlementId,
  });

  if (error) {
    console.error('Error voiding driver settlement:', error);
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Legacy summary calculator retained for backward compatibility.
 */
export async function getDriverCashSummary(
  driverId: string,
  periodFilter: string = 'month',
  startDate?: string,
  endDate?: string
): Promise<{ summary: DriverCashSummary | null; error: Error | null }> {
  const supabase = createClient();

  const now = new Date();
  let startIso: string | null = null;
  let endIso: string | null = null;

  if (periodFilter && periodFilter.includes('-') && (periodFilter.length >= 10)) {
    startIso = new Date(periodFilter).toISOString();
    if (startDate) {
      const endD = new Date(startDate);
      if (!startDate.includes('T')) endD.setHours(23, 59, 59, 999);
      endIso = endD.toISOString();
    }
  } else if (periodFilter === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    startIso = start.toISOString();
    endIso = end.toISOString();
  } else if (periodFilter === 'week') {
    const { startOfWeek, endOfWeek } = getJatOperationalWeek(now);
    startIso = startOfWeek.toISOString();
    endIso = endOfWeek.toISOString();
  } else if (periodFilter === 'month') {
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    startIso = startMonth.toISOString();
    endIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
  } else if (periodFilter === 'last_month') {
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    startIso = startLastMonth.toISOString();
    endIso = endLastMonth.toISOString();
  } else if (periodFilter === 'three_months' || periodFilter === 'last_3_months') {
    const cutoff = new Date();
    cutoff.setMonth(now.getMonth() - 3);
    cutoff.setHours(0, 0, 0, 0);
    startIso = cutoff.toISOString();
    endIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
  } else if (periodFilter === 'all') {
    startIso = null;
    endIso = null;
  } else if (periodFilter === 'custom') {
    if (startDate) startIso = new Date(startDate).toISOString();
    if (endDate) {
      const endD = new Date(endDate);
      endD.setHours(23, 59, 59, 999);
      endIso = endD.toISOString();
    }
  }

  let query = supabase
    .from('rides')
    .select('*')
    .eq('driver_id', driverId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false });

  if (startIso) query = query.gte('created_at', startIso);
  if (endIso) query = query.lte('created_at', endIso);

  const { data: ridesData, error } = await query;
  if (error) {
    console.error('Error fetching driver cash summary rides:', error);
    return { summary: null, error: new Error(error.message) };
  }

  const rides = (ridesData || []) as Ride[];
  const { data: corporateTickets } = await supabase.from('corporate_tickets').select('ride_id, status');

  const settledRideIds = new Set<string>();
  if (corporateTickets) {
    corporateTickets.forEach((ct) => {
      if (ct.status === 'settled') settledRideIds.add(ct.ride_id);
    });
  }

  let gross = 0;
  let cash = 0;
  let qr = 0;
  let ticket = 0;
  let ticketPending = 0;
  let ticketSettled = 0;

  rides.forEach((r) => {
    const fare = Number(r.total_fare || 0);
    gross += fare;
    const pm = r.payment_method as PaymentMethod;
    if (pm === 'Efectivo') cash += fare;
    else if (pm === 'QR') qr += fare;
    else if (pm === 'Ticket') {
      ticket += fare;
      if (settledRideIds.has(r.id)) ticketSettled += fare;
      else ticketPending += fare;
    } else cash += fare;
  });

  const driver80 = Number((gross * 0.80).toFixed(2));
  const central20 = Number((gross * 0.20).toFixed(2));
  const netBalance = Number((driver80 - cash - qr).toFixed(2));

  let resultType: 'motojat_paga' | 'motoquero_rinde' | 'conciliado' = 'conciliado';
  if (netBalance > 0.009) resultType = 'motojat_paga';
  else if (netBalance < -0.009) resultType = 'motoquero_rinde';

  const summary: DriverCashSummary = {
    driver_id: driverId,
    period_start: startIso || new Date(0).toISOString(),
    period_end: endIso || new Date().toISOString(),
    total_rides: rides.length,
    gross_amount: gross,
    driver_share_80: driver80,
    central_share_20: central20,
    cash_amount: cash,
    qr_amount: qr,
    ticket_amount: ticket,
    ticket_pending_amount: ticketPending,
    ticket_settled_amount: ticketSettled,
    net_balance: netBalance,
    result_type: resultType,
    result_amount: Math.abs(netBalance),
    rides,
  };

  return { summary, error: null };
}

/**
 * Fetches all driver settlements with driver and profile joins.
 */
export async function getDriverSettlements(
  driverId?: string
): Promise<{ data: DriverSettlementWithDetails[] | null; error: Error | null }> {
  const supabase = createClient();

  let query = supabase
    .from('driver_settlements')
    .select(`
      *,
      driver:drivers (
        id,
        movil_number,
        vehicle_plate,
        profile:profiles (
          full_name,
          phone
        )
      ),
      settled_by_profile:profiles!driver_settlements_settled_by_fkey (
        full_name,
        role
      )
    `)
    .order('created_at', { ascending: false });

  if (driverId) {
    query = query.eq('driver_id', driverId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching driver settlements:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as DriverSettlementWithDetails[], error: null };
}

/**
 * Legacy create driver settlement.
 */
export async function createDriverSettlement(params: {
  driver_id: string;
  period_start: string;
  period_end: string;
  status?: 'draft' | 'completed';
}): Promise<{ settlement: DriverSettlement | null; error: Error | null }> {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id || null;

  const { summary, error: summaryErr } = await getDriverCashSummary(
    params.driver_id,
    params.period_start,
    params.period_end
  );

  if (summaryErr || !summary) {
    return { settlement: null, error: summaryErr || new Error('No se pudo calcular la liquidación.') };
  }

  const insertPayload = {
    driver_id: params.driver_id,
    period_start: summary.period_start,
    period_end: summary.period_end,
    total_rides: summary.total_rides,
    gross_amount: summary.gross_amount,
    central_commission_pct: 20.00,
    central_commission_amount: summary.central_share_20,
    driver_payout_amount: summary.driver_share_80,
    status: params.status || 'draft',
    settled_by: userId,
  };

  const { data: newSettlement, error } = await supabase
    .from('driver_settlements')
    .insert([insertPayload])
    .select()
    .single();

  if (error) {
    console.error('Error creating driver settlement:', error);
    return { settlement: null, error: new Error(error.message) };
  }

  if (params.status === 'completed' && newSettlement) {
    const rideIds = summary.rides.map((r) => r.id);
    if (rideIds.length > 0) {
      await supabase
        .from('corporate_tickets')
        .update({
          status: 'settled',
          settlement_id: newSettlement.id,
          updated_at: new Date().toISOString(),
        })
        .in('ride_id', rideIds);
    }
  }

  return { settlement: newSettlement as DriverSettlement, error: null };
}

/**
 * Legacy update settlement status.
 */
export async function updateSettlementStatus(
  settlementId: string,
  newStatus: 'completed' | 'voided'
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id || null;

  const { error } = await supabase
    .from('driver_settlements')
    .update({
      status: newStatus,
      settled_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', settlementId);

  if (error) {
    console.error('Error updating settlement status:', error);
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Fetches all snapshot settlement items for a given driver settlement.
 */
export async function getSettlementItemsBySettlementId(
  settlementId: string
): Promise<{ data: DriverSettlementItem[] | null; error: Error | null }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('driver_settlement_items')
    .select('*')
    .eq('settlement_id', settlementId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching settlement items:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as DriverSettlementItem[], error: null };
}

