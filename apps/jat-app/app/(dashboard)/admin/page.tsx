import React from 'react';
import Topbar from '@/components/layout/Topbar';
import { getCurrentUserProfile } from '@/lib/services/auth-server';
import { ShieldCheck, Bike, Lock, CheckCircle, ShieldAlert } from 'lucide-react';

export default async function AdminDashboardPage() {
  const { user, profile } = await getCurrentUserProfile();

  const isSuperAdmin = profile?.role === 'SUPERADMIN';

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Topbar
        title="Dashboard Ejecutivo — Administración"
        subtitle="Vista panorámica de supervisión estratégica y control del sistema MotoJAT"
      />

      <main className="p-8 space-y-6">
        {/* Welcome Card */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 relative overflow-hidden shadow-lg">
          <div className="flex items-start justify-between relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] text-xs font-semibold px-3 py-1 rounded-full mb-3">
                {isSuperAdmin ? <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>Perfil Autenticado: {profile?.role || 'ADMIN'}</span>
              </div>
              <h2 className="text-2xl font-bold font-heading text-white">
                Bienvenido, {profile?.full_name || user?.email || 'Administrador'}
              </h2>
              <p className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Plataforma de Gestión Logística MotoJAT desplegada con Next.js 15, PostgreSQL y Row Level Security (RLS).
              </p>
            </div>
            <div className="hidden md:flex flex-col items-end text-xs text-slate-400">
              <span className="font-semibold text-slate-200">Organización:</span>
              <span className="text-[#FDDE12] font-semibold mt-0.5">MotoJAT Single-Company</span>
            </div>
          </div>
        </div>

        {/* Foundation Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5 flex items-start gap-4">
            <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-400 rounded-xl">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Esquema MotoJAT</h3>
              <p className="text-xs text-slate-400 mt-1">Base de datos optimizada sin capas multitenant innecesarias.</p>
            </div>
          </div>

          <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5 flex items-start gap-4">
            <div className="p-3 bg-sky-950/60 border border-sky-800 text-sky-400 rounded-xl">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Seguridad RLS Activa</h3>
              <p className="text-xs text-slate-400 mt-1">Políticas de seguridad forzadas a nivel de PostgreSQL.</p>
            </div>
          </div>

          <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5 flex items-start gap-4">
            <div className="p-3 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
              <Bike className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Soporte</h3>
              <p className="text-xs text-slate-400 mt-1">Acceso de soporte técnico configurado y protegido.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
