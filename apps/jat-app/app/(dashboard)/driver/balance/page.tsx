'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Topbar from '@/components/layout/Topbar';
import { getCurrentUserProfileClient } from '@/lib/services/auth';
import { getDriverByProfileId, DriverWithProfile } from '@/lib/services/drivers';
import { getDriverCashSummary, getDriverSettlements, DriverCashSummary, DriverSettlementWithDetails } from '@/lib/services/driver-settlements';
import { 
  Wallet, 
  Bike, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Star, 
  DollarSign, 
  Clock, 
  FileText,
  Calendar,
  CreditCard,
  QrCode,
  ArrowUpRight
} from 'lucide-react';
import Link from 'next/link';

type PeriodFilter = 'today' | 'week' | 'month' | 'last_month' | 'three_months' | 'all';

export default function DriverBalancePage() {
  const [driver, setDriver] = useState<DriverWithProfile | null>(null);
  const [cashSummary, setCashSummary] = useState<DriverCashSummary | null>(null);
  const [settlements, setSettlements] = useState<DriverSettlementWithDetails[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async (selectedPeriod: PeriodFilter) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const profile = await getCurrentUserProfileClient();
      if (!profile) {
        setErrorMsg('No se pudo verificar la sesión del conductor.');
        return;
      }

      const { driver: drv, error: drvErr } = await getDriverByProfileId(profile.id);
      if (drvErr || !drv) {
        setErrorMsg('Tu usuario no está asociado a un perfil de motoquero registrado en la flota.');
        return;
      }

      setDriver(drv);

      const [sumRes, setRes] = await Promise.all([
        getDriverCashSummary(drv.id, selectedPeriod),
        getDriverSettlements(drv.id),
      ]);

      if (sumRes.summary) setCashSummary(sumRes.summary);
      if (setRes.data) setSettlements(setRes.data);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error al cargar mi balance financiero');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(period);
  }, [period, loadData]);

  const totalBilled = cashSummary?.gross_amount || 0;
  const driver80Share = cashSummary?.driver_share_80 || 0;
  const cashCollected = cashSummary?.cash_amount || 0;
  const qrCollected = cashSummary?.qr_amount || 0;
  const ticketCollected = cashSummary?.ticket_amount || 0;
  const ticketPending = cashSummary?.ticket_pending_amount || 0;
  const ticketSettled = cashSummary?.ticket_settled_amount || 0;
  const totalRidesCount = cashSummary?.total_rides || 0;

  // Settlement Result Calculation (Financial 80/20 intact)
  // Motoquero keeps cash, owes 20% to MotoJAT. Difference = Efectivo Cobrado - Mi 80%
  const netResult = cashCollected - driver80Share;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <Topbar
        title="MI BALANCE"
        subtitle="Arqueo de caja personal, ganancias 80/20 y estado de liquidación de tickets"
      />

      <main className="p-6 space-y-6 flex-1 max-w-5xl mx-auto w-full">
        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
            <span className="text-xs">Cargando mi balance financiero...</span>
          </div>
        ) : !driver ? (
          <div className="p-8 bg-[#1E293B] border border-[#334155] rounded-2xl text-center text-slate-400 space-y-2">
            <Bike className="w-10 h-10 mx-auto text-[#FDDE12]" />
            <p className="text-sm font-semibold text-white">Sin Perfil de Conductor Asignado</p>
            <p className="text-xs">Solicita a un administrador vincular tu cuenta de usuario a un número de móvil de la flota.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Driver Card */}
            <div className="bg-[#1E293B] p-6 rounded-2xl border border-[#334155] shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#0F172A] border-2 border-[#FDDE12] text-[#FDDE12] font-black flex items-center justify-center text-xl shadow-md">
                  #{driver.movil_number}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white font-heading">
                      {driver.profile?.full_name || `Conductor Móvil #${driver.movil_number}`}
                    </h2>
                    <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold uppercase">
                      {driver.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Vehículo: <strong className="text-slate-200">{driver.vehicle_type}</strong> (Placa: <strong className="font-mono text-slate-200">{driver.vehicle_plate}</strong>) • Zona: {driver.zone}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-[#0F172A] px-4 py-2 rounded-xl border border-[#334155]">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="font-bold text-white text-sm">{Number(driver.rating).toFixed(1)}</span>
                <span className="text-xs text-slate-400">Calificación</span>
              </div>
            </div>

            {/* Time Filter Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#1E293B] p-4 rounded-2xl border border-[#334155]">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#FDDE12]" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Período de Balance</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 bg-[#0F172A] p-1 rounded-xl border border-[#334155] text-xs font-medium w-full sm:w-auto">
                <button
                  onClick={() => setPeriod('today')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    period === 'today' ? 'bg-[#FDDE12] text-[#0F172A] font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Hoy
                </button>
                <button
                  onClick={() => setPeriod('week')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    period === 'week' ? 'bg-[#FDDE12] text-[#0F172A] font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Esta Semana
                </button>
                <button
                  onClick={() => setPeriod('month')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    period === 'month' ? 'bg-[#FDDE12] text-[#0F172A] font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Este Mes
                </button>
                <button
                  onClick={() => setPeriod('last_month')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    period === 'last_month' ? 'bg-[#FDDE12] text-[#0F172A] font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Mes Anterior
                </button>
                <button
                  onClick={() => setPeriod('three_months')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    period === 'three_months' ? 'bg-[#FDDE12] text-[#0F172A] font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Últimos 3 Meses
                </button>
                <button
                  onClick={() => setPeriod('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    period === 'all' ? 'bg-[#FDDE12] text-[#0F172A] font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todo
                </button>
              </div>
            </div>

            {/* Main Financial Cards (80/20 intact) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-4 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">TOTAL FACTURADO</span>
                <div className="text-2xl font-extrabold text-white font-mono">Bs. {totalBilled.toFixed(2)}</div>
                <p className="text-[10px] text-slate-400">{totalRidesCount} carreras completadas</p>
              </div>

              <div className="bg-[#1E293B] border border-emerald-500/30 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] text-emerald-400 font-bold uppercase">MI 80% GANANCIA</span>
                <div className="text-2xl font-extrabold text-emerald-400 font-mono">Bs. {driver80Share.toFixed(2)}</div>
                <p className="text-[10px] text-slate-400">Ingreso neto motoquero (80/20)</p>
              </div>

              <div className="bg-[#1E293B] border border-amber-500/30 rounded-2xl p-4 space-y-1">
                <span className="text-[10px] text-amber-400 font-bold uppercase">EFECTIVO COBRADO</span>
                <div className="text-2xl font-extrabold text-amber-400 font-mono">Bs. {cashCollected.toFixed(2)}</div>
                <p className="text-[10px] text-slate-400">Cobrado directamente en mano</p>
              </div>

              <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-4 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">RESULTADO CONCILIACIÓN</span>
                {netResult > 0 ? (
                  <div className="text-2xl font-extrabold text-rose-400 font-mono">
                    - Bs. {netResult.toFixed(2)}
                  </div>
                ) : netResult < 0 ? (
                  <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                    + Bs. {Math.abs(netResult).toFixed(2)}
                  </div>
                ) : (
                  <div className="text-2xl font-extrabold text-sky-400 font-mono">Bs. 0.00</div>
                )}
                <p className="text-[10px] text-slate-400">
                  {netResult > 0 ? 'Debes rendir a Central' : netResult < 0 ? 'MotoJAT te paga a ti' : 'Caja conciliada'}
                </p>
              </div>
            </div>

            {/* Payment Method & Ticket Settlement Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-4 bg-[#1E293B] border border-[#334155] rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-slate-300 font-bold">
                  <span className="flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-amber-400" /> Efectivo:</span>
                  <span className="font-mono text-white text-sm">Bs. {cashCollected.toFixed(2)}</span>
                </div>
                <p className="text-[11px] text-slate-400">Cobrado inmediatamente en mano (Sin pendiente de liquidación).</p>
              </div>

              <div className="p-4 bg-[#1E293B] border border-[#334155] rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-slate-300 font-bold">
                  <span className="flex items-center gap-1.5"><QrCode className="w-4 h-4 text-sky-400" /> Pago QR:</span>
                  <span className="font-mono text-white text-sm">Bs. {qrCollected.toFixed(2)}</span>
                </div>
                <p className="text-[11px] text-slate-400">Cobrado inmediatamente vía QR Central (Sin pendiente de liquidación).</p>
              </div>

              <div className="p-4 bg-[#1E293B] border border-amber-500/30 rounded-2xl space-y-2 bg-amber-500/5">
                <div className="flex items-center justify-between text-amber-300 font-bold">
                  <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-amber-400" /> Tickets Pendientes:</span>
                  <span className="font-mono text-amber-400 text-sm">Bs. {ticketPending.toFixed(2)}</span>
                </div>
                <p className="text-[11px] text-slate-400">Carreras completadas con Ticket pendientes de conciliación con MotoJAT.</p>
              </div>

              <div className="p-4 bg-[#1E293B] border border-sky-500/30 rounded-2xl space-y-2 bg-sky-500/5">
                <div className="flex items-center justify-between text-sky-300 font-bold">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-sky-400" /> Tickets Liquidados:</span>
                  <span className="font-mono text-sky-400 text-sm">Bs. {ticketSettled.toFixed(2)}</span>
                </div>
                <p className="text-[11px] text-slate-400">Tickets corporativos ya conciliados y liquidados.</p>
              </div>
            </div>

            {/* Historical Settlements Section */}
            <div className="bg-[#1E293B] rounded-2xl border border-[#334155] overflow-hidden shadow-xl">
              <div className="p-4 bg-[#0F172A] border-b border-[#334155] font-bold text-xs text-white flex items-center justify-between">
                <span>Mis Liquidaciones Históricas ({settlements.length})</span>
                <span className="text-[10px] text-slate-400">Regla 80/20 Aprobada por Administración</span>
              </div>
              {settlements.length === 0 ? (
                <p className="p-8 text-center text-slate-500 text-xs">No hay liquidaciones cerradas registradas en el historial.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#334155] bg-[#0F172A]/50 text-slate-400 font-semibold uppercase">
                        <th className="py-3 px-4">Período</th>
                        <th className="py-3 px-4">Carreras</th>
                        <th className="py-3 px-4">Total Facturado</th>
                        <th className="py-3 px-4">Mi 80% Payout</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4">Fecha Cierre</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#334155] text-slate-300">
                      {settlements.map((st) => (
                        <tr key={st.id} className="hover:bg-[#334155]/30">
                          <td className="py-3 px-4 font-mono text-slate-300">
                            {new Date(st.period_start).toLocaleDateString('es-BO')} → {new Date(st.period_end).toLocaleDateString('es-BO')}
                          </td>
                          <td className="py-3 px-4 font-bold text-white">{st.total_rides}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-200">Bs. {Number(st.gross_amount).toFixed(2)}</td>
                          <td className="py-3 px-4 font-mono text-emerald-400 font-extrabold">Bs. {Number(st.driver_payout_amount).toFixed(2)}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">
                              {st.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {new Date(st.created_at).toLocaleDateString('es-BO')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
