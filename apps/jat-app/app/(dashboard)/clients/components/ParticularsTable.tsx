'use client';

import React from 'react';
import { CustomerWithCompany, normalizePhone } from '@/lib/services/customers';
import { 
  Users, 
  Phone, 
  Mail, 
  Edit, 
  Loader2, 
  IdCard, 
  MapPin, 
  Hash 
} from 'lucide-react';

interface ParticularsTableProps {
  customers: CustomerWithCompany[];
  loading: boolean;
  onEdit: (customer: CustomerWithCompany) => void;
}

export default function ParticularsTable({
  customers,
  loading,
  onEdit,
}: ParticularsTableProps) {
  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
        <span className="text-xs">Cargando directorio de clientes particulares...</span>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
        <Users className="w-12 h-12 text-slate-600" />
        <p className="text-sm font-semibold text-slate-300">No se encontraron clientes particulares</p>
        <p className="text-xs text-slate-500 max-w-sm">
          Utiliza el botón &quot;+ Nuevo Particular&quot; para registrar un cliente particular.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs min-w-[650px]">
        <thead>
          <tr className="border-b border-[#334155] bg-[#0F172A]/50 text-slate-400 font-semibold uppercase tracking-wider">
            <th className="py-3.5 px-4">Cliente Particular</th>
            <th className="py-3.5 px-4">CI</th>
            <th className="py-3.5 px-4">Teléfono & Normalizado</th>
            <th className="py-3.5 px-4">Correo / Dirección</th>
            <th className="py-3.5 px-4 text-center">Estado</th>
            <th className="py-3.5 px-4 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#334155] text-slate-300">
          {customers.map((c) => {
            const norm = normalizePhone(c.phone);
            const isActive = c.is_active !== undefined ? c.is_active : true;

            return (
              <tr key={c.id} className="hover:bg-[#334155]/30 transition-colors">
                {/* Nombre Completo */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 text-[#FDDE12] flex items-center justify-center font-bold text-xs uppercase flex-shrink-0">
                      {c.full_name.slice(0, 2)}
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-semibold text-white">{c.full_name}</p>
                      <span className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px]">
                        Particular
                      </span>
                    </div>
                  </div>
                </td>

                {/* CI */}
                <td className="py-3.5 px-4">
                  {c.ci ? (
                    <span className="inline-flex items-center gap-1 font-mono text-slate-200">
                      <IdCard className="w-3.5 h-3.5 text-slate-500" />
                      <span>{c.ci}</span>
                    </span>
                  ) : (
                    <span className="text-slate-500 italic">Sin CI</span>
                  )}
                </td>

                {/* Teléfono */}
                <td className="py-3.5 px-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-slate-200 font-mono">
                      <Phone className="w-3.5 h-3.5 text-sky-400" />
                      <span>{c.phone}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                      <Hash className="w-3 h-3" />
                      <span>{norm}</span>
                    </div>
                  </div>
                </td>

                {/* Correo / Dirección */}
                <td className="py-3.5 px-4 text-slate-400">
                  <div className="space-y-0.5">
                    {c.email ? (
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                        <span>{c.email}</span>
                      </div>
                    ) : null}
                    {c.address ? (
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span>{c.address}</span>
                      </div>
                    ) : null}
                    {!c.email && !c.address && (
                      <span className="text-slate-500 italic">No registrado</span>
                    )}
                  </div>
                </td>

                {/* Estado */}
                <td className="py-3.5 px-4 text-center">
                  {isActive ? (
                    <span className="inline-flex items-center px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full font-semibold text-[10px]">
                      Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-full font-semibold text-[10px]">
                      Inactivo
                    </span>
                  )}
                </td>

                {/* Acciones */}
                <td className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => onEdit(c)}
                      title="Editar cliente particular"
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
