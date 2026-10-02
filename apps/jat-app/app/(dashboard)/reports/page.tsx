'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Topbar from '@/components/layout/Topbar';
import { 
  getExecutiveMetrics, 
  getDriverPerformanceReport, 
  getCompanyPerformanceReport, 
  getDailyMovementLogs, 
  exportExecutiveReportCSV,
  savePeriodClosing,
  ExecutiveMetrics, 
  DriverPerformanceReport, 
  CompanyPerformanceReport, 
  DailyMovementRow 
} from '@/lib/services/executive-reports';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { getJatOperationalWeek } from '@/lib/utils/date-helpers';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Printer, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Bike, 
  Building2, 
  Lock, 
  ShieldCheck, 
  FileText,
  CreditCard,
  PieChart,
  Users
} from 'lucide-react';
import Link from 'next/link';

export default function ExecutiveReportsPage() {
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
  const [driverReport, setDriverReport] = useState<DriverPerformanceReport[]>([]);
  const [companyReport, setCompanyReport] = useState<CompanyPerformanceReport[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tabs: 'kpis' | 'daily' | 'drivers' | 'companies' | 'close'
  const [activeTab, setActiveTab] = useState<'kpis' | 'daily' | 'drivers' | 'companies' | 'close'>('kpis');

  // Period Selector
  const [periodPreset, setPeriodPreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Global Closing Modal State
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [isClosingSuccess, setIsClosingSuccess] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    let startIso: string | undefined = undefined;
    let endIso: string | undefined = undefined;
    const now = new Date();

    if (periodPreset === 'today') {
      startIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
      endIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
    } else if (periodPreset === 'yesterday') {
      const yest = new Date(now);
      yest.setDate(now.getDate() - 1);
      startIso = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 0, 0, 0).toISOString();
      endIso = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 23, 59, 59, 999).toISOString();
    } else if (periodPreset === 'week') {
      const { startOfWeek, endOfWeek } = getJatOperationalWeek();
      startIso = startOfWeek.toISOString();
      endIso = endOfWeek.toISOString();
    } else if (periodPreset === 'month') {
      startIso = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).toISOString();
      endIso = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    } else if (periodPreset === 'custom') {
      startIso = new Date(`${startDate}T00:00:00`).toISOString();
      endIso = new Date(`${endDate}T23:59:59.999`).toISOString();
    }

    try {
      const [metRes, drvRes, compRes, logsRes] = await Promise.all([
        getExecutiveMetrics(startIso, endIso),
        getDriverPerformanceReport(startIso, endIso),
        getCompanyPerformanceReport(),
        getDailyMovementLogs(startIso, endIso),
      ]);

      if (metRes.metrics) setMetrics(metRes.metrics);
      if (drvRes.report) setDriverReport(drvRes.report);
      if (compRes.report) setCompanyReport(compRes.report);
      if (logsRes.logs) setDailyLogs(logsRes.logs);

      if (metRes.error) setErrorMsg(metRes.error.message);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al consolidar reportes ejecutivos');
    } finally {
      setLoading(false);
    }
  }, [periodPreset, startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Export Print PDF
  const handlePrint = () => {
    window.print();
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!metrics) return;
    const csvStr = exportExecutiveReportCSV(metrics, dailyLogs, driverReport, companyReport);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Ejecutivo_MotoJAT_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Execute Global Period Closing
  const handleConfirmGlobalClose = async () => {
    if (metrics) {
      await savePeriodClosing(metrics);
    }
    setIsClosingSuccess(true);
    setSuccessMsg(`Cierre Global de Período congelado y registrado en base de datos con éxito.`);
    setTimeout(() => {
      setIsClosingModalOpen(false);
      setIsClosingSuccess(false);
    }, 1500);
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <div className="print:hidden">
        <Topbar
          title="Movimiento Diario, Reportes Ejecutivos & Cierre Global"
          subtitle="Consolidación financiera estratégica MotoJAT, rentabilidad y auditoría de corte"
        />
      </div>

      <main className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 flex-1 max-w-[1700px] w-full mx-auto">
        {/* Feedback Banners */}
        {errorMsg && (
          <div className="print:hidden p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="print:hidden p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Toolbar Bar (Hidden on Print) */}
        <div className="print:hidden flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-[#1E293B] p-5 rounded-2xl border border-[#334155] shadow-lg">
          {/* Tab Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('kpis')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'kpis' ? 'bg-[#FDDE12] text-[#0F172A] shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Dashboard & KPIs</span>
            </button>

            <button
              onClick={() => setActiveTab('daily')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'daily' ? 'bg-[#FDDE12] text-[#0F172A] shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Movimiento Diario</span>
            </button>

            <button
              onClick={() => setActiveTab('drivers')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'drivers' ? 'bg-[#FDDE12] text-[#0F172A] shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Bike className="w-4 h-4" />
              <span>Reporte Motoqueros</span>
            </button>

            <button
              onClick={() => setActiveTab('companies')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'companies' ? 'bg-[#FDDE12] text-[#0F172A] shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Reporte Empresas</span>
            </button>

            <button
              onClick={() => setActiveTab('close')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'close' ? 'bg-purple-500 text-white shadow-md' : 'bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Cierre Global</span>
            </button>
          </div>

          {/* Period Selector & Exports */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={periodPreset}
              onChange={(e) => setPeriodPreset(e.target.value as 'today' | 'yesterday' | 'week' | 'month' | 'custom')}
              className="bg-[#0F172A] border border-[#334155] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#FDDE12]"
            >
              <option value="today">Jornada de Hoy</option>
              <option value="yesterday">Jornada de Ayer</option>
              <option value="week">Semana Actual</option>
              <option value="month">Mes Actual</option>
              <option value="custom">Rango Personalizado</option>
            </select>

            {periodPreset === 'custom' && (
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                preset={periodPreset}
                showPresets={false}
                onRangeChange={(s, e) => {
                  setStartDate(s);
                  setEndDate(e);
                  setPeriodPreset('custom');
                }}
              />
            )}

            <button
              onClick={handlePrint}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-[#FDDE12] border border-slate-700 rounded-xl"
              title="Exportar Reporte PDF Institucional"
            >
              <Printer className="w-4.5 h-4.5" />
            </button>

            <button
              onClick={handleExportCSV}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 rounded-xl"
              title="Exportar a Excel (CSV)"
            >
              <Download className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Loading Indicator */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
            <span className="text-xs">Consolidando matriz financiera y reportes ejecutivos...</span>
          </div>
        ) : !metrics ? (
          <p className="p-12 text-center text-slate-400 text-xs">No fue posible consolidar la matriz financiera.</p>
        ) : (
          <div className="space-y-6">
            {/* PRINTABLE INSTITUTIONAL HEADER */}
            <div className="hidden print:block bg-white text-slate-900 p-4 border-b-2 border-black space-y-1 mb-6">
              <h1 className="text-xl font-black font-heading">MOTOSERVI JUSTO A TIEMPO S.R.L.</h1>
              <p className="text-xs font-mono font-bold">INFORME EJECUTIVO GLOBAL DE MOVIMIENTO DIARIO Y COBRANZA</p>
              <p className="text-[10px] text-slate-600">
                Período: {new Date(metrics.period_start).toLocaleDateString('es-BO')} al {new Date(metrics.period_end).toLocaleDateString('es-BO')} • Fecha Emisión: {new Date().toLocaleString('es-BO')}
              </p>
            </div>

            {/* TAB 1: DASHBOARD & KPIS EXECUTIVOS */}
            {activeTab === 'kpis' && (
              <div className="space-y-6">
                {/* 4 MAIN FINANCIAL METRICS CARDS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Facturación Total */}
                  <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5 shadow-lg space-y-1">
                    <span className="text-[11px] text-slate-400 font-bold uppercase">FACTURACIÓN BRUTA TOTAL (T)</span>
                    <div className="text-2xl font-extrabold text-white font-mono">
                      Bs. {metrics.gross_facturacion.toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-400">{metrics.total_completed_rides} carreras completadas</p>
                  </div>

                  {/* Card 2: Efectivo Generado */}
                  <div className="bg-[#1E293B] border border-amber-500/30 rounded-2xl p-5 shadow-lg space-y-1">
                    <span className="text-[11px] text-amber-400 font-bold uppercase">💵 FACTURACIÓN EFECTIVO (E)</span>
                    <div className="text-2xl font-extrabold text-amber-400 font-mono">
                      Bs. {metrics.cash_facturacion.toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-400">Recibido en mano por motoqueros</p>
                  </div>

                  {/* Card 3: QR Central */}
                  <div className="bg-[#1E293B] border border-sky-500/30 rounded-2xl p-5 shadow-lg space-y-1">
                    <span className="text-[11px] text-sky-400 font-bold uppercase">📲 FACTURACIÓN PAGO QR</span>
                    <div className="text-2xl font-extrabold text-sky-400 font-mono">
                      Bs. {metrics.qr_facturacion.toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-400">Cobrado directamente en Central MotoJAT</p>
                  </div>

                  {/* Card 4: Tickets Corporativos */}
                  <div className="bg-[#1E293B] border border-purple-500/30 rounded-2xl p-5 shadow-lg space-y-1">
                    <span className="text-[11px] text-purple-400 font-bold uppercase">🎫 VALES CORPORATIVOS</span>
                    <div className="text-2xl font-extrabold text-purple-400 font-mono">
                      Bs. {metrics.ticket_facturacion.toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-400">Consumo a crédito corporativo</p>
                  </div>
                </div>

                {/* SECONDARY ROW: PAYOUT, RECEIVABLES & NET OPERATING RESULT */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#1E293B] border border-emerald-500/30 rounded-2xl p-5 shadow-lg space-y-1">
                    <span className="text-[11px] text-emerald-400 font-bold uppercase">GANANCIA 80% MOTOQUEROS</span>
                    <div className="text-xl font-extrabold text-emerald-400 font-mono">
                      Bs. {metrics.driver_payout_80.toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-400">Obligación total a liquidar a la flota</p>
                  </div>

                  <div className="bg-[#1E293B] border border-indigo-500/30 rounded-2xl p-5 shadow-lg space-y-1">
                    <span className="text-[11px] text-indigo-400 font-bold uppercase">POR COBRAR A EMPRESAS</span>
                    <div className="text-xl font-extrabold text-indigo-300 font-mono">
                      Bs. {metrics.company_accounts_receivable.toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-400">Saldo pendiente en cuentas corrientes</p>
                  </div>

                  <div className="bg-[#1E293B] border-2 border-[#FDDE12]/50 rounded-2xl p-5 shadow-xl space-y-1">
                    <span className="text-[11px] text-[#FDDE12] font-extrabold uppercase">RESULTADO NETO OPERATIVO CENTRAL</span>
                    <div className="text-xl font-extrabold text-white font-mono">
                      Bs. {metrics.net_operating_result.toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-400">Liquidez percibida Central MotoJAT</p>
                  </div>
                </div>

                {/* BREAKDOWN & TOP RANKINGS */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Top Drivers Ranking */}
                  <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5 shadow-lg space-y-4">
                    <div className="flex items-center justify-between border-b border-[#334155] pb-3">
                      <h3 className="font-bold text-sm text-white flex items-center gap-2">
                        <Bike className="w-4 h-4 text-[#FDDE12]" />
                        <span>Top Motoqueros por Facturación</span>
                      </h3>
                      <span className="text-[10px] text-slate-400 font-mono">{driverReport.length} conductores</span>
                    </div>

                    <div className="space-y-2.5">
                      {driverReport.slice(0, 5).map((d) => (
                        <div key={d.driver_id} className="p-3 bg-[#0F172A] border border-[#334155] rounded-xl flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-lg bg-slate-800 text-[#FDDE12] font-bold flex items-center justify-center font-mono">
                              #{d.movil_number}
                            </span>
                            <div>
                              <p className="font-bold text-white">{d.driver_name}</p>
                              <span className="text-[10px] text-slate-400">{d.total_rides} carreras completadas</span>
                            </div>
                          </div>
                          <span className="font-mono font-bold text-emerald-400">Bs. {d.gross_fare.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Companies Ranking */}
                  <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5 shadow-lg space-y-4">
                    <div className="flex items-center justify-between border-b border-[#334155] pb-3">
                      <h3 className="font-bold text-sm text-white flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-indigo-400" />
                        <span>Empresas Principales por Saldo</span>
                      </h3>
                      <span className="text-[10px] text-slate-400 font-mono">{companyReport.length} empresas</span>
                    </div>

                    <div className="space-y-2.5">
                      {companyReport.slice(0, 5).map((c) => (
                        <div key={c.company_id} className="p-3 bg-[#0F172A] border border-[#334155] rounded-xl flex items-center justify-between text-xs">
                          <div>
                            <p className="font-bold text-white">{c.business_name}</p>
                            <span className="text-[10px] text-slate-400">NIT: {c.nit || 'Sin NIT'}</span>
                          </div>
                          <div className="text-right font-mono">
                            <p className="font-bold text-indigo-300">Bs. {c.pending_balance.toFixed(2)}</p>
                            <span className="text-[10px] text-slate-500">{c.cobranza_status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: MOVIMIENTO DIARIO (LOG TABLE) */}
            {activeTab === 'daily' && (
              <div className="bg-[#1E293B] rounded-2xl border border-[#334155] overflow-hidden shadow-xl">
                <div className="p-4 bg-[#0F172A] border-b border-[#334155] font-bold text-xs text-white">
                  Desglose Diario de Movimientos ({dailyLogs.length} días)
                </div>

                {dailyLogs.length === 0 ? (
                  <p className="p-12 text-center text-slate-400 text-xs">No hay movimientos registrados en este rango de fechas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                      <thead>
                        <tr className="border-b border-[#334155] bg-[#0F172A]/50 text-slate-400 font-semibold uppercase">
                          <th className="py-3 px-4">Fecha</th>
                          <th className="py-3 px-4">Carreras</th>
                          <th className="py-3 px-4 text-right">Facturación Bruta</th>
                          <th className="py-3 px-4 text-right">Efectivo</th>
                          <th className="py-3 px-4 text-right">Pago QR</th>
                          <th className="py-3 px-4 text-right">Vales Tickets</th>
                          <th className="py-3 px-4 text-right">Motoqueros 80%</th>
                          <th className="py-3 px-4 text-right">Central 20%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#334155] text-slate-300">
                        {dailyLogs.map((l) => (
                          <tr key={l.date_label} className="hover:bg-[#334155]/30">
                            <td className="py-3 px-4 font-mono font-bold text-sky-400">{l.date_label}</td>
                            <td className="py-3 px-4 font-bold text-white">{l.total_rides}</td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-white">Bs. {l.gross_fare.toFixed(2)}</td>
                            <td className="py-3 px-4 text-right font-mono text-amber-400">Bs. {l.cash_fare.toFixed(2)}</td>
                            <td className="py-3 px-4 text-right font-mono text-sky-400">Bs. {l.qr_fare.toFixed(2)}</td>
                            <td className="py-3 px-4 text-right font-mono text-purple-400">Bs. {l.ticket_fare.toFixed(2)}</td>
                            <td className="py-3 px-4 text-right font-mono text-emerald-400 font-bold">Bs. {l.driver_80.toFixed(2)}</td>
                            <td className="py-3 px-4 text-right font-mono text-indigo-300 font-bold">Bs. {l.central_20.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: REPORTE POR MOTOQUERO */}
            {activeTab === 'drivers' && (
              <div className="bg-[#1E293B] rounded-2xl border border-[#334155] overflow-hidden shadow-xl">
                <div className="p-4 bg-[#0F172A] border-b border-[#334155] font-bold text-xs text-white">
                  Reporte de Performance de Flota ({driverReport.length} conductores)
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#334155] bg-[#0F172A]/50 text-slate-400 font-semibold uppercase">
                        <th className="py-3.5 px-4">Móvil & Conductor</th>
                        <th className="py-3.5 px-4">Carreras</th>
                        <th className="py-3.5 px-4 text-right">Facturación Bruta</th>
                        <th className="py-3.5 px-4 text-right">Efectivo Cobrado</th>
                        <th className="py-3.5 px-4 text-right">QR / Tickets</th>
                        <th className="py-3.5 px-4 text-right">80% Payout</th>
                        <th className="py-3.5 px-4 text-right">Estado Rendición</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#334155] text-slate-300">
                      {driverReport.map((d) => (
                        <tr key={d.driver_id} className="hover:bg-[#334155]/30">
                          <td className="py-3.5 px-4 font-bold text-white">
                            Móvil #{d.movil_number} ({d.driver_name})
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-200">{d.total_rides}</td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-white">Bs. {d.gross_fare.toFixed(2)}</td>
                          <td className="py-3.5 px-4 text-right font-mono text-amber-400">Bs. {d.cash_handled.toFixed(2)}</td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-300">Bs. {(d.qr_fare + d.ticket_fare).toFixed(2)}</td>
                          <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-bold">Bs. {d.driver_80_share.toFixed(2)}</td>
                          <td className="py-3.5 px-4 text-right">
                            {d.result_type === 'motojat_paga' && (
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">MOTOJAT PAGA</span>
                            )}
                            {d.result_type === 'motoquero_rinde' && (
                              <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold">MOTOQUERO RINDE</span>
                            )}
                            {d.result_type === 'conciliado' && (
                              <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded text-[10px] font-bold">CONCILIADO</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: REPORTE POR EMPRESA */}
            {activeTab === 'companies' && (
              <div className="bg-[#1E293B] rounded-2xl border border-[#334155] overflow-hidden shadow-xl">
                <div className="p-4 bg-[#0F172A] border-b border-[#334155] font-bold text-xs text-white">
                  Reporte de Cuentas Corrientes Corporativas ({companyReport.length} empresas)
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#334155] bg-[#0F172A]/50 text-slate-400 font-semibold uppercase">
                        <th className="py-3.5 px-4">Empresa Corporativa</th>
                        <th className="py-3.5 px-4">NIT</th>
                        <th className="py-3.5 px-4 text-right">Total Cargos (Vales)</th>
                        <th className="py-3.5 px-4 text-right">Total Pagos</th>
                        <th className="py-3.5 px-4 text-right">Saldo Pendiente</th>
                        <th className="py-3.5 px-4 text-right">Estado Cobranza</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#334155] text-slate-300">
                      {companyReport.map((c) => (
                        <tr key={c.company_id} className="hover:bg-[#334155]/30">
                          <td className="py-3.5 px-4 font-bold text-white">{c.business_name}</td>
                          <td className="py-3.5 px-4 font-mono text-slate-400">{c.nit || 'Sin NIT'}</td>
                          <td className="py-3.5 px-4 text-right font-mono text-purple-400 font-bold">Bs. {c.total_charges.toFixed(2)}</td>
                          <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-bold">Bs. {c.total_payments.toFixed(2)}</td>
                          <td className="py-3.5 px-4 text-right font-mono text-white font-extrabold">Bs. {c.pending_balance.toFixed(2)}</td>
                          <td className="py-3.5 px-4 text-right">
                            {c.cobranza_status === 'PAGADO' && (
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">PAGADO</span>
                            )}
                            {c.cobranza_status === 'PARCIALMENTE_PAGADO' && (
                              <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded text-[10px] font-bold">PARCIALMENTE PAGADO</span>
                            )}
                            {c.cobranza_status === 'PENDIENTE' && (
                              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold">PENDIENTE</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 5: CIERRE GLOBAL DE PERÍODO */}
            {activeTab === 'close' && (
              <div className="p-8 bg-[#1E293B] border-2 border-purple-500/40 rounded-2xl shadow-2xl space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-xl">
                    <Lock className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white font-heading">
                      Consola de Cierre Global Administrativo
                    </h3>
                    <p className="text-xs text-slate-400">
                      Verificación y congelamiento oficial de corte financiero para el período seleccionado
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-[#0F172A] p-5 rounded-xl border border-[#334155]">
                  <div className="space-y-2">
                    <p className="text-slate-400">Período Seleccionado: <strong className="text-white font-mono">{new Date(metrics.period_start).toLocaleDateString()} al {new Date(metrics.period_end).toLocaleDateString()}</strong></p>
                    <p className="text-slate-400">Total Facturado Bruto: <strong className="text-white font-mono">Bs. {metrics.gross_facturacion.toFixed(2)}</strong></p>
                    <p className="text-slate-400">Efectivo Rendición Flota: <strong className="text-amber-400 font-mono">Bs. {metrics.cash_facturacion.toFixed(2)}</strong></p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-slate-400">Comisión Central 20%: <strong className="text-purple-400 font-mono">Bs. {metrics.central_commission_20.toFixed(2)}</strong></p>
                    <p className="text-slate-400">Abonos Corporativos Recibidos: <strong className="text-emerald-400 font-mono">Bs. {metrics.total_corporate_payments.toFixed(2)}</strong></p>
                    <p className="text-slate-400">Resultado Neto Central: <strong className="text-[#FDDE12] font-mono">Bs. {metrics.net_operating_result.toFixed(2)}</strong></p>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#334155] flex justify-end">
                  <button
                    onClick={() => setIsClosingModalOpen(true)}
                    className="px-6 py-3 bg-purple-500 hover:bg-purple-400 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg active:scale-95"
                  >
                    <ShieldCheck className="w-5 h-5" />
                    <span>Ejecutar Cierre Global del Período</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* GLOBAL CLOSING CONFIRMATION MODAL */}
      {isClosingModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-scaleUp text-center">
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-2xl w-14 h-14 mx-auto flex items-center justify-center">
              <Lock className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white font-heading">
                Confirmar Cierre Global de Período
              </h3>
              <p className="text-xs text-slate-300 mt-2">
                Esta acción auditará y congelará la facturación de Bs. {metrics?.gross_facturacion.toFixed(2)} para el corte seleccionado.
              </p>
            </div>

            {isClosingSuccess ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <span>¡Cierre Global Ejecutado y Registrado!</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsClosingModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmGlobalClose}
                  className="px-5 py-2 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md"
                >
                  <span>Confirmar Cierre</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
