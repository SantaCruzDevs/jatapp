import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { Profile, Driver, UserRole } from '@/types/database.types';

export interface ProfileWithDriver extends Profile {
  email?: string | null;
  driver?: Driver | null;
}

export interface CreateUserData {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
  role: UserRole;
  // Optional Driver fields
  movil_number?: number;
  vehicle_type?: string;
  vehicle_plate?: string;
  zone?: string;
}

export async function getProfiles(filters?: { role?: string; search?: string }): Promise<ProfileWithDriver[]> {
  const supabase = createBrowserClient();
  let query = supabase
    .from('profiles')
    .select(`
      *,
      driver:drivers!drivers_profile_id_fkey(*)
    `)
    .order('created_at', { ascending: false });

  if (filters?.role && filters.role !== 'ALL') {
    query = query.eq('role', filters.role);
  }

  if (filters?.search && filters.search.trim() !== '') {
    const term = filters.search.trim();
    query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching profiles:', error);
    throw new Error(`Error al obtener usuarios: ${error.message}`);
  }

  // Fetch email mapping from admin API
  let emailMap: Record<string, string> = {};
  try {
    const emailRes = await fetch('/api/admin/users');
    if (emailRes.ok) {
      const emailJson = await emailRes.json();
      if (emailJson.emails) {
        emailMap = emailJson.emails;
      }
    }
  } catch (e) {
    console.warn('No se pudieron cargar los correos de Auth:', e);
  }

  const formatted: ProfileWithDriver[] = (data || []).map((p: any) => ({
    ...p,
    email: emailMap[p.id] || p.email || null,
    driver: Array.isArray(p.driver) ? (p.driver[0] || null) : (p.driver || null),
  }));

  return formatted;
}

export function formatProfileError(
  error: any,
  context?: {
    targetRole?: string;
    newRole?: string;
    isSelf?: boolean;
    activeRole?: string;
  }
): string {
  const message = error?.message || (typeof error === 'string' ? error : '');
  const code = error?.code || '';

  // Rule 3: Self role modification
  if (context?.isSelf || message.includes('propio rol') || message.includes('propio Perfil')) {
    return 'No puedes modificar tu propio rol.';
  }

  // Rule 4: Attempting to assign SUPERADMIN/Soporte role
  if (
    context?.newRole === 'SUPERADMIN' ||
    message.includes('promover') ||
    message.includes('asignar el rol') ||
    message.includes('Soporte (SUPERADMIN)')
  ) {
    return 'No se puede asignar el rol de Soporte.';
  }

  // Rule 1: Attempting to modify SUPERADMIN/Soporte user
  if (
    context?.targetRole === 'SUPERADMIN' ||
    message.includes('Soporte') ||
    message.includes('SUPERADMIN') ||
    message.includes('inmutable')
  ) {
    return 'No se puede modificar el usuario de Soporte.';
  }

  // Rule 2: ADMIN attempting to modify another ADMIN
  if (
    (context?.targetRole === 'ADMIN' && context?.activeRole === 'ADMIN') ||
    message.includes('Administrador')
  ) {
    return 'No tienes permisos para modificar a otro Administrador.';
  }

  // Rule 5: Generic permission / RLS / PGRST116 / 42501 error
  if (
    code === 'PGRST116' ||
    code === '42501' ||
    message.includes('Cannot coerce') ||
    message.includes('row-level security') ||
    message.includes('Permiso denegado') ||
    message.includes('privilegios') ||
    message.includes('permission') ||
    message.includes('denied')
  ) {
    if (context?.targetRole === 'SUPERADMIN') {
      return 'No se puede modificar el usuario de Soporte.';
    }
    if (context?.targetRole === 'ADMIN' && context?.activeRole === 'ADMIN') {
      return 'No tienes permisos para modificar a otro Administrador.';
    }
    return 'No tienes permisos para realizar esta acción.';
  }

  // Rule 6: Unexpected / unclassified error
  return 'No se pudo actualizar el usuario. Intenta nuevamente.';
}

