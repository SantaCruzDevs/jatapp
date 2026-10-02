import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCompanyPortalEnabled } from '@/lib/services/system-settings';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role || user.user_metadata?.role || 'CLIENT_USER';

  if (['SUPERADMIN', 'ADMIN'].includes(role)) redirect('/admin');
  if (['SUPERVISOR', 'OPERATOR'].includes(role)) redirect('/operations');
  if (role === 'DRIVER') redirect('/driver');

  if (role === 'CLIENT_USER') {
    const portalEnabled = await getCompanyPortalEnabled();
    if (portalEnabled) {
      redirect('/company/account');
    } else {
      redirect('/login?reason=portal_disabled');
    }
  }

  redirect('/login');
}
