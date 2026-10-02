import React from 'react';
import Topbar from '@/components/layout/Topbar';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Building2, Wallet, FileText, CheckCircle2, ShieldCheck } from 'lucide-react';

export default async function CompanyAccountPortalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Resolve linked company via company_users using auth.uid()
  const { data: linkData } = await supabase
    .from('company_users')
    .select('company_id, companies(*)')
    .eq('profile_id', user.id)
    .single();

  const company = linkData?.companies as any;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <Topbar
        title={`Portal Empresa — ${company?.name || 'Cuenta Corporativa'}`}
        subtitle="Consulta de cuenta corriente, tickets corporativos e historial de servicios"
      />

      <main className="p-8 max-w-4xl space-y-6">
        {/* Banner Welcome */}
        <div className="bg-gradient-to-r from-[#1E293B] to-slate-900 border border-[#334155] rounded-2xl p-6 shadow-xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
              <Building2 className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-heading">{company?.name || 'Empresa Cliente'}</h2>
              <p className="text-xs text-slate-400">NIT/RUT: {company?.tax_id || company?.nit || 'Registrado'} • Estado: <span className="text-emerald-400 font-semibold">Activo</span></p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3.5 py-1.5 rounded-full font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Acceso Autorizado</span>
          </div>
        </div>

        {/* Info Card: Portal Activado */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 shadow-lg space-y-4">
          <div className="flex items-center gap-3 border-b border-[#334155] pb-4">
            <Wallet className="w-6 h-6 text-[#FDDE12]" />
            <div>
              <h3 className="text-base font-bold text-white font-heading">Estado de Cuenta Corriente</h3>
              <p className="text-xs text-slate-400">Resumen preliminar de movimientos y crédito corporativo</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="bg-[#0F172A] p-4 rounded-xl border border-[#334155]/60 space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Crédito Asignado</span>
              <span className="text-lg font-bold text-white font-heading">
                Bs. {Number(company?.credit_limit || 0).toFixed(2)}
              </span>
            </div>

            <div className="bg-[#0F172A] p-4 rounded-xl border border-[#334155]/60 space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Tickets Registrados</span>
              <span className="text-lg font-bold text-amber-400 font-heading">
                {company?.id ? 'Vincular Servicios' : '0'}
              </span>
            </div>

            <div className="bg-[#0F172A] p-4 rounded-xl border border-[#334155]/60 space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Estado del Portal</span>
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Feature Flag Activado</span>
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
