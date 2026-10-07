'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CompanyContract } from '@/types/database.types';
import { getContractPdfSignedUrl } from '@/lib/services/company-contracts';
import { 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Calendar, 
  Download, 
  ShieldCheck, 
  FileCheck,
  Clock,
  Plus,
  ExternalLink
} from 'lucide-react';
import { AddContractModal } from './AddContractModal';

interface CompanyContractsTabProps {
  companyId: string;
  companyName: string;
  usesTicketContract: boolean;
}

export default function CompanyContractsTab({
  companyId,
  companyName,
  usesTicketContract,
}: CompanyContractsTabProps) {
  const [contracts, setContracts] = useState<CompanyContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [canAddContract, setCanAddContract] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const checkUserPermissions = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (prof && (prof.role === 'SUPERADMIN' || prof.role === 'ADMIN')) {
        setCanAddContract(true);
      } else {
        setCanAddContract(false);
      }
    } catch (e) {
      console.warn('Error checking user contract permissions:', e);
      setCanAddContract(false);
    }
  }, []);

  const loadContracts = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('company_contracts')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContracts((data as CompanyContract[]) || []);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al cargar contratos corporativos');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadContracts();
    checkUserPermissions();
  }, [loadContracts, checkUserPermissions]);

  const activeContract = contracts.find((c) => c.status === 'active');

  const handleOpenPdf = async (pdfFilePath: string) => {
    try {
      const signedUrl = await getContractPdfSignedUrl(pdfFilePath);
      if (signedUrl) {
        window.open(signedUrl, '_blank');
      } else {
        alert('No se pudo generar el enlace de acceso al archivo PDF.');
      }
    } catch {
      alert('Error al acceder al documento PDF.');
    }
  };

  const getContractStatusBadge = (status: CompanyContract['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full font-bold text-[10px] uppercase flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Vigente (Active)
          </span>
        );
      case 'draft':
        return (
          <span className="px-2.5 py-0.5 bg-slate-500/10 border border-slate-500/30 text-slate-400 rounded-full font-bold text-[10px] uppercase">
            Borrador
          </span>
        );
      case 'suspended':
        return (
          <span className="px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-full font-bold text-[10px] uppercase">
            Suspendido
          </span>
        );
      case 'expired':
        return (
          <span className="px-2.5 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-full font-bold text-[10px] uppercase">
            Vencido
          </span>
        );
      case 'replaced':
        return (
          <span className="px-2.5 py-0.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-full font-bold text-[10px] uppercase">
            Reemplazado
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-0.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-full font-bold text-[10px] uppercase">
            Cancelado
          </span>
        );
      default:
        return <span className="text-slate-400 text-[10px]">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Feedback */}
      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Commercial Modality Summary Box */}
      <div className="p-4 bg-[#0F172A]/70 border border-sky-500/30 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white font-heading">Modalidad Comercial de Tickets</h4>
            <p className="text-[11px] text-slate-400">
              {usesTicketContract
                ? `La empresa "${companyName}" opera bajo modalidad comercial de Tickets Corporativos.`
                : `La empresa "${companyName}" no opera bajo modalidad comercial de Tickets Corporativos.`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-bold text-xs ${
            usesTicketContract
              ? 'bg-sky-500/10 border border-sky-500/30 text-sky-300'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}>
            {usesTicketContract ? 'Modalidad Habilitada' : 'Modalidad Inactiva'}
          </span>
        </div>
      </div>

      {/* Active Contract Alert Box */}
      {!loading && !errorMsg && contracts.length > 0 && (
        activeContract ? (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <FileCheck className="w-4 h-4" />
                <span>CONTRATO VIGENTE ACTUAL</span>
              </div>
              {getContractStatusBadge(activeContract.status)}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300 pt-1">
              <div>
                <span className="text-[10px] text-slate-500 block">Número de Contrato</span>
                <strong className="font-mono text-white">{activeContract.contract_number || 'Sin número registrado'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Vigencia</span>
                <strong className="font-mono text-white">
                  {activeContract.start_date ? new Date(activeContract.start_date).toLocaleDateString('es-BO') : 'N/A'} — {activeContract.end_date ? new Date(activeContract.end_date).toLocaleDateString('es-BO') : 'Indefinido'}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Documento Adjunto</span>
                {activeContract.pdf_file_path ? (
                  <button
                    onClick={() => handleOpenPdf(activeContract.pdf_file_path!)}
                    className="text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 text-[11px] hover:underline"
                  >
                    <Download className="w-3 h-3" /> PDF Disponible
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </button>
                ) : (
                  <span className="text-slate-500 italic text-[11px]">Sin PDF adjunto</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl flex items-center justify-between gap-3 text-slate-400 text-xs">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-500 flex-shrink-0" />
              <span>No existe un contrato con estado VIGENTE (Active) registrado para esta empresa.</span>
            </div>
            {canAddContract && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-[#0F172A] font-extrabold rounded-xl text-xs transition-all flex-shrink-0 shadow-md shadow-sky-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Contrato</span>
              </button>
            )}
          </div>
        )
      )}

      {/* Contracts History Table & Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-400" />
            <span>Historial de Contratos Corporativos ({contracts.length})</span>
          </h4>
          {canAddContract && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-[#0F172A] font-extrabold rounded-xl text-xs transition-all shadow-md shadow-sky-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Contrato</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
            <span className="text-xs">Cargando historial de contratos...</span>
          </div>
        ) : errorMsg ? (
          <div className="p-8 text-center text-rose-400 text-xs bg-rose-500/10 rounded-xl border border-rose-500/30 flex flex-col items-center gap-2">
            <AlertCircle className="w-6 h-6" />
            <span>No se pudo consultar el historial de contratos debido a un error de consulta o permisos.</span>
          </div>
        ) : contracts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs bg-[#0F172A]/50 rounded-xl border border-[#334155] space-y-3">
            <p>No existe ningún contrato registrado para esta empresa.</p>
            {canAddContract && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-[#0F172A] font-extrabold rounded-xl text-xs transition-all shadow-md shadow-sky-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Contrato</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#334155]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#334155] bg-[#0F172A]/80 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">N° Contrato</th>
                  <th className="py-3 px-4">Fecha Inicio</th>
                  <th className="py-3 px-4">Fecha Fin</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4">Observaciones / Notas</th>
                  <th className="py-3 px-4 text-right">Documento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#334155] text-slate-300 bg-[#1E293B]">
                {contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-[#334155]/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {c.contract_number || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {c.start_date ? new Date(c.start_date).toLocaleDateString('es-BO') : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {c.end_date ? new Date(c.end_date).toLocaleDateString('es-BO') : 'Indefinido'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {getContractStatusBadge(c.status)}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {c.notes || <span className="italic text-slate-600">Sin notas</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {c.pdf_file_path ? (
                        <button
                          onClick={() => handleOpenPdf(c.pdf_file_path!)}
                          className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium text-[11px] hover:underline"
                        >
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </button>
                      ) : (
                        <span className="text-slate-600 italic text-[10px]">Sin PDF</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Contract Modal */}
      <AddContractModal
        companyId={companyId}
        companyName={companyName}
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {
          loadContracts();
        }}
      />
    </div>
  );
}
