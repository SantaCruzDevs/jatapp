'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RideWithDetails } from '@/lib/services/rides';
import { 
  Bike, 
  Search, 
  Loader2, 
  AlertCircle, 
  MapPin, 
  User, 
  Phone, 
  CheckCircle2, 
  Clock, 
  XCircle 
} from 'lucide-react';
import Link from 'next/link';

interface CompanyRidesTabProps {
  companyId: string;
}

export default function CompanyRidesTab({ companyId }: CompanyRidesTabProps) {
  const [rides, setRides] = useState<RideWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadRides = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = createClient();
      let query = supabase
        .from('rides')
        .select(`
          *,
          driver:drivers (
            id,
            movil_number,
            vehicle_type,
            vehicle_plate,
            profile:profiles (
              full_name,
              phone
            )
          ),
          customer:customers (
            id,
            full_name,
            phone
          ),
          company:companies (
            id,
            business_name
          )
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (search.trim() !== '') {
        const term = search.trim();
        query = query.or(`ride_code.ilike.%${term}%,requester_person.ilike.%${term}%,pickup_address.ilike.%${term}%,destination_address.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRides((data as RideWithDetails[]) || []);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al cargar historial de carreras');
    } finally {
      setLoading(false);
    }
  }, [companyId, search]);

  useEffect(() => {
    loadRides();
  }, [loadRides]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadRides();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full font-bold text-[10px] uppercase flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Completada
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-full font-bold text-[10px] uppercase flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Cancelada
          </span>
        );
      case 'ontheway':
        return (
          <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 rounded-full font-bold text-[10px] uppercase flex items-center gap-1">
            <Bike className="w-3 h-3 animate-pulse" />
            En Camino
          </span>
        );
      case 'assigned':
        return (
          <span className="px-2 py-0.5 bg-sky-500/10 border border-sky-500/30 text-sky-300 rounded-full font-bold text-[10px] uppercase flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Asignada
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-full font-bold text-[10px] uppercase">
            Pendiente
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Banner Feedback */}
      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0F172A]/70 p-4 rounded-xl border border-[#334155]">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2 font-heading">
            <Bike className="w-4 h-4 text-sky-400" />
            <span>Historial de Carreras Corporativas ({rides.length})</span>
          </h3>
          <p className="text-xs text-slate-400">
            Registro de servicios ejecutados para esta empresa
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código, solicitante, ruta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1E293B] border border-[#334155] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
          />
        </form>
      </div>

      {/* Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
          <span className="text-xs">Cargando historial de carreras...</span>
        </div>
      ) : rides.length === 0 ? (
        <p className="p-8 text-center text-slate-500 text-xs bg-[#0F172A]/50 rounded-xl border border-[#334155]">
          No se encontraron carreras registradas para esta empresa.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#334155]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#334155] bg-[#0F172A]/80 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Código / Fecha</th>
                <th className="py-3 px-4">Solicitante</th>
                <th className="py-3 px-4">Origen / Destino</th>
                <th className="py-3 px-4 text-center">Forma de Pago</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-right">Tarifa (Bs.)</th>
                <th className="py-3 px-4 text-right">Ticket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#334155] text-slate-300 bg-[#1E293B]">
              {rides.map((r) => (
                <tr key={r.id} className="hover:bg-[#334155]/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-mono font-bold text-white">{r.ride_code}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {new Date(r.created_at).toLocaleDateString('es-BO')} {new Date(r.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-200 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>{r.requester_person}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4 space-y-0.5">
                    <div className="text-slate-300 truncate max-w-xs text-[11px] flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <span>De: {r.pickup_address}</span>
                    </div>
                    <div className="text-slate-400 truncate max-w-xs text-[10px] flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-rose-400 flex-shrink-0" />
                      <span>A: {r.destination_address}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                      r.payment_method === 'Ticket'
                        ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {r.payment_method || 'N/A'}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-center">
                    {getStatusBadge(r.status)}
                  </td>

                  <td className="py-3 px-4 text-right font-mono font-bold text-white">
                    Bs. {Number(r.total_fare).toFixed(2)}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/tickets/${r.ride_code}`}
                      className="text-[11px] text-sky-400 hover:underline font-semibold"
                    >
                      Ver Ticket
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
