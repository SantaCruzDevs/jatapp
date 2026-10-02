'use client';

import React, { useState, useEffect } from 'react';
import { Clock, ShieldCheck, Activity } from 'lucide-react';
import OfflineBanner from '@/components/offline/OfflineBanner';

interface TopbarProps {
  title: string;
  subtitle: string;
}

export default function Topbar({ title, subtitle }: TopbarProps) {
  const [timeString, setTimeString] = useState<string>('');

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
      <header className="h-20 bg-[#1E293B] border-b border-[#334155] px-8 flex items-center justify-between sticky top-0 z-20">
      <div>
        <h1 className="text-xl font-bold font-heading text-white tracking-tight">{title}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </div>

      <div className="flex items-center gap-6">
        {/* Live Clock */}
        <div className="flex items-center gap-2 text-xs text-slate-300 bg-[#0F172A] px-3.5 py-1.5 rounded-lg border border-[#334155]">
          <Clock className="w-3.5 h-3.5 text-[#FDDE12]" />
          <span className="font-mono font-medium">{timeString || 'Cargando hora...'}</span>
        </div>

        {/* Operational Status Badge */}
        <div className="flex items-center gap-2 text-xs bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-3 py-1.5 rounded-lg font-medium">
          <Activity className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
          <span>Sistema Activo</span>
        </div>

        {/* Environment Tag */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-[#0F172A] px-3 py-1.5 rounded-lg border border-[#334155]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#FDDE12]" />
          <span className="font-semibold text-slate-200">Producto Real</span>
        </div>
      </div>
    </header>
    </>
  );
}
