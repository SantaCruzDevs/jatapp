'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Topbar from '@/components/layout/Topbar';
import { getDigitalTickets, DigitalTicket, formatPaymentMethodLabel } from '@/lib/services/tickets';
import { getCurrentUserProfileClient } from '@/lib/services/auth';
import { getDriverByProfileId } from '@/lib/services/drivers';
import { PaymentMethod, RideStatus } from '@/types/database.types';
import { 
  FileText, 
  Search, 
  Printer, 
  QrCode, 
  ExternalLink, 
  CheckCircle2, 
  Ban, 
  Clock, 
  Bike, 
  Building2, 
  DollarSign, 
  Loader2, 
  AlertCircle, 
  X,
  Filter
} from 'lucide-react';
import DateRangePicker from '@/components/ui/DateRangePicker';
import Link from 'next/link';

export default function TicketsPage() {
  const [tickets, setTickets] = useState<DigitalTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [settlementFilter, setSettlementFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  const [userRole, setUserRole] = useState<string>('ADMIN');
  const [driverId, setDriverId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Detect active user role and driver profile if DRIVER
      const profile = await getCurrentUserProfileClient();
      let drvId: string | undefined = undefined;

      if (profile) {
        setUserRole(profile.role);
        if (profile.role === 'DRIVER') {
          const { driver: drv } = await getDriverByProfileId(profile.id);
          if (drv) {
            drvId = drv.id;
            setDriverId(drv.id);
          }
        }
      }

      const pMethod = paymentFilter !== 'all' ? (paymentFilter as PaymentMethod) : undefined;
      const st = statusFilter !== 'all' ? (statusFilter as RideStatus) : undefined;
      const sFilter = settlementFilter !== 'all' ? (settlementFilter as 'pending_settlement' | 'settled') : undefined;

      const { data, error } = await getDigitalTickets({
        search: search,
        paymentMethod: pMethod,
        status: st,
        driverId: drvId,
        dateRange: dateRangeFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        settlementFilter: sFilter,
      });

      if (error) setErrorMsg(error.message);
      else setTickets(data || []);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al cargar comprobantes digitales');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, paymentFilter, settlementFilter, dateRangeFilter, startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const getStatusBadge = (status: RideStatus) => {
    if (status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold rounded-md text-[10px] uppercase">
          <CheckCircle2 className="w-3 h-3" />
          COMPLETADA
        </span>
      );
    }
    if (status === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold rounded-md text-[10px] uppercase">
          <Ban className="w-3 h-3" />
          CANCELADA
        </span>
      );
    }
    if (status === 'ontheway') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 font-bold rounded-md text-[10px] uppercase">
          <Bike className="w-3 h-3" />
          EN CAMINO
        </span>
      );
    }
    if (status === 'assigned') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 font-bold rounded-md text-[10px] uppercase">
          <Bike className="w-3 h-3" />
          ASIGNADO
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold rounded-md text-[10px] uppercase">
        <Clock className="w-3 h-3" />
        PENDIENTE
      </span>
    );
  };

  const getSettlementBadge = (status: 'COBRADO' | 'PENDIENTE DE LIQUIDACIÓN' | 'LIQUIDADO' | 'CANCELADO') => {
    if (status === 'PENDIENTE DE LIQUIDACIÓN') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold rounded-md text-[10px] uppercase">
          <Clock className="w-3 h-3" />
          PENDIENTE LIQUIDACIÓN
        </span>
      );
    }
    if (status === 'LIQUIDADO') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 font-bold rounded-md text-[10px] uppercase">
          <CheckCircle2 className="w-3 h-3" />
          LIQUIDADO
        </span>
      );
    }
    if (status === 'CANCELADO') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-500/10 border border-slate-500/30 text-slate-400 font-bold rounded-md text-[10px] uppercase">
          <Ban className="w-3 h-3" />
          N/A (CANCELADO)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold rounded-md text-[10px] uppercase">
        <CheckCircle2 className="w-3 h-3" />
        COBRADO
      </span>
    );
  };

  const isDriver = userRole === 'DRIVER';

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <Topbar
        title={isDriver ? "HISTORIAL DE CARRERAS" : "Catálogo Universal de Tickets Digitales"}
        subtitle={isDriver ? "Historial completo de mis carreras completadas y comprobantes de servicio" : "Emisión, visualización, impresión y verificación de comprobantes digitales de servicio MotoJAT"}
      />

      <main className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 flex-1 max-w-7xl mx-auto w-full">
        {/* Feedback Banner */}
        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Toolbar & Filters Bar */}
        <div className="flex flex-col gap-4 bg-[#1E293B] p-5 rounded-2xl border border-[#334155] shadow-lg">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white font-heading">
                  {isDriver ? "Historial de Carreras" : "Directorio de Comprobantes"} ({tickets.length})
                </h2>
                <p className="text-xs text-slate-400">
                  {isDriver ? "Carreras completadas, comprobantes y estado de liquidación de tickets" : "1 Carrera = 1 Comprobante Digital (Efectivo, QR o Vale Corporativo)"}
                </p>
              </div>
            </div>

            {/* Form & Search Filters */}
            <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar SJ-..., TC-..., JAT-..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value)}
                className="bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FDDE12]"
              >
                <option value="all">Todo el Historial</option>
                <option value="today">Hoy</option>
                <option value="week">Esta semana</option>
                <option value="month">Este mes</option>
                <option value="last_month">Mes anterior</option>
                <option value="last_3_months">Últimos 3 meses</option>
                <option value="custom">Rango Personalizado</option>
              </select>

              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FDDE12]"
              >
                <option value="all">Todas las formas de pago</option>
                <option value="Efectivo">Efectivo</option>
                <option value="QR">Pago QR</option>
                <option value="Ticket">Ticket</option>
              </select>

              <select
                value={settlementFilter}
                onChange={(e) => setSettlementFilter(e.target.value)}
                className="bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FDDE12]"
              >
                <option value="all">Todas las liquidaciones</option>
                <option value="pending_settlement">Pendientes de liquidación</option>
                <option value="settled">Liquidados</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FDDE12]"
              >
                <option value="all">Todos los estados</option>
                <option value="completed">Completadas</option>
                <option value="ontheway">En camino</option>
                <option value="assigned">Asignadas</option>
                <option value="cancelled">Anuladas / Canceladas</option>
              </select>
            </form>
          </div>

          {/* Custom Date Pickers & Range Selection */}
          {dateRangeFilter === 'custom' && (
            <div className="pt-3 border-t border-[#334155] flex flex-wrap items-center gap-3 text-xs">
              <span className="text-slate-400 flex items-center gap-1 font-semibold">
                Rango de Fechas:
              </span>
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                preset={dateRangeFilter}
                showPresets={false}
                onRangeChange={(s, e) => {
                  setStartDate(s);
                  setEndDate(e);
                  setDateRangeFilter('custom');
                }}
              />
              <button
                type="button"
                onClick={loadData}
                className="px-3.5 py-2 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl transition-all active:scale-95"
              >
                Aplicar Filtro
              </button>
            </div>
          )}
        </div>

        {/* Tickets Table */}
        <div className="bg-[#1E293B] rounded-2xl border border-[#334155] overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
              <span className="text-xs">Cargando historial de carreras...</span>
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
              <FileText className="w-12 h-12 text-slate-600" />
              <p className="text-sm font-semibold text-slate-300">No se encontraron carreras o comprobantes</p>
              <p className="text-xs text-slate-500 max-w-sm">
                {isDriver
                  ? "No se hallaron carreras propias que coincidan con los filtros seleccionados."
                  : "Ajusta los filtros de búsqueda para localizar comprobantes de carrera."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[750px]">
                <thead>
                  <tr className="border-b border-[#334155] bg-[#0F172A]/50 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Comprobante / Carrera</th>
                    <th className="py-3.5 px-4">Solicitante / Empresa</th>
                    {!isDriver && <th className="py-3.5 px-4">Motoquero</th>}
                    <th className="py-3.5 px-4">Fecha & Hora</th>
                    <th className="py-3.5 px-4">Forma de Pago</th>
                    <th className="py-3.5 px-4">Importe Total</th>
                    <th className="py-3.5 px-4">Estado Carrera</th>
                    <th className="py-3.5 px-4">Liquidación</th>
                    <th className="py-3.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#334155] text-slate-300">
                  {tickets.map((t) => {
                    const publicUrl = `/t/${t.rideCode}?t=${t.publicToken}`;
                    return (
                      <tr key={t.id} className="hover:bg-[#334155]/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <Link
                              href={`/tickets/${t.rideCode}`}
                              className="font-mono font-bold text-sky-400 hover:underline flex items-center gap-1.5"
                            >
                              <FileText className="w-3.5 h-3.5 text-sky-400" />
                              <span>{t.serviceCode || t.ticketCode}</span>
                            </Link>
                            {t.corporateTicketCode && t.corporateTicketCode !== (t.serviceCode || t.ticketCode) && (
                              <div className="text-[10px] text-indigo-300 font-mono font-bold">
                                Ticket: {t.corporateTicketCode}
                              </div>
                            )}
                            <div className="text-[10px] text-slate-500 font-mono">
                              Servicio: {t.rideCode}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div>
                            <p className="font-semibold text-white">{t.requester_person}</p>
                            <p className="text-[11px] text-indigo-300">{t.requester_company}</p>
                            {t.company_nit && (
                              <span className="text-[10px] text-slate-500 font-mono">NIT: {t.company_nit}</span>
                            )}
                          </div>
                        </td>

                        {!isDriver && (
                          <td className="py-3.5 px-4">
                            {t.driver_movil ? (
                              <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                                <Bike className="w-3.5 h-3.5" />
                                <span>Móvil #{t.driver_movil}</span>
                              </div>
                            ) : (
                              <span className="text-amber-400 italic text-[11px]">Sin Asignar</span>
                            )}
                          </td>
                        )}

                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                          <div>
                            {new Date(t.created_at).toLocaleDateString('es-BO', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(t.created_at).toLocaleTimeString('es-BO', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-200 rounded font-bold text-[11px]">
                            {formatPaymentMethodLabel(t.payment_method)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-white text-sm">
                          Bs. {t.total_fare.toFixed(2)}
                        </td>

                        <td className="py-3.5 px-4">{getStatusBadge(t.status)}</td>
                        <td className="py-3.5 px-4">{getSettlementBadge(t.settlement_status)}</td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/tickets/${t.rideCode}`}
                              title="Ver e Imprimir Ticket Digital"
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg font-medium text-[11px] flex items-center gap-1 transition-colors"
                            >
                              <Printer className="w-3.5 h-3.5 text-[#FDDE12]" />
                              <span>Ticket</span>
                            </Link>

                            <a
                              href={publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Verificación QR Pública Anti-manipulación"
                              className="p-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 rounded-lg transition-colors"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

