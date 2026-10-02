'use client';

import React from 'react';
import Link from 'next/link';
import { Company } from '@/types/database.types';
import { CustomerWithCompany } from '@/lib/services/customers';
import { 
  Building2, 
  Users, 
  Phone, 
  Loader2, 
  IdCard, 
  Star, 
  ExternalLink 
} from 'lucide-react';

interface CompaniesTableProps {
  companies: Company[];
  companySolicitanteCounts: Record<string, number>;
  companyPrimaryContacts: Record<string, CustomerWithCompany>;
  loading: boolean;
}

export default function CompaniesTable({
  companies,
  companySolicitanteCounts,
  companyPrimaryContacts,
  loading,
}: CompaniesTableProps) {
  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
        <span className="text-xs">Cargando directorio de empresas corporativas...</span>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
        <Building2 className="w-12 h-12 text-slate-600" />
        <p className="text-sm font-semibold text-slate-300">No se encontraron empresas corporativas</p>
        <p className="text-xs text-slate-500 max-w-sm">
          Utiliza el botón &quot;+ Nueva Empresa&quot; para registrar una empresa corporativa con su primer contacto.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#334155] bg-[#0F172A]/50 text-slate-400 font-semibold uppercase tracking-wider">
            <th className="py-3.5 px-4">Empresa / Razón Social</th>
            <th className="py-3.5 px-4">NIT</th>
            <th className="py-3.5 px-4">Contacto Principal</th>
            <th className="py-3.5 px-4 text-center">Solicitantes</th>
            <th className="py-3.5 px-4 text-center">Estado</th>
            <th className="py-3.5 px-4 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#334155] text-slate-300">
          {companies.map((comp) => {
            const count = companySolicitanteCounts[comp.id] || 0;
            const primaryContact = companyPrimaryContacts[comp.id];
            const isActive = comp.status ? comp.status === 'active' : true;

            return (
              <tr key={comp.id} className="hover:bg-[#334155]/30 transition-colors">
                {/* Razón Social & Nombre Comercial */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold flex-shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-semibold text-white">{comp.business_name}</p>
                      {comp.trade_name && (
                        <p className="text-[10px] text-slate-400">
                          Comercial: <span className="text-slate-300">{comp.trade_name}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                {/* NIT */}
                <td className="py-3.5 px-4">
                  {comp.nit ? (
                    <span className="inline-flex items-center gap-1 font-mono text-slate-200">
                      <IdCard className="w-3.5 h-3.5 text-slate-500" />
                      <span>{comp.nit}</span>
                    </span>
                  ) : (
                    <span className="text-slate-500 italic">Sin NIT</span>
                  )}
                </td>

                {/* Contacto Principal */}
                <td className="py-3.5 px-4">
                  {primaryContact ? (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-medium text-amber-300">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span>{primaryContact.full_name}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                        <Phone className="w-3 h-3 text-slate-500" />
                        <span>{primaryContact.phone}</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-500 italic">Sin asignar</span>
                  )}
                </td>

                {/* Solicitantes */}
                <td className="py-3.5 px-4 text-center">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-500/10 border border-sky-500/30 text-sky-300 rounded-lg font-bold text-[11px]">
                    <Users className="w-3.5 h-3.5" />
                    <span>{count}</span>
                  </span>
                </td>

                {/* Estado */}
                <td className="py-3.5 px-4 text-center">
                  {isActive ? (
                    <span className="inline-flex items-center px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full font-semibold text-[10px]">
                      Activa
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-full font-semibold text-[10px]">
                      Inactiva
                    </span>
                  )}
                </td>

                {/* Acciones */}
                <td className="py-3.5 px-4 text-right">
                  <Link
                    href={`/clients/companies/${comp.id}`}
                    title="Ver ficha integrada de la empresa"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg transition-colors font-medium text-[11px]"
                  >
                    <span>Ver Empresa</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
