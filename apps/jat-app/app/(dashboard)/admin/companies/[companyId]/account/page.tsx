'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Topbar from '@/components/layout/Topbar';
import { 
  getCompanyAccountSummary, 
  getCompanyAccountMovements, 
  getPaymentAllocatedRides,
  registerCompanyPayment, 
  registerCompanyAdjustment, 
  exportAccountStatementCSV,
  CompanyAccountSummary, 
  CompanyMovement,
  AllocatedRideItem
} from '@/lib/services/company-account';
import { getJatOperationalWeek } from '@/lib/utils/date-helpers';
import { 
  ArrowLeft,
  CreditCard,
  Plus,
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  X, 
  Receipt,
  Printer,
  Download,
  Eye,
  FileText,
  Edit3,
  Send
} from 'lucide-react';
import Link from 'next/link';
import { StatementPdfModal } from '@/app/(dashboard)/clients/companies/[companyId]/components/StatementPdfModal';
import { SelectedTicketDetailModal } from '@/app/(dashboard)/clients/companies/[companyId]/components/SelectedTicketDetailModal';
import { EditCompanyModal } from '@/app/(dashboard)/clients/companies/[companyId]/components/EditCompanyModal';
import { getPaymentLiquidationData, generatePaymentLiquidationPDF } from '@/lib/services/liquidation-pdf';
import { createClient } from '@/lib/supabase/client';

interface AdminCompanyAccountPageProps {
  params: Promise<{
    companyId: string;
  }>;
}

