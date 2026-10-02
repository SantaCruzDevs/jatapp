'use client';

import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { MobileSidebarProvider } from '@/components/layout/MobileSidebarContext';

interface DashboardLayoutClientProps {
  role: string;
  userName: string;
  avatarUrl: string;
  children: React.ReactNode;
}

export default function DashboardLayoutClient({
  role,
  userName,
  avatarUrl,
  children,
}: DashboardLayoutClientProps) {
  return (
    <MobileSidebarProvider>
      <div className="flex min-h-screen bg-[#0F172A] relative overflow-x-hidden">
        <Sidebar role={role} userName={userName} avatarUrl={avatarUrl} />
        <div className="flex-1 flex flex-col min-w-0 w-full overflow-x-hidden">
          {children}
        </div>
      </div>
    </MobileSidebarProvider>
  );
}
