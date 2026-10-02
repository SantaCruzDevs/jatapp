import { createClient } from '@/lib/supabase/client';
import { RideTimeline } from '@/types/database.types';

export interface RideTimelineWithActor extends RideTimeline {
  actor?: {
    full_name: string;
    role: string;
  } | null;
}

/**
 * Fetches the chronological audit timeline events for a given ride.
 */
export async function getRideTimeline(rideId: string): Promise<{ data: RideTimelineWithActor[] | null; error: Error | null }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('ride_timeline')
    .select(`
      *,
      actor:profiles (
        full_name,
        role
      )
    `)
    .eq('ride_id', rideId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching ride timeline:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as RideTimelineWithActor[], error: null };
}

/**
 * Appends a new event entry into the ride timeline.
 */
export async function addTimelineEvent(params: {
  ride_id: string;
  status_from: string | null;
  status_to: string;
  event_title: string;
  event_description?: string | null;
  actor_id?: string | null;
}): Promise<{ data: RideTimeline | null; error: Error | null }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('ride_timeline')
    .insert([{
      ride_id: params.ride_id,
      status_from: params.status_from,
      status_to: params.status_to,
      event_title: params.event_title,
      event_description: params.event_description || null,
      actor_id: params.actor_id || null,
    }])
    .select()
    .single();

  if (error) {
    console.error('Error recording timeline event:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as RideTimeline, error: null };
}