export default function AdminCompanyAccountPage({ params }: AdminCompanyAccountPageProps) {
  const resolvedParams = use(params);
  const companyId = resolvedParams.companyId;

  const [summary, setSummary] = useState<CompanyAccountSummary | null>(null);
  const [movements, setMovements] = useState<CompanyMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Company Email for PDF delivery
  const [companyEmail, setCompanyEmail] = useState<string | null>(null);

  // Date Filter
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Modals
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isStatementPdfModalOpen, setIsStatementPdfModalOpen] = useState(false);
  const [isEditCompanyModalOpen, setIsEditCompanyModalOpen] = useState(false);
  const [selectedPaymentForDetail, setSelectedPaymentForDetail] = useState<CompanyMovement | null>(null);
  const [selectedTicketForModal, setSelectedTicketForModal] = useState<{ rideId?: string; rideCode?: string; ticketCode?: string } | null>(null);
  const [allocatedRides, setAllocatedRides] = useState<AllocatedRideItem[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Liquidation PDF Actions States
  const [downloadingLiquidation, setDownloadingLiquidation] = useState(false);
  const [sendingLiquidationEmail, setSendingLiquidationEmail] = useState(false);

  // Liquidation Handlers
  const handleDownloadLiquidation = async (paymentId: string) => {
    setDownloadingLiquidation(true);
    try {
      const { payload, error } = await getPaymentLiquidationData(paymentId);
      if (error || !payload) {
        setErrorMsg(error?.message || 'Error al obtener datos de liquidación.');
        return;
      }
      const { pdfBlob, fileName } = generatePaymentLiquidationPDF(payload);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error al generar PDF de liquidación.');
    } finally {
      setDownloadingLiquidation(false);
    }
  };

  const handlePrintLiquidation = async (paymentId: string) => {
    setDownloadingLiquidation(true);
    try {
      const { payload, error } = await getPaymentLiquidationData(paymentId);
      if (error || !payload) {
        setErrorMsg(error?.message || 'Error al obtener datos de liquidación.');
        return;
      }
      const { pdfBlob } = generatePaymentLiquidationPDF(payload);
      const blobUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(blobUrl, '_blank');
      if (printWindow) {
        printWindow.focus();
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error al imprimir liquidación.');
    } finally {
      setDownloadingLiquidation(false);
    }
  };

  const handleSendLiquidationEmail = async (paymentId: string) => {
    if (!companyEmail) {
      setErrorMsg('Esta empresa no tiene un correo registrado en la base de datos.');
      return;
    }

    setSendingLiquidationEmail(true);
    setErrorMsg(null);
    try {
      const { payload, error } = await getPaymentLiquidationData(paymentId);
      if (error || !payload) {
        setErrorMsg(error?.message || 'Error al obtener datos de liquidación.');
        return;
      }

      const { pdfArrayBuffer } = generatePaymentLiquidationPDF(payload);
      const bytes = new Uint8Array(pdfArrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Pdf = btoa(binary);

      const res = await fetch('/api/companies/send-liquidation-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          payment_id: paymentId,
          pdf_base64: base64Pdf,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        setSuccessMsg(`Comprobante de Liquidación enviado a ${companyEmail}.`);
      } else {
        setErrorMsg(resData.error || 'Error al enviar el correo de liquidación.');
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error al enviar correo.');
    } finally {
      setSendingLiquidationEmail(false);
    }
  };

  // Payment Form Fields
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<string>('Transferencia');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState<string>('');

  // Adjustment Form Fields
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('');

  const handleOpenPaymentModal = () => {
    setPaymentAmount(0);
    setPaymentRef('');
    setPaymentNotes('');
    setPaymentIdempotencyKey(`pay_${companyId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
    setIsPaymentModalOpen(true);
  };

  const loadAccountData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    let startIso: string | undefined = undefined;
    let endIso: string | undefined = undefined;
    const now = new Date();

    if (dateFilter === 'today') {
      startIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
      endIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
    } else if (dateFilter === 'week') {
      const { startOfWeek, endOfWeek } = getJatOperationalWeek();
      startIso = startOfWeek.toISOString();
      endIso = endOfWeek.toISOString();
    } else if (dateFilter === 'month') {
      startIso = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).toISOString();
      endIso = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    }

    try {
      const supabase = createClient();
      const [sumRes, movRes, compRes] = await Promise.all([
        getCompanyAccountSummary(companyId, startIso, endIso),
        getCompanyAccountMovements(companyId, startIso, endIso),
        supabase.from('companies').select('email').eq('id', companyId).single(),
      ]);

      if (sumRes.summary) setSummary(sumRes.summary);
      if (movRes.movements) setMovements(movRes.movements);
      if (compRes.data?.email) setCompanyEmail(compRes.data.email);

      if (sumRes.error) setErrorMsg(sumRes.error.message);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al cargar estado de cuenta');
    } finally {
      setLoading(false);
    }
  }, [companyId, dateFilter]);

  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

  // Open Payment Allocations Detail Modal
  const handleOpenPaymentDetail = async (movement: CompanyMovement) => {
    setSelectedPaymentForDetail(movement);
    setLoadingAllocations(true);
    setAllocatedRides([]);

    const { allocations } = await getPaymentAllocatedRides(movement.id);
    setAllocatedRides(allocations);
    setLoadingAllocations(false);
  };

  // Submit Payment
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentAmount <= 0) {
      setErrorMsg('El importe del pago debe ser mayor a 0.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const keyToUse = paymentIdempotencyKey || `pay_${companyId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    if (!paymentIdempotencyKey) {
      setPaymentIdempotencyKey(keyToUse);
    }

    const { error } = await registerCompanyPayment({
      company_id: companyId,
      amount: Number(paymentAmount),
      payment_date: new Date(`${paymentDate}T12:00:00`).toISOString(),
      payment_method: paymentMethod,
      reference_number: paymentRef.trim() || null,
      notes: paymentNotes.trim() || null,
      idempotency_key: keyToUse,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSuccessMsg(`Pago de Bs. ${Number(paymentAmount).toFixed(2)} registrado e imputado exitosamente.`);
    setIsPaymentModalOpen(false);
    setPaymentAmount(0);
    setPaymentRef('');
    setPaymentNotes('');
    setPaymentIdempotencyKey('');
    loadAccountData();
  };

  // Submit Adjustment
  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentReason.trim()) {
      setErrorMsg('Debe ingresar un motivo para el ajuste.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const { error } = await registerCompanyAdjustment({
      company_id: companyId,
      amount: Number(adjustmentAmount),
      reason: adjustmentReason,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSuccessMsg(`Ajuste de Bs. ${Number(adjustmentAmount).toFixed(2)} registrado exitosamente.`);
    setIsAdjustmentModalOpen(false);
    setAdjustmentAmount(0);
    setAdjustmentReason('');
    loadAccountData();
  };

  // Print PDF
  const handlePrint = () => {
    window.print();
  };

  // Export Excel / CSV
  const handleExportCSV = () => {
    if (!summary) return;
    const csvStr = exportAccountStatementCSV(summary.company, movements, summary);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Estado_Cuenta_${summary.company.business_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <div className="print:hidden">
        <Topbar
          title="Cuenta Corriente & Estado de Cuenta"
          subtitle="Consolidado de consumos corporativos, pagos y trazabilidad financiera"
        />
      </div>

      <main className="p-6 space-y-6 flex-1 max-w-7xl mx-auto w-full">
        {/* Banner Feedback */}
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

        {/* Toolbar Header Bar */}
        <div className="print:hidden flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-[#1E293B] p-5 rounded-2xl border border-[#334155] shadow-lg">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/companies"
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors"
              title="Volver al catálogo de empresas"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h2 className="text-lg font-bold text-white font-heading">
                {summary?.company.business_name || 'Cargando Empresa...'}
              </h2>
              <p className="text-xs text-slate-400">
                NIT: <strong className="text-slate-200 font-mono">{summary?.company.nit || 'Sin NIT'}</strong> • Estado: {summary?.company.status.toUpperCase()}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'week' | 'month')}
              className="bg-[#0F172A] border border-[#334155] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#FDDE12]"
            >
              <option value="all">Todo el Historial</option>
              <option value="today">Hoy</option>
              <option value="week">Esta Semana</option>
              <option value="month">Este Mes</option>
            </select>

            <button
              onClick={() => setIsEditCompanyModalOpen(true)}
              className="px-3.5 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
              title="Editar datos generales y tributarios de la empresa"
            >
              <Edit3 className="w-4 h-4 text-sky-400" />
              <span>Editar Empresa</span>
            </button>

            <button
              onClick={handleOpenPaymentModal}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-[#0F172A] font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Pago</span>
            </button>

            <button
              onClick={() => setIsAdjustmentModalOpen(true)}
              className="px-3.5 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Ajuste</span>
            </button>

            <button
              onClick={() => setIsStatementPdfModalOpen(true)}
              className="px-3.5 py-2 bg-[#FDDE12]/10 hover:bg-[#FDDE12]/20 text-[#FDDE12] border border-[#FDDE12]/30 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>Generar Estado de Cuenta PDF</span>
            </button>

            <button
              onClick={handlePrint}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-[#FDDE12] border border-slate-700 rounded-xl"
              title="Imprimir Estado de Cuenta PDF"
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

        {/* Content Loading */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
            <span className="text-xs">Cargando estado de cuenta corriente...</span>
          </div>
        ) : !summary ? (
          <p className="p-12 text-center text-slate-400 text-xs">No se encontró la empresa solicitada.</p>
        ) : (
          <div className="space-y-6">
            {/* FINANCIAL SUMMARY CARD */}
            <div className="bg-[#1E293B] border-2 border-[#FDDE12]/50 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#FDDE12] uppercase tracking-wider">Saldo Pendiente Actual</span>
                  {summary.cobranza_status === 'PAGADO' && (
                    <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-[10px] font-bold">PAGADO</span>
                  )}
                  {summary.cobranza_status === 'PARCIALMENTE_PAGADO' && (
                    <span className="px-2.5 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded-full text-[10px] font-bold">PARCIALMENTE PAGADO</span>
                  )}
                  {summary.cobranza_status === 'PENDIENTE' && (
                    <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full text-[10px] font-bold">PENDIENTE</span>
                  )}
                </div>
                <div className="text-3xl sm:text-4xl font-black text-white font-mono mt-1">
                  Bs. {summary.pending_balance.toFixed(2)}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Saldo actual de la cuenta corporativa</p>
                {summary.tax_breakdown && summary.tax_breakdown.tax_mode !== 'SIN_FACTURA' && (
                  <div className="mt-2 pt-2 border-t border-[#334155]/80 flex flex-wrap items-center gap-4 text-xs font-mono">
                    <span className="text-slate-400">Subtotal Servicios: <strong className="text-white">Bs. {summary.subtotal_base.toFixed(2)}</strong></span>
                    <span className="text-amber-400 font-semibold">{summary.tax_breakdown.tax_rate_label}: <strong>+ Bs. {summary.tax_breakdown.tax_amount.toFixed(2)}</strong></span>
                    <span className="text-slate-300">Total Cargos: <strong>Bs. {summary.total_charges.toFixed(2)}</strong></span>
                  </div>
                )}
              </div>

              <div className="text-right text-xs text-slate-400 border-l border-slate-700 pl-4 py-1 hidden sm:block font-mono space-y-1">
                {summary.tax_breakdown && summary.tax_breakdown.tax_mode !== 'SIN_FACTURA' && (
                  <p>Subtotal Base: <span className="text-slate-300">Bs. {summary.subtotal_base.toFixed(2)}</span></p>
                )}
                <p>Consumos Totales: <span className="text-slate-200">Bs. {summary.total_charges.toFixed(2)}</span></p>
                <p>Pagos Recibidos: <span className="text-emerald-400">Bs. {summary.total_payments.toFixed(2)}</span></p>
                <p>Ajustes Aplicados: <span className="text-purple-300">Bs. {summary.total_adjustments.toFixed(2)}</span></p>
              </div>
            </div>

            {/* CHRONOLOGICAL MOVEMENTS TABLE (PRINTABLE FORM) */}
            <div className="bg-white text-slate-900 rounded-2xl border border-slate-200 overflow-hidden shadow-xl print:shadow-none print:border-none print:rounded-none">
              {/* Printable Header */}
              <div className="p-5 bg-[#0F172A] text-white border-b-4 border-[#FDDE12] flex items-center justify-between print:bg-white print:text-black print:border-b-2 print:border-black">
                <div>
                  <h3 className="text-base font-extrabold font-heading">
                    MOTOSERVI JUSTO A TIEMPO S.R.L.
                  </h3>
                  <p className="text-xs text-[#FDDE12] font-mono print:text-slate-700">
                    ESTADO DE CUENTA CORRIENTE CORPORATIVA — {summary.company.business_name}
                  </p>
                </div>

                <div className="text-right text-xs font-mono">
                  <p>NIT: {summary.company.nit || 'Sin NIT'}</p>
                  <p className="text-[10px] text-slate-400 print:text-slate-600">Emisión: {new Date().toLocaleDateString('es-BO')}</p>
                </div>
              </div>

              {movements.length === 0 ? (
                <p className="p-12 text-center text-slate-500 text-xs">No hay movimientos financieros registrados en el período seleccionado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-semibold uppercase">
                        <th className="py-3.5 px-4">Fecha & Hora</th>
                        <th className="py-3.5 px-4">Tipo Movimiento</th>
                        <th className="py-3.5 px-4">Comprobante / Referencia</th>
                        <th className="py-3.5 px-4">Detalle / Observaciones</th>
                        <th className="py-3.5 px-4 text-right">Importe (Bs.)</th>
                        <th className="py-3.5 px-4 text-right print:hidden">Trazabilidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800">
                      {movements.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-[11px]">
                            {new Date(m.date).toLocaleDateString('es-BO')} {new Date(m.date).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                          </td>

                          <td className="py-3.5 px-4">
                            {m.type === 'PAGO' && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded text-[10px]">PAGO</span>
                            )}
                            {m.type === 'AJUSTE' && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-300 font-bold rounded text-[10px]">AJUSTE</span>
                            )}
                            {m.type === 'CIERRE' && (
                              <span className="px-2 py-0.5 bg-sky-100 text-sky-800 border border-sky-300 font-bold rounded text-[10px]">CIERRE</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                            {m.ticket_code}
                            {m.reference_number && <span className="text-[10px] text-slate-500 block font-normal">Ref: {m.reference_number}</span>}
                          </td>

                          <td className="py-3.5 px-4">
                            <p className="text-slate-900">{m.notes}</p>
                            {m.payment_method && <span className="text-[10px] text-slate-500 block font-mono">Método: {m.payment_method}</span>}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                            {m.type === 'PAGO' ? `- Bs. ${m.amount.toFixed(2)}` : m.type === 'AJUSTE' ? `Bs. ${m.amount.toFixed(2)}` : `+ Bs. ${m.amount.toFixed(2)}`}
                          </td>

                          <td className="py-3.5 px-4 text-right print:hidden">
                            {m.type === 'PAGO' ? (
                              <button
                                onClick={() => handleOpenPaymentDetail(m)}
                                className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 hover:text-emerald-900 font-semibold bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver Tickets</span>
                              </button>
                            ) : (
                              <span className="text-slate-400 text-[10px]">—</span>
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
        )}
      </main>

      {/* MODAL 1: REGISTRAR PAGO CORPORATIVO */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg">
                  <CreditCard className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white font-heading">
                  Registrar Pago Corporativo
                </h3>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Importe del Pago (Bs.) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="Ej. 500.00"
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Fecha de Pago</label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Método de Pago</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-[#FDDE12]"
                >
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Cheque">Cheque Corporativo</option>
                  <option value="Efectivo">Efectivo en Oficina</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Número de Referencia / Comprobante</label>
                <input
                  type="text"
                  placeholder="Ej. TRANS-998124 o Cheque #401"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Observaciones</label>
                <textarea
                  rows={2}
                  placeholder="Abono a cuenta corriente correspondientes a quincena..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-[#0F172A] font-bold rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Registrar Pago</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REGISTRAR AJUSTE FINANCIERO */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-lg">
                  <Receipt className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white font-heading">
                  Registrar Ajuste Financiero
                </h3>
              </div>
              <button
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Importe del Ajuste (Bs.) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ej. -50.00 (Descuento) o 20.00 (Recargo)"
                  value={adjustmentAmount || ''}
                  onChange={(e) => setAdjustmentAmount(Number(e.target.value))}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Motivo / Justificación Autorizada <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ej. Aplicación de descuento corporativo convenio 2026..."
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                />
              </div>

              <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Registrar Ajuste</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DETALLE DE PAGO Y TICKETS CUBIERTOS (TRACEABILITY) */}
      {selectedPaymentForDetail && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Detalle del Pago {selectedPaymentForDetail.ticket_code}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Desglose de impositividad y tickets corporativos cubiertos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPaymentForDetail(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Payment Summary Box */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0F172A] p-4 rounded-xl border border-[#334155] text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Monto Registrado</span>
                <span className="text-sm font-bold text-white font-mono">Bs. {selectedPaymentForDetail.amount.toFixed(2)}</span>
              </div>

              <div>
                <span className="text-[10px] text-emerald-400 block font-semibold uppercase">Monto Aplicado</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  Bs. {(selectedPaymentForDetail.applied_amount !== undefined ? selectedPaymentForDetail.applied_amount : selectedPaymentForDetail.amount).toFixed(2)}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-sky-400 block font-semibold uppercase">Saldo a Favor</span>
                <span className="text-sm font-bold text-sky-400 font-mono">
                  Bs. {(selectedPaymentForDetail.overpayment_amount || 0).toFixed(2)}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Método / Ref</span>
                <span className="text-xs font-semibold text-slate-200 block truncate">
                  {selectedPaymentForDetail.payment_method || '—'}
                </span>
                {selectedPaymentForDetail.reference_number && (
                  <span className="text-[10px] font-mono text-slate-400 block truncate">
                    {selectedPaymentForDetail.reference_number}
                  </span>
                )}
              </div>
            </div>

            {/* Allocated Tickets Header */}
            <div>
              <h4 className="text-xs font-bold text-white mb-2 flex items-center justify-between">
                <span>Tickets / Carreras Cubiertos por este Pago ({allocatedRides.length})</span>
                {selectedPaymentForDetail.overpayment_amount && selectedPaymentForDetail.overpayment_amount > 0 ? (
                  <span className="text-[10px] text-sky-400 font-normal">
                    Excedente de Bs. {selectedPaymentForDetail.overpayment_amount.toFixed(2)} resguardado en Crédito
                  </span>
                ) : null}
              </h4>

              {loadingAllocations ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#FDDE12]" />
                  <span className="text-xs">Cargando tickets imputados...</span>
                </div>
              ) : allocatedRides.length === 0 ? (
                <div className="p-6 bg-[#0F172A]/50 border border-[#334155] rounded-xl text-center space-y-1">
                  <p className="text-xs text-slate-400">
                    Pago histórico registrado sin desglose individual de tickets.
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Los pagos nuevos realizan la imputación automática FIFO a cada carrera de la cuenta.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#334155]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#334155] bg-[#0F172A] text-slate-400 font-semibold uppercase text-[10px]">
                        <th className="py-2.5 px-3">Vale / Ticket</th>
                        <th className="py-2.5 px-3">Fecha Carrera</th>
                        <th className="py-2.5 px-3">Solicitante / Ruta</th>
                        <th className="py-2.5 px-3 text-right">Tarifa (Bs.)</th>
                        <th className="py-2.5 px-3 text-right">Monto Aplicado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#334155] text-slate-300 bg-[#1E293B]">
                      {allocatedRides.map((item) => (
                        <tr key={item.id} className="hover:bg-[#334155]/30">
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => setSelectedTicketForModal({ rideId: item.ride.id, rideCode: item.ride.ride_code, ticketCode: item.ride.ticket_code })}
                              className="font-mono font-bold text-[#FDDE12] hover:underline hover:text-yellow-300 block text-xs text-left"
                              title="Ver detalle completo del ticket corporativo"
                            >
                              {item.ride.ticket_code}
                            </button>
                            <span className="text-[10px] text-slate-400 font-mono">Carrera: {item.ride.ride_code}</span>
                          </td>

                          <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">
                            {new Date(item.ride.created_at).toLocaleString('es-BO', {
                              day: '2-digit',
                              month: '2-digit',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                              <span>{item.ride.requester_person || '—'}</span>
                              {item.ride.driver_movil && (
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 font-mono">
                                  Móvil {item.ride.driver_movil}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 block truncate max-w-xs">
                              {item.ride.pickup_address ? `${item.ride.pickup_address} → ${item.ride.destination_address || 'No registrado'}` : item.ride.destination_address || 'No registrado'}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                            Bs. {item.ride.total_fare.toFixed(2)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                            Bs. {item.amount_applied.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Document Action Buttons for Payment Liquidation */}
            <div className="pt-3 border-t border-[#334155] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadLiquidation(selectedPaymentForDetail.id)}
                  disabled={allocatedRides.length === 0 || downloadingLiquidation}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 font-semibold rounded-xl text-xs border border-slate-700 transition-colors disabled:opacity-40"
                  title={allocatedRides.length === 0 ? "Sin asignaciones para generar liquidación" : "Descargar comprobante de liquidación PDF"}
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar Liquidación PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePrintLiquidation(selectedPaymentForDetail.id)}
                  disabled={allocatedRides.length === 0 || downloadingLiquidation}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-[#FDDE12] font-semibold rounded-xl text-xs border border-slate-700 transition-colors disabled:opacity-40"
                  title={allocatedRides.length === 0 ? "Sin asignaciones para imprimir liquidación" : "Imprimir comprobante de liquidación"}
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendLiquidationEmail(selectedPaymentForDetail.id)}
                  disabled={allocatedRides.length === 0 || sendingLiquidationEmail || !companyEmail}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-[#0F172A] font-bold rounded-xl text-xs transition-colors disabled:opacity-40"
                  title={!companyEmail ? "Empresa sin correo registrado" : "Enviar comprobante de liquidación al correo del cliente"}
                >
                  {sendingLiquidationEmail ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Enviar al Cliente</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPaymentForDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Statement PDF Generation & Preview Modal */}
      <StatementPdfModal
        companyId={companyId}
        companyName={summary?.company.business_name || 'Empresa'}
        companyEmail={companyEmail}
        isOpen={isStatementPdfModalOpen}
        onClose={() => setIsStatementPdfModalOpen(false)}
      />

      {/* Selected Ticket Detail Modal */}
      <SelectedTicketDetailModal
        rideId={selectedTicketForModal?.rideId}
        rideCode={selectedTicketForModal?.rideCode}
        ticketCode={selectedTicketForModal?.ticketCode}
        isOpen={!!selectedTicketForModal}
        onClose={() => setSelectedTicketForModal(null)}
      />

      {/* Edit Company Modal */}
      {summary?.company && (
        <EditCompanyModal
          company={summary.company}
          isOpen={isEditCompanyModalOpen}
          onClose={() => setIsEditCompanyModalOpen(false)}
          onSuccess={() => {
            loadAccountData();
          }}
        />
      )}
    </div>
  );
}
