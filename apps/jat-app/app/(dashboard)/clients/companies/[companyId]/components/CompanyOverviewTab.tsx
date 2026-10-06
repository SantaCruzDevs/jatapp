'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Company, CompanyTaxMode } from '@/types/database.types';
import { CustomerWithCompany } from '@/lib/services/customers';
import { getCompanyAccountSummary, CompanyAccountSummary } from '@/lib/services/company-account';
import { updateCompany } from '@/lib/services/companies';
import { 
  Building2, 
  Star, 
  CreditCard, 
  ShieldCheck, 
  ShieldAlert, 
  FileText, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  Loader2, 
  Users,
  IdCard,
  CheckCircle2
} from 'lucide-react';
import Link from 'next/link';

import { EditCompanyModal } from './EditCompanyModal';

interface CompanyOverviewTabProps {
  company: Company;
  primaryContact: CustomerWithCompany | null;
  requestersCount: number;
  portalEnabled: boolean;
  onNavigateTab: (tab: 'solicitantes' | 'contratos' | 'cuenta' | 'carreras') => void;
  onOpenEditCompany?: () => void;
}

export default function CompanyOverviewTab({
  company,
  primaryContact,
  requestersCount,
  portalEnabled,
  onNavigateTab,
  onOpenEditCompany,
}: CompanyOverviewTabProps) {
  const [accountSummary, setAccountSummary] = useState<CompanyAccountSummary | null>(null);
  const [loadingFinancial, setLoadingFinancial] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoadingFinancial(true);
    try {
      const res = await getCompanyAccountSummary(company.id);
      if (res.summary) setAccountSummary(res.summary);
    } catch (e) {
      console.warn('Error loading financial overview summary:', e);
    } finally {
      setLoadingFinancial(false);
    }
  }, [company.id]);

  useEffect(() => {
    loadSummary();
  }, [company.tax_mode, loadSummary]);

  return (
    <div className="space-y-6">
      {/* 4 Quick Executive Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Requesters */}
        <div 
          onClick={() => onNavigateTab('solicitantes')}
          className="p-4 bg-[#0F172A]/70 border border-[#334155] hover:border-sky-500/50 rounded-xl space-y-1 cursor-pointer transition-all hover:bg-[#0F172A]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">SOLICITANTES</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">{requestersCount}</div>
          <p className="text-[10px] text-sky-400 hover:underline flex items-center gap-1 pt-0.5">
            Ver equipo autorizado →
          </p>
        </div>

        {/* Card 2: Financial Balance */}
        <div 
          onClick={() => onNavigateTab('cuenta')}
          className="p-4 bg-[#0F172A]/70 border border-purple-500/30 hover:border-purple-500/60 rounded-xl space-y-1 cursor-pointer transition-all hover:bg-[#0F172A]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">SALDO PENDIENTE</span>
            <CreditCard className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {loadingFinancial ? '...' : `Bs. ${(accountSummary?.pending_balance || 0).toFixed(2)}`}
          </div>
          <p className="text-[10px] text-purple-300 hover:underline flex items-center gap-1 pt-0.5">
            Ver estado de cuenta →
          </p>
        </div>

        {/* Card 3: Commercial Modality */}
        <div 
          onClick={() => onNavigateTab('contratos')}
          className="p-4 bg-[#0F172A]/70 border border-sky-500/30 hover:border-sky-500/60 rounded-xl space-y-1 cursor-pointer transition-all hover:bg-[#0F172A]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">MODALIDAD TICKET</span>
            <FileText className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-sm font-bold text-white pt-1">
            {company.uses_ticket_contract ? 'Ticket Corporativo' : 'Efectivo / QR Normal'}
          </div>
          <p className="text-[10px] text-sky-300 hover:underline flex items-center gap-1 pt-0.5">
            Ver contratos de tickets →
          </p>
        </div>

        {/* Card 4: Portal Access */}
        <div className="p-4 bg-[#0F172A]/70 border border-[#334155] rounded-xl space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">PORTAL EMPRESA</span>
            {portalEnabled ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <ShieldAlert className="w-4 h-4 text-slate-500" />}
          </div>
          <div className="text-sm font-bold text-white pt-1">
            {portalEnabled ? 'Habilitado' : 'Deshabilitado'}
          </div>
          <p className="text-[10px] text-slate-400 pt-0.5 font-mono">
            NIT: {company.nit || 'Sin NIT'}
          </p>
        </div>
      </div>

      {/* Main Info Blocks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Block A: General Business Data */}
        <div className="p-5 bg-[#0F172A]/70 border border-[#334155] rounded-xl space-y-3">
          <div className="flex items-center justify-between border-b border-[#334155] pb-2">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#FDDE12]" />
              <span>DATOS GENERALES DE LA EMPRESA</span>
            </h4>
            {onOpenEditCompany && (
              <button
                onClick={onOpenEditCompany}
                className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1"
                title="Editar datos de la empresa"
              >
                <FileText className="w-3 h-3 text-sky-400" />
                <span>Editar Empresa</span>
              </button>
            )}
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#334155]/50">
              <span className="text-slate-400">Razón Social:</span>
              <strong className="text-white font-semibold">{company.business_name}</strong>
            </div>

            {company.trade_name && (
              <div className="flex justify-between py-1 border-b border-[#334155]/50">
                <span className="text-slate-400">Nombre Comercial:</span>
                <strong className="text-slate-200">{company.trade_name}</strong>
              </div>
            )}

            <div className="flex justify-between py-1 border-b border-[#334155]/50">
              <span className="text-slate-400">NIT:</span>
              <strong className="text-slate-200 font-mono">{company.nit || 'Sin NIT registrado'}</strong>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-[#334155]/50">
              <span className="text-slate-400 flex items-center gap-1">
                <FileText className="w-3 h-3 text-amber-400" />
                Tratamiento Tributario:
              </span>
              <strong className="text-amber-300 font-semibold font-mono">
                {company.tax_mode === 'IVA_13'
                  ? 'Factura Directa IVA (13.00%)'
                  : company.tax_mode === 'EFECTIVA_14_94'
                  ? 'Impuesto Efectivo (14.94%)'
                  : 'Sin Impuesto (0.00%)'}
              </strong>
            </div>

            <div className="flex justify-between py-1 border-b border-[#334155]/50">
              <span className="text-slate-400">Teléfono Empresa:</span>
              <span className="text-slate-200 font-mono flex items-center gap-1">
                <Phone className="w-3 h-3 text-sky-400" />
                {company.phone || 'No registrado'}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b border-[#334155]/50">
              <span className="text-slate-400">Correo Electrónico:</span>
              <span className="text-slate-200 flex items-center gap-1">
                <Mail className="w-3 h-3 text-slate-400" />
                {company.email || 'No registrado'}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b border-[#334155]/50">
              <span className="text-slate-400">Dirección Corporativa:</span>
              <span className="text-slate-200 text-right truncate max-w-[200px] flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" />
                {company.address || 'No registrada'}
              </span>
            </div>

            <div className="flex justify-between py-1 pt-1">
              <span className="text-slate-400">Fecha de Registro:</span>
              <span className="text-slate-300 font-mono flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                {new Date(company.created_at).toLocaleDateString('es-BO')}
              </span>
            </div>
          </div>
        </div>

        {/* Block B: Primary Contact Summary */}
        <div className="p-5 bg-[#0F172A]/70 border border-amber-500/30 rounded-xl space-y-3">
          <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider border-b border-amber-500/20 pb-2 flex items-center gap-2">
            <Star className="w-4 h-4 fill-amber-400" />
            <span>CONTACTO PRINCIPAL AUTORIZADO</span>
          </h4>

          {primaryContact ? (
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-xl border border-slate-700">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold text-sm uppercase">
                  {primaryContact.full_name.slice(0, 2)}
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{primaryContact.full_name}</p>
                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold">
                    Contacto Principal
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between py-1 border-b border-[#334155]/50">
                  <span className="text-slate-400">Teléfono Móvil:</span>
                  <strong className="text-slate-200 font-mono">{primaryContact.phone}</strong>
                </div>

                {primaryContact.area && (
                  <div className="flex justify-between py-1 border-b border-[#334155]/50">
                    <span className="text-slate-400">Área / Departamento:</span>
                    <span className="text-slate-200">{primaryContact.area}</span>
                  </div>
                )}

                {primaryContact.position && (
                  <div className="flex justify-between py-1 border-b border-[#334155]/50">
                    <span className="text-slate-400">Cargo / Puesto:</span>
                    <span className="text-slate-200">{primaryContact.position}</span>
                  </div>
                )}

                {primaryContact.ci && (
                  <div className="flex justify-between py-1 border-b border-[#334155]/50">
                    <span className="text-slate-400">CI:</span>
                    <span className="text-slate-200 font-mono">{primaryContact.ci}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-slate-400 space-y-2">
              <Star className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">No hay un contacto principal designado para esta empresa.</p>
              <button
                onClick={() => onNavigateTab('solicitantes')}
                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl font-bold text-xs"
              >
                Ir a Solicitantes para asignar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
