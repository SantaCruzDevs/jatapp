import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCompanyPortalEnabled } from '@/lib/services/system-settings';
import Sidebar from '@/components/layout/Sidebar';

export default async function CompanyPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 1. Fetch user profile role
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_url')
    .eq('id', user.id)
    .single();

  const role = profile?.role || user.user_metadata?.role || 'CLIENT_USER';

  // 2. Check feature flag: COMPANY_PORTAL_ENABLED
  const portalEnabled = await getCompanyPortalEnabled();

  // If feature flag is OFF, block access
  if (!portalEnabled && role === 'CLIENT_USER') {
    redirect('/login?reason=portal_disabled');
  }

  // 3. For CLIENT_USER, verify link to company_users
  if (role === 'CLIENT_USER') {
    const { data: linkData } = await supabase
      .from('company_users')
      .select('company_id')
      .eq('profile_id', user.id)
      .limit(1);

    if (!linkData || linkData.length === 0) {
      // User is CLIENT_USER but not linked to any company yet
      return (
        <div className="flex min-h-screen bg-[#0F172A] text-slate-100">
          <Sidebar
            role={role}
            userName={profile?.full_name || 'Usuario Cliente'}
            avatarUrl={profile?.avatar_url || undefined}
          />
          <main className="flex-1 p-8 flex items-center justify-center">
            <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-xl">
              <h2 className="text-lg font-bold text-white font-heading">Cuenta en Proceso de Vinculación</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Su cuenta de usuario <strong>CLIENT_USER</strong> está activa, pero aún no se ha completado la vinculación formal con su Empresa Corporativa.
              </p>
              <p className="text-[11px] text-slate-400">
                Por favor póngase en contacto con el equipo de Soporte MotoJAT para habilitar el acceso a su portal.
              </p>
            </div>
          </main>
        </div>
      );
    }
  }

  return (
    <div className="flex min-h-screen bg-[#0F172A] text-slate-100">
      <Sidebar
        role={role}
        userName={profile?.full_name || 'Usuario Empresa'}
        avatarUrl={profile?.avatar_url || undefined}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
