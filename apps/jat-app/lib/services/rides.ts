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
    query = query.or(`ride_code.ilike.%${term}%,requester_person.ilike.%${term}%,requester_company.ilike.%${term}%,pickup_address.ilike.%${term}%,destination_address.ilike.%${term}%`);
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

  // Generate unique ride code, e.g. JAT-849201
  const rideCode = `JAT-${Math.floor(100000 + Math.random() * 900000)}`;

  const ridePayload = {
    ride_code: rideCode,
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
    event_description: `Solicitud ${rideCode} registrada para ${params.requester_person} (${params.requester_company})`,
    actor_id: userId,
  });

  return { ride: newRide as Ride, error: null };
}

/**
 * Assigns a driver to a pending ride, updates ride status to 'assigned', and logs timeline audit.
 */
export async function assignDriverToRide(
  rideId: string,
  driverId: string,
  driverMovil?: number
): Promise<{ error: Error | null }> {
  const supabase = createClient();

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id || null;

  // 1. Fetch current ride state
  const { data: currentRide, error: fetchErr } = await supabase
    .from('rides')
    .select('status, ride_code')
    .eq('id', rideId)
    .single();

  if (fetchErr || !currentRide) {
    return { error: new Error('La carrera especificada no existe.') };
  }

  if (currentRide.status !== 'pending') {
    return { error: new Error(`No se puede asignar conductor a una carrera en estado '${currentRide.status.toUpperCase()}'. Debe estar PENDING.`) };
  }

  // 2. Concurrency-safe atomic update
  const { data: updatedData, error: updateErr } = await supabase
    .from('rides')
    .update({
      driver_id: driverId,
      status: 'assigned',
      updated_at: new Date().toISOString(),
    })
    .eq('id', rideId)
    .eq('status', 'pending')
    .select();

  if (updateErr) {
    console.error('Error assigning driver to ride:', updateErr);
    return { error: new Error(updateErr.message) };
  }

  if (!updatedData || updatedData.length === 0) {
    return { error: new Error('Conflicto de concurrencia: Esta carrera ya fue asignada o modificada por otro usuario.') };
  }

  // 3. Mark driver status as busy
  await updateDriverStatus(driverId, 'busy');

  // 4. Log timeline event
  await addTimelineEvent({
    ride_id: rideId,
    status_from: 'pending',
    status_to: 'assigned',
    event_title: 'Motoquero Asignado',
    event_description: driverMovil ? `Asignado a Móvil #${driverMovil}` : 'Motoquero asignado a la carrera',
    actor_id: userId,
  });

  return { error: null };
}

/**
 * Updates ride status adhering to strict state machine rules and logs timeline audit.
 */
export async function updateRideStatus(
  rideId: string,
  newStatus: RideStatus,
  reason?: string,
  driverIdToRelease?: string | null,
  paymentMethod?: PaymentMethod
): Promise<{ error: Error | null }> {
  const supabase = createClient();

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id || null;

  // 1. Fetch current status and surcharge status
  const { data: currentRide, error: fetchErr } = await supabase
    .from('rides')
    .select('status, ride_code, driver_id, surcharge_status')
    .eq('id', rideId)
    .single();

  if (fetchErr || !currentRide) {
    return { error: new Error('La carrera no existe o fue eliminada.') };
  }

  const currentStatus = currentRide.status as RideStatus;

  // 2. Validate transition
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    return {
      error: new Error(`Transición de estado inválida: No es posible cambiar de '${currentStatus.toUpperCase()}' a '${newStatus.toUpperCase()}'.`),
    };
  }

  // REGLA FUNDAMENTAL DE NEGOCIO: UN SOBRECARGO PENDIENTE IMPIDE FINALIZAR LA CARRERA PARA TODOS LOS ACTORES
  if (newStatus === 'completed' && currentRide.surcharge_status === 'pending') {
    return {
      error: new Error(
        'Existe un sobrecargo pendiente de aprobación. El operador debe aprobarlo o rechazarlo antes de finalizar la carrera.'
      ),
    };
  }

  // Get current user role for role-based transition validation & timeline attribution
  let userRole = 'OPERATOR';
  if (userId) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (prof?.role) userRole = prof.role;
  }

  // MOTOQUERO MÁQUINA DE ESTADOS: assigned -> ontheway -> completed (NO assigned -> completed directly for driver)
  if (userRole === 'DRIVER' && currentStatus === 'assigned' && newStatus === 'completed') {
    return {
      error: new Error(
        "El motoquero debe iniciar la carrera ('En Camino') antes de poder finalizarla. El cierre directo en estado asignado es exclusivo de Central por contingencia."
      ),
    };
  }

  // EL MOTOQUERO NO PUEDE CANCELAR CARRERAS: Solo Operador/Central puede cancelar.
  if (userRole === 'DRIVER' && newStatus === 'cancelled') {
    return {
      error: new Error(
        'El motoquero no está autorizado a cancelar carreras. La cancelación debe ser procesada exclusivamente por la Central de Operaciones.'
      ),
    };
  }

  // 3. Concurrency-safe atomic update
  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };
  if (paymentMethod) {
    updatePayload.payment_method = paymentMethod;
  }

  const { data: updatedData, error: updateErr } = await supabase
    .from('rides')
    .update(updatePayload)
    .eq('id', rideId)
    .eq('status', currentStatus)
    .select();

  if (updateErr) {
    console.error('Error updating ride status:', updateErr);
    return { error: new Error(updateErr.message) };
  }

  if (!updatedData || updatedData.length === 0) {
    return { error: new Error('Conflicto de concurrencia: El estado de esta carrera fue modificado simultáneamente por otra centralista.') };
  }

  // 4. Release driver to 'available' if completed or cancelled
  const targetDriverId = driverIdToRelease || currentRide.driver_id;
  if ((newStatus === 'completed' || newStatus === 'cancelled') && targetDriverId) {
    await updateDriverStatus(targetDriverId, 'available');
  }

  // 5. Timeline Titles with Clear Actor Attribution
  const titleMap: Record<RideStatus, string> = {
    pending: 'Carrera Creada',
    assigned: 'Motoquero Asignado',
    ontheway: 'En Camino / En Curso',
    completed: 'Servicio Completado',
    cancelled: 'Carrera Cancelada',
  };

  let eventTitle = titleMap[newStatus] || `Estado cambiado a ${newStatus}`;
  if (newStatus === 'completed') {
    if (userRole === 'DRIVER') {
      eventTitle = 'Servicio Completado — Motoquero';
    } else if (currentStatus === 'assigned') {
      eventTitle = 'Servicio Completado — Central (Contingencia)';
    } else {
      eventTitle = 'Servicio Completado — Central';
    }
  }

  await addTimelineEvent({
    ride_id: rideId,
    status_from: currentStatus,
    status_to: newStatus,
    event_title: eventTitle,
    event_description: reason || `Transición de ${currentStatus.toUpperCase()} a ${newStatus.toUpperCase()}`,
    actor_id: userId,
  });

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
