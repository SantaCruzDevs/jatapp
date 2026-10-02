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

  if (targetProfile) {
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const activeRole = currentProfile?.role;

    // Rule 1: Nobody can modify a SUPERADMIN profile unless it is the SUPERADMIN updating their own profile
    if (targetProfile.role === 'SUPERADMIN' && user.id !== id) {
      throw new Error('Permiso denegado: El perfil del usuario Soporte (SUPERADMIN) es inmutable.');
    }

    // Rule 2: An ADMIN profile can ONLY be modified by SUPERADMIN or by the ADMIN themselves
    if (targetProfile.role === 'ADMIN' && user.id !== id && activeRole !== 'SUPERADMIN') {
      throw new Error('Permiso denegado: Solo el usuario Soporte (SUPERADMIN) puede modificar administrativamente a un Administrador.');
    }
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
    throw new Error(`Error al actualizar el perfil: ${error.message}`);
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

  // Prohibit self role change
  if (targetUserId === user.id) {
    throw new Error('Permiso denegado: Un usuario no puede cambiar administrativamente su propio rol.');
  }

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

  if (targetProfile?.role === 'SUPERADMIN') {
    throw new Error('Permiso denegado: El rol del usuario Soporte (SUPERADMIN) no puede ser modificado.');
  }

  if (newRole === 'SUPERADMIN') {
    throw new Error('Permiso denegado: No está permitido promover ni asignar usuarios al rol interno Soporte (SUPERADMIN).');
  }

  if (targetProfile?.role === 'ADMIN' && activeRole !== 'SUPERADMIN') {
    throw new Error('Permiso denegado: Solo el usuario Soporte (SUPERADMIN) puede cambiar el rol de un Administrador.');
  }

  if (activeRole === 'SUPERVISOR' && !['OPERATOR', 'DRIVER', 'CLIENT_USER'].includes(newRole)) {
    throw new Error('Permiso denegado: Un Supervisor solo puede asignar roles operativos (Operador, Motoquero, Cliente).');
  }

  if (!['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(activeRole || '')) {
    throw new Error('Permiso denegado: Su rol no posee privilegios para modificar roles de usuario.');
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
    throw new Error(`Error al actualizar el rol: ${error.message}`);
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


