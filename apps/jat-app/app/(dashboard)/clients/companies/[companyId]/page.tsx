'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Topbar from '@/components/layout/Topbar';
import CompanyHeader from './components/CompanyHeader';
import CompanyOverviewTab from './components/CompanyOverviewTab';
import CompanyRequestersTab from './components/CompanyRequestersTab';
import CompanyContractsTab from './components/CompanyContractsTab';
import CompanyAccountTab from './components/CompanyAccountTab';
import CompanyRidesTab from './components/CompanyRidesTab';
import { getCompanies } from '@/lib/services/companies';
import { getCustomers, CustomerWithCompany } from '@/lib/services/customers';
import { getCompanyPortalEnabled } from '@/lib/services/system-settings';
import { Company } from '@/types/database.types';
import { 
  Building2, 
  Users, 
  FileText, 
  CreditCard, 
  Bike, 
  Loader2, 
  AlertCircle, 
  ArrowLeft 
} from 'lucide-react';
import Link from 'next/link';

import { EditCompanyModal } from './components/EditCompanyModal';

export type SubTab = 'resumen' | 'solicitantes' | 'contratos' | 'cuenta' | 'carreras';

interface CompanyDetailPageProps {
  params: Promise<{
    companyId: string;
  }>;
}

export default function CompanyDetailPage({ params }: CompanyDetailPageProps) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;

  const [company, setCompany] = useState<Company | null>(null);
  const [allCustomers, setAllCustomers] = useState<CustomerWithCompany[]>([]);
  const [portalEnabled, setPortalEnabled] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<SubTab>('resumen');
  const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadCompanyData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [companiesList, custRes, isPortalOn] = await Promise.all([
        getCompanies(),
        getCustomers(),
        getCompanyPortalEnabled(),
      ]);

      const foundComp = companiesList.find((c) => c.id === companyId);
      if (!foundComp) {
        setErrorMsg('La empresa solicitada no existe o fue eliminada.');
        setLoading(false);
        return;
      }

      setCompany(foundComp);
      setPortalEnabled(isPortalOn);
      setAllCustomers(custRes.data || []);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al cargar los datos de la empresa');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadCompanyData();
  }, [loadCompanyData]);

  // Requesters filtered specifically for this company
  const companyRequesters = allCustomers.filter((c) => c.company_id === companyId);
  const primaryContact = companyRequesters.find((c) => c.is_primary_contact) || null;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <Topbar
        title="Ficha Integrada de Empresa"
        subtitle="Centro de control comercial, operativo y financiero corporativo MotoJAT"
      />

      <main className="p-6 space-y-6 flex-1 max-w-7xl mx-auto w-full">
        {/* Banner Feedback Error */}
        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <Link href="/clients" className="px-3 py-1 bg-rose-500/20 text-rose-300 rounded-lg text-xs font-semibold hover:bg-rose-500/30 transition-colors">
              Volver a Clientes
            </Link>
          </div>
        )}

        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
            <span className="text-xs">Cargando información de la empresa...</span>
          </div>
        ) : !company ? (
          <div className="p-12 text-center text-slate-400 space-y-4">
            <Building2 className="w-12 h-12 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">Empresa no encontrada</p>
            <Link
              href="/clients"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#FDDE12] text-[#0F172A] font-bold rounded-xl text-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a Clientes</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Component */}
            <CompanyHeader
              company={company}
              primaryContact={primaryContact}
              portalEnabled={portalEnabled}
              onOpenAddRequester={() => setActiveTab('solicitantes')}
              onOpenEditCompany={() => setIsEditCompanyModalOpen(true)}
            />

            {/* Navigation Tabs Bar */}
            <div className="flex items-center gap-2 border-b border-[#334155] pb-3 overflow-x-auto">
              <button
                onClick={() => setActiveTab('resumen')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  activeTab === 'resumen'
                    ? 'bg-[#FDDE12] text-[#0F172A] shadow-md shadow-[#FDDE12]/20'
                    : 'bg-[#1E293B] text-slate-400 hover:text-white border border-[#334155]'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Resumen</span>
              </button>

              <button
                onClick={() => setActiveTab('solicitantes')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  activeTab === 'solicitantes'
                    ? 'bg-[#FDDE12] text-[#0F172A] shadow-md shadow-[#FDDE12]/20'
                    : 'bg-[#1E293B] text-slate-400 hover:text-white border border-[#334155]'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Solicitantes ({companyRequesters.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('contratos')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  activeTab === 'contratos'
                    ? 'bg-[#FDDE12] text-[#0F172A] shadow-md shadow-[#FDDE12]/20'
                    : 'bg-[#1E293B] text-slate-400 hover:text-white border border-[#334155]'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Contratos</span>
              </button>

              <button
                onClick={() => setActiveTab('cuenta')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  activeTab === 'cuenta'
                    ? 'bg-[#FDDE12] text-[#0F172A] shadow-md shadow-[#FDDE12]/20'
                    : 'bg-[#1E293B] text-slate-400 hover:text-white border border-[#334155]'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Estado de Cuenta</span>
              </button>

              <button
                onClick={() => setActiveTab('carreras')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  activeTab === 'carreras'
                    ? 'bg-[#FDDE12] text-[#0F172A] shadow-md shadow-[#FDDE12]/20'
                    : 'bg-[#1E293B] text-slate-400 hover:text-white border border-[#334155]'
                }`}
              >
                <Bike className="w-4 h-4" />
                <span>Historial de Carreras</span>
              </button>
            </div>

            {/* Sub-tab Content Containers */}
            <div className="bg-[#1E293B] rounded-2xl border border-[#334155] p-6 shadow-xl min-h-[300px]">
              {activeTab === 'resumen' && (
                <CompanyOverviewTab
                  company={company}
                  primaryContact={primaryContact}
                  requestersCount={companyRequesters.length}
                  portalEnabled={portalEnabled}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                />
              )}

              {activeTab === 'solicitantes' && (
                <CompanyRequestersTab
                  companyId={company.id}
                  companyName={company.business_name}
                  requesters={companyRequesters}
                  loading={loading}
                  onRefresh={loadCompanyData}
                />
              )}

              {activeTab === 'contratos' && (
                <CompanyContractsTab
                  companyId={company.id}
                  companyName={company.business_name}
                  usesTicketContract={company.uses_ticket_contract}
                />
              )}

              {activeTab === 'cuenta' && (
                <CompanyAccountTab companyId={company.id} />
              )}

              {activeTab === 'carreras' && (
                <CompanyRidesTab companyId={company.id} />
              )}
            </div>
          </div>
        )}

        {/* Edit Company Modal */}
        {company && (
          <EditCompanyModal
            company={company}
            isOpen={isEditCompanyModalOpen}
            onClose={() => setIsEditCompanyModalOpen(false)}
            onSuccess={(updated) => {
              setCompany(updated);
              loadCompanyData();
            }}
          />
        )}
      </main>
    </div>
  );
}
