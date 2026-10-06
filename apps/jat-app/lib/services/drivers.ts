import { createClient } from '@/lib/supabase/client';
import { Driver, DriverStatus } from '@/types/database.types';

export interface DriverWithProfile extends Driver {
  profile?: {
    full_name: string;
    phone: string | null;
    avatar_url: string | null;
  } | null;
}

/**
 * Retrieves drivers from the MotoJAT fleet with profile details.
 * Excludes drivers in 'baja' status by default unless includeBaja is true.
 */
export async function getDrivers(
  statusFilter?: DriverStatus,
  includeBaja: boolean = false
): Promise<{ data: DriverWithProfile[] | null; error: Error | null }> {
  const supabase = createClient();
  let query = supabase
    .from('drivers')
    .select(`
      *,
      profile:profiles (
        full_name,
        phone,
        avatar_url
      )
    `)
    .order('movil_number', { ascending: true });

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  } else if (!includeBaja) {
    query = query.neq('status', 'baja');
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching drivers:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as DriverWithProfile[], error: null };
}

/**
 * Updates a driver's operational status ('available', 'busy', 'offline').
 */
export async function updateDriverStatus(driverId: string, status: DriverStatus): Promise<{ error: Error | null }> {
  const supabase = createClient();

  const { error } = await supabase
    .from('drivers')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', driverId);

  if (error) {
    console.error('Error updating driver status:', error);
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Retrieves a driver record matching the logged in user's profile ID.
 */
export async function getDriverByProfileId(profileId: string): Promise<{ driver: DriverWithProfile | null; error: Error | null }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('drivers')
    .select(`
      *,
      profile:profiles (
        full_name,
        phone,
        avatar_url
      )
    `)
    .eq('profile_id', profileId)
    .single();

  if (error) {
    return { driver: null, error: new Error(error.message) };
  }

  return { driver: data as DriverWithProfile, error: null };
}

/**
 * Calculates the smallest available integer movil number for UI suggestion/preview.
 */
export async function getNextAvailableMovilNumber(): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .from('drivers')
    .select('movil_number')
    .neq('status', 'baja');

  if (!data || data.length === 0) return 1;

  const activeSet = new Set(data.map((d) => Number(d.movil_number)));
  let candidate = 1;
  while (activeSet.has(candidate)) {
    candidate++;
  }
  return candidate;
}

/**
 * Deactivates a driver (sets status to 'baja'), freeing their movil number for future reuse
 * while preserving 100% of historical rides, settlements, and comisiones.
 */
export async function deactivateDriver(driverId: string): Promise<{ error: Error | null }> {
  const supabase = createClient();

  // 1. Check if driver exists and operational status
  const { data: driver, error: drvErr } = await supabase
    .from('drivers')
    .select('id, status, movil_number')
    .eq('id', driverId)
    .single();

  if (drvErr || !driver) {
    return { error: new Error('Motoquero no encontrado.') };
  }

  if (driver.status === 'busy') {
    return { error: new Error('No se puede dar de baja a un motoquero con carreras en curso.') };
  }

  // 2. Check for active/assigned/ontheway rides in public.rides
  const { data: activeRides, error: ridesErr } = await supabase
    .from('rides')
    .select('id')
    .eq('driver_id', driverId)
    .in('status', ['assigned', 'ontheway']);

  if (ridesErr) {
    return { error: new Error(`Error al verificar carreras activas: ${ridesErr.message}`) };
  }

  if (activeRides && activeRides.length > 0) {
    return { error: new Error('No se puede dar de baja a un motoquero con carreras en curso.') };
  }

  // 3. Set status to 'baja'
  const { error: updateErr } = await supabase
    .from('drivers')
    .update({ status: 'baja', updated_at: new Date().toISOString() })
    .eq('id', driverId);

  if (updateErr) {
    console.error('Error deactivating driver:', updateErr);
    return { error: new Error(`Error al dar de baja al motoquero: ${updateErr.message}`) };
  }

  return { error: null };
}

/**
 * Reactivates a driver from 'baja' status to 'available'.
 * Case A: If their previous movil_number is still free among active drivers, they recover it.
 * Case B: If their previous movil_number was reused by another active driver,
 *         they automatically receive the lowest available positive integer.
 * Invokes server RPC 'reactivate_driver' with fallback.
 */
export async function reactivateDriver(driverId: string): Promise<{ data: Driver | null; error: Error | null }> {
  const supabase = createClient();

  // 1. Check if driver exists and is in 'baja' status
  const { data: driver, error: drvErr } = await supabase
    .from('drivers')
    .select('id, status, movil_number')
    .eq('id', driverId)
    .single();

  if (drvErr || !driver) {
    return { data: null, error: new Error('Motoquero no encontrado.') };
  }

  if (driver.status !== 'baja') {
    return { data: null, error: new Error('El motoquero no se encuentra en estado BAJA.') };
  }

  // 2. Try server-side atomic RPC first
  const { data: rpcData, error: rpcErr } = await supabase.rpc('reactivate_driver', { p_driver_id: driverId });

  if (!rpcErr && rpcData) {
    return { data: rpcData as Driver, error: null };
  }

  // 3. Fallback execution if RPC is not deployed yet on remote DB
  const oldMovil = Number(driver.movil_number);

  // Fetch all active drivers (status != 'baja')
  const { data: activeDrivers } = await supabase
    .from('drivers')
    .select('id, movil_number')
    .neq('status', 'baja')
    .neq('id', driverId);

  const activeSet = new Set((activeDrivers || []).map((d) => Number(d.movil_number)));
  let assignedMovil = oldMovil;

  if (activeSet.has(oldMovil) || !oldMovil || oldMovil <= 0) {
    // Case B: Old movil is taken -> calculate lowest positive integer gap
    let candidate = 1;
    while (activeSet.has(candidate)) {
      candidate++;
    }
    assignedMovil = candidate;
  }

  const { data: updatedDriver, error: updateErr } = await supabase
    .from('drivers')
    .update({
      status: 'available',
      movil_number: assignedMovil,
      updated_at: new Date().toISOString(),
    })
    .eq('id', driverId)
    .select()
    .single();

  if (updateErr) {
    console.error('Error reactivating driver:', updateErr);
    return { data: null, error: new Error(`Error al reactivar el motoquero: ${updateErr.message}`) };
  }

  return { data: updatedDriver as Driver, error: null };
}
