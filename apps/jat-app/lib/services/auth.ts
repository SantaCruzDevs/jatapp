import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { Profile } from '@/types/database.types';

export async function loginWithCredentials(email: string, pass: string) {
  const supabase = createBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: pass,
  });

  if (error) {
    throw new Error(error.message);
  }

  // Synchronize session state to ensure PostgREST headers include Authorization: Bearer <access_token>
  if (data.session) {
    await supabase.auth.setSession(data.session);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Error fetching user profile:', profileError);
    throw new Error(`Error al verificar los permisos del perfil: ${profileError.message}`);
  }

  if (!profile) {
    const metaRole = data.user.user_metadata?.role;
    const safeRole = metaRole && ['OPERATOR', 'DRIVER', 'CLIENT_USER'].includes(metaRole) ? metaRole : 'CLIENT_USER';
    return { user: data.user, role: safeRole, profile: null };
  }

  return { user: data.user, role: profile.role, profile: profile as Profile };
}

export async function getCurrentUserProfileClient(): Promise<Profile | null> {
  const supabase = createBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return (profile as Profile) || null;
}

export async function logoutUser() {
  const supabase = createBrowserClient();
  await supabase.auth.signOut();
}

/**
 * Sends a password reset email using Supabase Auth with redirect to /auth/callback.
 */
export async function requestPasswordReset(email: string) {
  const supabase = createBrowserClient();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectTo = `${origin}/auth/callback?next=/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Updates the user password for an active session (e.g., during recovery flow).
 */
export async function updateUserPassword(newPassword: string) {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: 'Soporte',
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  OPERATOR: 'Operador',
  DRIVER: 'Motoquero',
  CLIENT_USER: 'Empresa / Cliente',
};

export function getRoleLabel(role?: string | null): string {
  if (!role) return 'Sistema';
  return ROLE_LABELS[role.toUpperCase()] || role;
}

