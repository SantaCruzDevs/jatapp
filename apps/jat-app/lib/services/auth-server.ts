import { createClient as createServerClient } from '@/lib/supabase/server';
import { Profile } from '@/types/database.types';

export async function getCurrentUserProfile(): Promise<{ user: any; profile: Profile | null }> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { user: null, profile: null };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return { user, profile: profile as Profile | null };
  } catch (error: any) {
    if (error?.digest !== 'DYNAMIC_SERVER_USAGE') {
      console.error('Error fetching current user profile:', error);
    }
    return { user: null, profile: null };
  }
}

export async function hasPermission(permissionKey: string): Promise<boolean> {
  try {
    const { user, profile } = await getCurrentUserProfile();
    if (!user || !profile) return false;

    if (['SUPERADMIN', 'ADMIN'].includes(profile.role)) {
      return true;
    }

    const supabase = await createServerClient();
    const { data } = await supabase
      .from('user_permissions')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('permission_key', permissionKey)
      .maybeSingle();

    return !!data;
  } catch (error) {
    console.error('Error checking user permission:', error);
    return false;
  }
}
