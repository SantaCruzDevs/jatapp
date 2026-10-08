import { createClient } from '@/lib/supabase/client';
import { Ride, RideStatus, RidePriority, PaymentMethod } from '@/types/database.types';
import { addTimelineEvent } from './ride-timeline';
import { updateDriverStatus } from './drivers';

export interface RideWithDetails extends Ride {
  assigned_at?: string | null;
  driver?: {
    id: string;
    movil_number: number;
    vehicle_type: string;
    vehicle_plate: string;
    profile?: {
      full_name: string;
      phone: string | null;
    } | null;
  } | null;
  customer?: {
    id: string;
    full_name: string;
    phone: string;
  } | null;
  company?: {
    id: string;
    business_name: string;
  } | null;
}

/**
 * Valid state transitions for the MotoJAT dispatch machine.
 */
const VALID_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  pending: ['assigned', 'cancelled'],
  assigned: ['ontheway', 'cancelled'],
  ontheway: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Retrieves all rides with full joins (driver, customer, company), ordered by newest first.
 * Attaches the exact immutable timeline assignment timestamp (assigned_at).
 */
export async function getRides(filters?: { status?: RideStatus; search?: string }): Promise<{ data: RideWithDetails[] | null; error: Error | null }> {
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
        business_name
      )
    `)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.search && filters.search.trim() !== '') {
    const term = filters.search.trim();

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

    let orConditions = `ride_code.ilike.%${term}%,requester_person.ilike.%${term}%,requester_company.ilike.%${term}%,pickup_address.ilike.%${term}%,destination_address.ilike.%${term}%`;
    if (matchedDriverIds.length > 0) {
      orConditions += `,driver_id.in.(${matchedDriverIds.join(',')})`;
    }

    query = query.or(orConditions);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching rides:', error);
    return { data: null, error: new Error(error.message) };
  }

  if (data && data.length > 0) {
    const rideIds = data.map((r) => r.id);
    const { data: timelineData } = await supabase
      .from('ride_timeline')
      .select('ride_id, created_at')
      .eq('status_to', 'assigned')
      .in('ride_id', rideIds);

    const assignedAtMap: Record<string, string> = {};
    if (timelineData) {
      timelineData.forEach((t) => {
        if (!assignedAtMap[t.ride_id] || new Date(t.created_at) < new Date(assignedAtMap[t.ride_id])) {
          assignedAtMap[t.ride_id] = t.created_at;
        }
      });
    }

    const enhanced = data.map((r) => ({
      ...r,
      assigned_at: (r as { assigned_at?: string }).assigned_at || assignedAtMap[r.id] || r.updated_at,
    }));

    return { data: enhanced as RideWithDetails[], error: null };
  }

  return { data: data as RideWithDetails[], error: null };
}

/**
 * Creates a new express ride service request in public.rides and records timeline creation event.
 */
export async function createRide(params: {
  customer_id?: string | null;
  company_id?: string | null;
  requester_company: string;
  requester_person: string;
  pickup_address: string;
  destination_address: string;
  initial_fare: number;
  wait_time_minutes?: number;
  wait_time_cost?: number;
  total_fare: number;
  priority?: RidePriority;
  payment_method: PaymentMethod;
  observations?: string | null;
  cargo_description?: string | null;
}): Promise<{ ride: Ride | null; error: Error | null }> {
  const supabase = createClient();

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id || null;

  // Fetch official atomic server-side ride code from PostgreSQL (JAT-YYMM-NNNNNN)
  const { data: serverRideCode, error: rpcError } = await supabase.rpc('generate_next_ride_code');
  if (rpcError) {
    console.error('Error generating official ride code from PostgreSQL:', rpcError);
  }

  const ridePayload = {
    ride_code: serverRideCode || undefined,
    customer_id: params.customer_id || null,
    company_id: params.company_id || null,
    requester_company: params.requester_company.trim() || 'Particular',
    requester_person: params.requester_person.trim(),
    pickup_address: params.pickup_address.trim(),
    destination_address: params.destination_address.trim(),
    initial_fare: params.initial_fare,
    wait_time_minutes: params.wait_time_minutes || 0,
    wait_time_cost: params.wait_time_cost || 0.00,
    total_fare: params.total_fare,
    status: 'pending' as RideStatus,
    priority: params.priority || 'high',
    driver_id: null,
    payment_method: params.payment_method,
    observations: params.observations?.trim() || null,
    cargo_description: params.cargo_description?.trim() || null,
    created_by: userId,
  };

  const { data: newRide, error } = await supabase
    .from('rides')
    .insert([ridePayload])
    .select()
    .single();

  if (error) {
    console.error('Error creating ride:', error);
    return { ride: null, error: new Error(error.message) };
  }

  // Audit timeline entry
  await addTimelineEvent({
    ride_id: newRide.id,
    status_from: null,
    status_to: 'pending',
    event_title: 'Carrera Creada',
    event_description: `Solicitud ${newRide.ride_code} registrada para ${params.requester_person} (${params.requester_company})`,
    actor_id: userId,
  });

  return { ride: newRide as Ride, error: null };
}

/**
 * Assigns a driver to a pending ride, updates ride status to 'assigned', and logs timeline audit atomically.
 */
export async function assignDriverToRide(
  rideId: string,
  driverId: string,
  _driverMovil?: number
): Promise<{ error: Error | null }> {
  const supabase = createClient();

  const { data, error: rpcErr } = await supabase.rpc('assign_ride_driver_atomic', {
    p_ride_id: rideId,
    p_driver_id: driverId,
  });

  if (rpcErr) {
    console.error('Error in assign_ride_driver_atomic RPC:', rpcErr);
    return { error: new Error(rpcErr.message) };
  }

  const result = data as { success: boolean; error?: string; message?: string };
  if (!result || !result.success) {
    return { error: new Error(result?.error || 'No se pudo asignar la carrera.') };
  }

  return { error: null };
}

/**
 * Updates ride status adhering to strict state machine rules and logs timeline audit.
 */
export async function updateRideStatus(
  rideId: string,
  newStatus: RideStatus,
  reason?: string,
  _driverIdToRelease?: string | null,
  paymentMethod?: PaymentMethod
): Promise<{ error: Error | null }> {
  const supabase = createClient();

  const { data, error: rpcErr } = await supabase.rpc('update_ride_status_atomic', {
    p_ride_id: rideId,
    p_new_status: newStatus,
    p_payment_method: paymentMethod || null,
    p_reason: reason || null,
  });

  if (rpcErr) {
    console.error('Error in update_ride_status_atomic RPC:', rpcErr);
    return { error: new Error(rpcErr.message) };
  }

  const result = data as { success?: boolean; error?: string } | null;

  if (result && result.success === false) {
    return { error: new Error(result.error || 'No se pudo actualizar la carrera.') };
  }

  return { error: null };
}

/**
 * Driver requests a surcharge for an active ride. Sets surcharge_status to 'pending'.
 */
export async function requestSurcharge(
  rideId: string,
  amount: number,
  reason: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id || null;

  if (!amount || amount <= 0) {
    return { error: new Error('El monto del sobrecargo debe ser mayor a 0.') };
  }
  if (!reason || reason.trim() === '') {
    return { error: new Error('Debe especificar un motivo para el sobrecargo.') };
  }

  const { data: currentRide, error: fetchErr } = await supabase
    .from('rides')
    .select('status, surcharge_status')
    .eq('id', rideId)
    .single();

  if (fetchErr || !currentRide) {
    return { error: new Error('La carrera no existe.') };
  }

  if (currentRide.status === 'completed' || currentRide.status === 'cancelled') {
    return { error: new Error('No se puede solicitar sobrecargo en una carrera finalizada o cancelada.') };
  }

  const { error: updateErr } = await supabase
    .from('rides')
    .update({
      surcharge_amount: amount,
      surcharge_reason: reason.trim(),
      surcharge_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', rideId);

  if (updateErr) {
    console.error('Error requesting surcharge:', updateErr);
    return { error: new Error(updateErr.message) };
  }

  await addTimelineEvent({
    ride_id: rideId,
    status_from: currentRide.status,
    status_to: currentRide.status,
    event_title: 'Sobrecargo Solicitado',
    event_description: `Solicitado sobrecargo de Bs. ${amount.toFixed(2)} — Motivo: ${reason.trim()}`,
    actor_id: userId,
  });

  return { error: null };
}

/**
 * Operator approves a pending surcharge. Updates total_fare to incorporate surcharge_amount.
 */
export async function approveSurcharge(rideId: string): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id || null;

  const { data: currentRide, error: fetchErr } = await supabase
    .from('rides')
    .select('status, initial_fare, wait_time_cost, surcharge_amount, surcharge_status')
    .eq('id', rideId)
    .single();

  if (fetchErr || !currentRide) {
    return { error: new Error('La carrera no existe.') };
  }

  if (currentRide.surcharge_status !== 'pending') {
    return { error: new Error('La carrera no tiene un sobrecargo pendiente de aprobación.') };
  }

  const surchargeAmount = Number(currentRide.surcharge_amount || 0);
  const initialFare = Number(currentRide.initial_fare || 0);
  const waitTimeCost = Number(currentRide.wait_time_cost || 0);
  const newTotalFare = initialFare + waitTimeCost + surchargeAmount;

  const { error: updateErr } = await supabase
    .from('rides')
    .update({
      surcharge_status: 'approved',
      total_fare: newTotalFare,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rideId);

  if (updateErr) {
    console.error('Error approving surcharge:', updateErr);
    return { error: new Error(updateErr.message) };
  }

  await addTimelineEvent({
    ride_id: rideId,
    status_from: currentRide.status,
    status_to: currentRide.status,
    event_title: 'Sobrecargo Aprobado',
    event_description: `Sobrecargo de Bs. ${surchargeAmount.toFixed(2)} APROBADO por el operador. Nueva tarifa total: Bs. ${newTotalFare.toFixed(2)}`,
    actor_id: userId,
  });

  return { error: null };
}

/**
 * Operator rejects a pending surcharge. Fare remains at pre-surcharge authorized amount.
 */
export async function rejectSurcharge(
  rideId: string,
  rejectionReason?: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id || null;

  const { data: currentRide, error: fetchErr } = await supabase
    .from('rides')
    .select('status, initial_fare, wait_time_cost, surcharge_amount, surcharge_status')
    .eq('id', rideId)
    .single();

  if (fetchErr || !currentRide) {
    return { error: new Error('La carrera no existe.') };
  }

  if (currentRide.surcharge_status !== 'pending') {
    return { error: new Error('La carrera no tiene un sobrecargo pendiente de aprobación.') };
  }

  const initialFare = Number(currentRide.initial_fare || 0);
  const waitTimeCost = Number(currentRide.wait_time_cost || 0);
  const originalTotalFare = initialFare + waitTimeCost;

  const { error: updateErr } = await supabase
    .from('rides')
    .update({
      surcharge_status: 'rejected',
      total_fare: originalTotalFare,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rideId);

  if (updateErr) {
    console.error('Error rejecting surcharge:', updateErr);
    return { error: new Error(updateErr.message) };
  }

  const desc = rejectionReason
    ? `Sobrecargo RECHAZADO por el operador — Motivo: ${rejectionReason.trim()}`
    : 'Sobrecargo RECHAZADO por el operador. Tarifa autorizada se mantiene sin sobrecargo.';

  await addTimelineEvent({
    ride_id: rideId,
    status_from: currentRide.status,
    status_to: currentRide.status,
    event_title: 'Sobrecargo Rechazado',
    event_description: desc,
    actor_id: userId,
  });

  return { error: null };
}

/**
 * Reassigns an active ride (assigned/ontheway) to a new available driver atomically via RPC.
 */
export async function reassignRideDriver(
  rideIdOrParams: string | { ride_id: string; new_driver_id: string; reason_category: string; reason_detail?: string },
  newDriverId?: string,
  reasonCategory?: string,
  reasonDetail?: string
): Promise<{ success: boolean; message?: string; error?: Error | null }> {
  try {
    const rideId = typeof rideIdOrParams === 'object' ? rideIdOrParams.ride_id : rideIdOrParams;
    const driverId = typeof rideIdOrParams === 'object' ? rideIdOrParams.new_driver_id : newDriverId!;
    const category = typeof rideIdOrParams === 'object' ? rideIdOrParams.reason_category : reasonCategory!;
    const detail = typeof rideIdOrParams === 'object' ? rideIdOrParams.reason_detail : reasonDetail;

    const supabase = createClient();
    const { data, error } = await supabase.rpc('reassign_ride_driver_atomic', {
      p_ride_id: rideId,
      p_new_driver_id: driverId,
      p_reason_category: category,
      p_reason_detail: detail || null,
    });

    if (error) {
      console.error('RPC Error in reassign_ride_driver_atomic:', error);
      return { success: false, error: new Error(error.message) };
    }

    const res = data as { success: boolean; message?: string; error?: string };
    if (!res.success) {
      return { success: false, error: new Error(res.error || 'Error al reasignar carrera.') };
    }

    return { success: true, message: res.message };
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Unhandled exception in reassignRideDriver:', error);
    return { success: false, error };
  }
}

/**
 * Fetches structured ride reassignments with full joined details for management reporting.
 */
export async function getRideReassignments(params?: {
  dateRange?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}): Promise<{ data: any[] | null; error: Error | null }> {
  try {
    const supabase = createClient();
    let query = supabase
      .from('ride_reassignments')
      .select(`
        id,
        ride_id,
        previous_driver_id,
        previous_movil_number,
        new_driver_id,
        new_movil_number,
        reason_category,
        reason_detail,
        reassigned_by,
        created_at,
        ride:rides (
          id,
          ride_code,
          requester_person,
          requester_company,
          status,
          total_fare
        ),
        previous_driver:drivers!ride_reassignments_previous_driver_id_fkey (
          id,
          movil_number,
          profile:profiles (
            full_name
          )
        ),
        new_driver:drivers!ride_reassignments_new_driver_id_fkey (
          id,
          movil_number,
          profile:profiles (
            full_name
          )
        ),
        reassigned_by_profile:profiles!ride_reassignments_reassigned_by_fkey (
          id,
          full_name,
          role
        )
      `)
      .order('created_at', { ascending: false });

    if (params?.startDate) {
      query = query.gte('created_at', params.startDate);
    }
    if (params?.endDate) {
      query = query.lte('created_at', params.endDate);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching ride reassignments:', error);
      return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
  } catch (err: unknown) {
    const error = err as Error;
    return { data: null, error };
  }
}
