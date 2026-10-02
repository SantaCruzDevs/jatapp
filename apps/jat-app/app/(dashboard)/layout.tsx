import React from 'react';
import { getCurrentUserProfile } from '@/lib/services/auth-server';
import DashboardLayoutClient from './DashboardLayoutClient';

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
    <DashboardLayoutClient role={role} userName={userName} avatarUrl={avatarUrl}>
      {children}
    </DashboardLayoutClient>
  );
}