export async function updateProfile(id: string, payload: { full_name?: string; phone?: string | null; avatar_url?: string | null }) {
  const supabase = createBrowserClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Usuario no autenticado.');
  }

  // Fetch target profile first to check protection rules
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', id)
    .single();

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const activeRole = currentProfile?.role;
  const targetRole = targetProfile?.role;

  // Rule 1: Nobody can modify a SUPERADMIN profile unless it is the SUPERADMIN updating their own profile
  if (targetRole === 'SUPERADMIN' && user.id !== id) {
    throw new Error(formatProfileError(new Error('Soporte'), { targetRole: 'SUPERADMIN', activeRole, isSelf: false }));
  }

  // Rule 2: An ADMIN profile can ONLY be modified by SUPERADMIN or by the ADMIN themselves
  if (targetRole === 'ADMIN' && user.id !== id && activeRole !== 'SUPERADMIN') {
    throw new Error(formatProfileError(new Error('ADMIN'), { targetRole: 'ADMIN', activeRole, isSelf: false }));
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    throw new Error(formatProfileError(error, { targetRole, activeRole, isSelf: user.id === id }));
  }

  return data as Profile;
}

export async function updateProfileRole(targetUserId: string, newRole: UserRole) {
  const supabase = createBrowserClient();

  // Validate current user role
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Usuario no autenticado.');
  }

  const isSelf = targetUserId === user.id;

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const activeRole = currentProfile?.role;

  // Fetch target profile's current role
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .single();

  const targetRole = targetProfile?.role;

  // Rule 3: Prohibit self role change
  if (isSelf) {
    throw new Error(formatProfileError(new Error('self'), { isSelf: true, targetRole, newRole, activeRole }));
  }

  // Rule 1: SUPERADMIN profile role cannot be modified by anyone
  if (targetRole === 'SUPERADMIN') {
    throw new Error(formatProfileError(new Error('SUPERADMIN'), { targetRole: 'SUPERADMIN', newRole, activeRole, isSelf }));
  }

  // Rule 4: Cannot assign SUPERADMIN role
  if (newRole === 'SUPERADMIN') {
    throw new Error(formatProfileError(new Error('SUPERADMIN_ASSIGN'), { newRole: 'SUPERADMIN', targetRole, activeRole, isSelf }));
  }

  // Rule 2: Only SUPERADMIN can change an ADMIN's role
  if (targetRole === 'ADMIN' && activeRole !== 'SUPERADMIN') {
    throw new Error(formatProfileError(new Error('ADMIN_MODIFY'), { targetRole: 'ADMIN', activeRole, newRole, isSelf }));
  }

  // Rule 5: SUPERVISOR can only assign OPERATOR, DRIVER, CLIENT_USER
  if (activeRole === 'SUPERVISOR' && !['OPERATOR', 'DRIVER', 'CLIENT_USER'].includes(newRole)) {
    throw new Error(formatProfileError(new Error('GENERIC_PERM'), { targetRole, newRole, activeRole, isSelf }));
  }

  // Rule 5: Non-admin users cannot change roles
  if (!['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(activeRole || '')) {
    throw new Error(formatProfileError(new Error('GENERIC_PERM'), { targetRole, newRole, activeRole, isSelf }));
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      role: newRole,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetUserId)
    .select()
    .single();

  if (error) {
    console.error('Error updating profile role:', error);
    throw new Error(formatProfileError(error, { targetRole, newRole, activeRole, isSelf }));
  }

  return data as Profile;
}

export async function createUser(payload: CreateUserData): Promise<Profile> {
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || 'Error al crear usuario.');
  }

  return json.user as Profile;
}

export async function completeDriverProfile(payload: {
  profile_id: string;
  movil_number: number;
  vehicle_type: string;
  vehicle_plate: string;
  zone: string;
}): Promise<Driver> {
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'complete_driver_profile',
      ...payload,
    }),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || 'Error al completar la ficha del motoquero.');
  }

  return json.driver as Driver;
}


