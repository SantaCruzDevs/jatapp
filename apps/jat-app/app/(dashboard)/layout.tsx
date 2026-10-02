import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { getCurrentUserProfile } from '@/lib/services/auth-server';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getCurrentUserProfile();

  const role = profile?.role || user?.user_metadata?.role || 'OPERATOR';
  const userName = profile?.full_name || user?.email || 'Usuario JAT';
  const avatarUrl = profile?.avatar_url || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200';

  return (
    <div className="flex min-h-screen bg-[#0F172A]">
      <Sidebar role={role} userName={userName} avatarUrl={avatarUrl} />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  );
}
