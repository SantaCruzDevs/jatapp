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
 * Retrieves all drivers from the MotoJAT fleet with profile details.
 */
export async function getDrivers(statusFilter?: DriverStatus): Promise<{ data: DriverWithProfile[] | null; error: Error | null }> {
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
