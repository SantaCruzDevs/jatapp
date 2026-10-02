import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { UserPermission } from '@/types/database.types';

export async function getUserPermissions(profileId: string): Promise<UserPermission[]> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase
    .from('user_permissions')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user permissions:', error);
    throw new Error(`Error al cargar los permisos: ${error.message}`);
  }

  return (data as UserPermission[]) || [];
}

export async function grantPermission(profileId: string, permissionKey: string): Promise<UserPermission> {
  const supabase = createBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Usuario no autenticado');
  }

  const { data, error } = await supabase
    .from('user_permissions')
    .insert({
      profile_id: profileId,
      permission_key: permissionKey,
      granted_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error granting permission:', error);
    if (error.code === '23505') {
      throw new Error('El usuario ya posee este permiso otorgado.');
    }
    throw new Error(`Error al conceder el permiso: ${error.message}`);
  }

  return data as UserPermission;
}

export async function revokePermission(profileId: string, permissionKey: string): Promise<void> {
  const supabase = createBrowserClient();
  const { error } = await supabase
    .from('user_permissions')
    .delete()
    .eq('profile_id', profileId)
    .eq('permission_key', permissionKey);

  if (error) {
    console.error('Error revoking permission:', error);
    throw new Error(`Error al revocar el permiso: ${error.message}`);
  }
}
