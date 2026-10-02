'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CompanyContract } from '@/types/database.types';
import { 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Calendar, 
  Download, 
  ShieldCheck, 
  FileCheck,
  Clock
} from 'lucide-react';

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
  }, [loadContracts]);

  const activeContract = contracts.find((c) => c.status === 'active');

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
      {activeContract ? (
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
                <span className="text-sky-400 font-medium flex items-center gap-1 text-[11px]">
                  <Download className="w-3 h-3" /> PDF Disponible
                </span>
              ) : (
                <span className="text-slate-500 italic text-[11px]">Sin PDF adjunto</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl flex items-center gap-3 text-slate-400 text-xs">
          <Clock className="w-5 h-5 text-slate-500 flex-shrink-0" />
          <span>No existe un contrato con estado VIGENTE (Active) registrado para esta empresa.</span>
        </div>
      )}

      {/* Contracts History Table */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-4 h-4 text-sky-400" />
          <span>Historial de Contratos Corporativos ({contracts.length})</span>
        </h4>

        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
            <span className="text-xs">Cargando historial de contratos...</span>
          </div>
        ) : contracts.length === 0 ? (
          <p className="p-8 text-center text-slate-500 text-xs bg-[#0F172A]/50 rounded-xl border border-[#334155]">
            No hay contratos registrados en el historial de esta empresa.
          </p>
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
                        <span className="inline-flex items-center gap-1 text-sky-400 font-medium text-[11px]">
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                        </span>
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
    </div>
  );
}
