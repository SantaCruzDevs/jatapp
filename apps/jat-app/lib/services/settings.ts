import { createClient } from '@/lib/supabase/client';

export interface DispatchSettings {
  unassignedYellowMin: number;
  unassignedRedMin: number;
  assignedYellowMin: number;
  assignedRedMin: number;
}

export const DEFAULT_DISPATCH_SETTINGS: DispatchSettings = {
  unassignedYellowMin: 3,
  unassignedRedMin: 5,
  assignedYellowMin: 15,
  assignedRedMin: 20,
};

let cachedSettings: DispatchSettings = { ...DEFAULT_DISPATCH_SETTINGS };

/**
 * Retrieves the active dispatch time threshold settings from Supabase Cloud.
 */
export async function getDispatchSettings(): Promise<DispatchSettings> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('user_permissions')
      .select('permission_key, created_at')
      .like('permission_key', 'DISPATCH_CFG:%')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      const keyStr = data[0].permission_key;
      const parts = keyStr.replace('DISPATCH_CFG:', '').split(':');
      if (parts.length === 4) {
        const parsed: DispatchSettings = {
          unassignedYellowMin: Math.max(1, Number(parts[0]) || DEFAULT_DISPATCH_SETTINGS.unassignedYellowMin),
          unassignedRedMin: Math.max(1, Number(parts[1]) || DEFAULT_DISPATCH_SETTINGS.unassignedRedMin),
          assignedYellowMin: Math.max(1, Number(parts[2]) || DEFAULT_DISPATCH_SETTINGS.assignedYellowMin),
          assignedRedMin: Math.max(1, Number(parts[3]) || DEFAULT_DISPATCH_SETTINGS.assignedRedMin),
        };
        cachedSettings = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error fetching dispatch settings from Supabase:', e);
  }

  return cachedSettings;
}

/**
 * Saves updated dispatch threshold settings directly to Supabase Cloud.
 */
export async function saveDispatchSettings(
  settings: Partial<DispatchSettings>,
  profileId?: string | null
): Promise<{ settings: DispatchSettings; error: Error | null }> {
  const current = cachedSettings;
  const updated: DispatchSettings = {
    unassignedYellowMin: settings.unassignedYellowMin ?? current.unassignedYellowMin,
    unassignedRedMin: settings.unassignedRedMin ?? current.unassignedRedMin,
    assignedYellowMin: settings.assignedYellowMin ?? current.assignedYellowMin,
    assignedRedMin: settings.assignedRedMin ?? current.assignedRedMin,
  };

  try {
    const supabase = createClient();

    let targetProfileId = profileId;
    if (!targetProfileId) {
      const { data: authData } = await supabase.auth.getUser();
      targetProfileId = authData.user?.id || null;
    }

    if (!targetProfileId) {
      return { settings: current, error: new Error('Usuario no autenticado para guardar configuración.') };
    }

    const permissionKey = `DISPATCH_CFG:${updated.unassignedYellowMin}:${updated.unassignedRedMin}:${updated.assignedYellowMin}:${updated.assignedRedMin}`;

    const { error } = await supabase
      .from('user_permissions')
      .insert([
        {
          profile_id: targetProfileId,
          permission_key: permissionKey,
        },
      ]);

    if (error) {
      console.error('Error saving dispatch settings to Supabase:', error);
      return { settings: current, error: new Error(error.message) };
    }

    cachedSettings = updated;
    return { settings: updated, error: null };
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Failed to save dispatch settings:', error);
    return { settings: current, error };
  }
}
