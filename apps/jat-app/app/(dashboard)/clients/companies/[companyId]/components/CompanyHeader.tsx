'use client';

import React from 'react';
import Link from 'next/link';
import { Company } from '@/types/database.types';
import { CustomerWithCompany } from '@/lib/services/customers';
import { 
  ArrowLeft, 
  Building2, 
  Star, 
  Phone, 
  IdCard, 
  FileText, 
  Plus, 
  Bike, 
  CreditCard,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';

interface CompanyHeaderProps {
  company: Company;
  primaryContact?: CustomerWithCompany | null;
  portalEnabled?: boolean;
  onOpenAddRequester?: () => void;
}

export default function CompanyHeader({
  company,
  primaryContact,
  portalEnabled = false,
  onOpenAddRequester,
}: CompanyHeaderProps) {
  const getStatusBadge = (status: Company['status']) => {
    if (status === 'active') {
      return (
        <span className="px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full font-bold text-[10px] uppercase">
          Activa
        </span>
      );
    }
    if (status === 'suspended') {
      return (
        <span className="px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-full font-bold text-[10px] uppercase">
          Suspendida
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-full font-bold text-[10px] uppercase">
        Inactiva
      </span>
    );
  };

  return (
    <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5 shadow-lg space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#334155] pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/clients"
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="Volver al directorio de clientes"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Clientes</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold flex-shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-white font-heading">{company.business_name}</h1>
                {getStatusBadge(company.status)}
                {company.uses_ticket_contract && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-sky-500/10 border border-sky-500/30 text-sky-300 rounded-full font-bold text-[10px]" title="Modalidad de Tickets Corporativos habilitada">
                    <FileText className="w-3 h-3" />
                    Ticket Corporativo
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                {company.trade_name && (
                  <span>Comercial: <strong className="text-slate-200">{company.trade_name}</strong></span>
                )}
                <span>NIT: <strong className="text-slate-200 font-mono">{company.nit || 'Sin NIT'}</strong></span>
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
          {onOpenAddRequester && (
            <button
              onClick={onOpenAddRequester}
              className="px-3.5 py-2 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Solicitante</span>
            </button>
          )}

          <Link
            href={`/operations?company_id=${company.id}`}
            className="px-3.5 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
          >
            <Bike className="w-4 h-4" />
            <span>Nueva Carrera</span>
          </Link>
        </div>
      </div>

      {/* Info Strip (Primary Contact + Portal Summary) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        {/* Primary Contact Box */}
        <div className="p-3 bg-[#0F172A]/70 border border-amber-500/30 rounded-xl flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0">
            <Star className="w-4 h-4 fill-amber-400" />
          </div>
          <div className="overflow-hidden">
            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">Contacto Principal</span>
            {primaryContact ? (
              <div className="text-xs space-y-0.5">
                <p className="font-bold text-white truncate">{primaryContact.full_name}</p>
                <p className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                  <span>Tel: {primaryContact.phone}</span>
                  {primaryContact.area && <span>• Área: {primaryContact.area}</span>}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Sin contacto principal asignado</p>
            )}
          </div>
        </div>

        {/* Portal Access Status Box */}
        <div className="p-3 bg-[#0F172A]/70 border border-[#334155] rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              portalEnabled ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-slate-800 text-slate-500 border border-slate-700'
            }`}>
              {portalEnabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Acceso al Portal Empresa</span>
              <p className="text-xs font-bold text-white">
                {portalEnabled ? 'Habilitado (Acceso vía NIT)' : 'Deshabilitado (Solo MotoJAT Admin)'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 font-mono block">Usuario Portal</span>
            <span className="text-xs font-mono font-semibold text-slate-300">
              {company.nit ? `NIT: ${company.nit}` : 'Sin NIT'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
