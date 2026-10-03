'use client';

import React, { useState, useEffect } from 'react';
import { Clock, ShieldCheck, Activity, Menu } from 'lucide-react';
import OfflineBanner from '@/components/offline/OfflineBanner';
import { useMobileSidebar } from '@/components/layout/MobileSidebarContext';

interface TopbarProps {
  title: string;
  subtitle: string;
}

export default function Topbar({ title, subtitle }: TopbarProps) {
  const [timeString, setTimeString] = useState<string>('');
  const { openSidebar } = useMobileSidebar();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      const timeStr = now.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setTimeString(`${dateStr} • ${timeStr}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <OfflineBanner />
      <header className="h-16 sm:h-20 bg-[#1E293B] border-b border-[#334155] px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-20 w-full">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* Mobile Hamburger Button */}
          <button
            onClick={openSidebar}
            type="button"
            className="lg:hidden p-2 rounded-xl bg-[#0F172A] text-slate-300 hover:text-white hover:bg-[#334155] border border-[#334155] transition-colors flex-shrink-0"
            aria-label="Abrir menú de navegación"
          >
            <Menu className="w-5 h-5 text-[#FDDE12]" />
          </button>

          <div className="overflow-hidden">
            <h1 className="text-base sm:text-xl font-bold font-heading text-white tracking-tight truncate">{title}</h1>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 flex-shrink-0">
          {/* Live Clock */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300 bg-[#0F172A] px-3.5 py-1.5 rounded-lg border border-[#334155]">
            <Clock className="w-3.5 h-3.5 text-[#FDDE12]" />
            <span className="font-mono font-medium">{timeString || 'Cargando hora...'}</span>
          </div>

          {/* Operational Status Badge */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium">
            <Activity className="w-3.5 h-3.5 animate-pulse text-emerald-400 flex-shrink-0" />
            <span className="hidden xs:inline">Sistema Activo</span>
            <span className="xs:hidden">Activo</span>
          </div>

        </div>
      </header>
    </>
  );
}
