'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  getCompanyAccountSummary, 
  getCompanyAccountMovements, 
  registerCompanyPayment, 
  registerCompanyAdjustment, 
  CompanyAccountSummary, 
  CompanyMovement 
} from '@/lib/services/company-account';
import { getJatOperationalWeek } from '@/lib/utils/date-helpers';
import { 
  CreditCard, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  X, 
  Receipt 
} from 'lucide-react';
import Link from 'next/link';

interface CompanyAccountTabProps {
  companyId: string;
}

export default function CompanyAccountTab({ companyId }: CompanyAccountTabProps) {
  const [summary, setSummary] = useState<CompanyAccountSummary | null>(null);
  const [movements, setMovements] = useState<CompanyMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Date Filter
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // Modals
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const [sumRes, movRes] = await Promise.all([
        getCompanyAccountSummary(companyId, startIso, endIso),
        getCompanyAccountMovements(companyId, startIso, endIso),
      ]);

      if (sumRes.summary) setSummary(sumRes.summary);
      if (movRes.movements) setMovements(movRes.movements);

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

    setSuccessMsg(`Pago de Bs. ${Number(paymentAmount).toFixed(2)} registrado exitosamente.`);
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

  return (
    <div className="space-y-6">
      {/* Banner Feedback */}
      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toolbar Header Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-[#0F172A]/70 p-4 rounded-xl border border-[#334155]">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2 font-heading">
            <CreditCard className="w-4 h-4 text-[#FDDE12]" />
            <span>Estado de Cuenta Corriente</span>
          </h3>
          <p className="text-xs text-slate-400">
            Consolidado de consumos por vales corporativos, abonos recibidos y trazabilidad contable
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'week' | 'month')}
            className="bg-[#1E293B] border border-[#334155] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#FDDE12]"
          >
            <option value="all">Todo el Historial</option>
            <option value="today">Hoy</option>
            <option value="week">Esta Semana</option>
            <option value="month">Este Mes</option>
          </select>

          <button
            onClick={handleOpenPaymentModal}
            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-[#0F172A] font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95"
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
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
          <span className="text-xs">Cargando estado de cuenta financiera...</span>
        </div>
      ) : !summary ? (
        <p className="p-12 text-center text-slate-400 text-xs">No se encontró información financiera para esta empresa.</p>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0F172A]/70 border border-purple-500/30 rounded-xl p-4 space-y-1">
              <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider block">TOTAL CARGOS (C)</span>
              <div className="text-xl font-extrabold text-purple-400 font-mono">
                Bs. {summary.total_charges.toFixed(2)}
              </div>
              <p className="text-[10px] text-slate-400">Consumos por tickets completados</p>
            </div>

            <div className="bg-[#0F172A]/70 border border-emerald-500/30 rounded-xl p-4 space-y-1">
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">TOTAL PAGOS (P)</span>
              <div className="text-xl font-extrabold text-emerald-400 font-mono">
                Bs. {summary.total_payments.toFixed(2)}
              </div>
              <p className="text-[10px] text-slate-400">Abonos recibidos de la empresa</p>
            </div>

            <div className="bg-[#0F172A]/70 border border-sky-500/30 rounded-xl p-4 space-y-1">
              <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider block">TOTAL AJUSTES (A)</span>
              <div className="text-xl font-extrabold text-sky-400 font-mono">
                Bs. {summary.total_adjustments.toFixed(2)}
              </div>
              <p className="text-[10px] text-slate-400">Descuentos o notas aplicadas</p>
            </div>

            <div className="bg-[#0F172A]/70 border-2 border-[#FDDE12]/50 rounded-xl p-4 space-y-1 shadow-lg">
              <span className="text-[10px] text-[#FDDE12] font-extrabold uppercase tracking-wider block">SALDO PENDIENTE (S)</span>
              <div className="text-xl font-extrabold text-white font-mono">
                Bs. {summary.pending_balance.toFixed(2)}
              </div>
              <div className="pt-0.5">
                {summary.cobranza_status === 'PAGADO' && (
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">PAGADO</span>
                )}
                {summary.cobranza_status === 'PARCIALMENTE_PAGADO' && (
                  <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded text-[10px] font-bold">PARCIALMENTE PAGADO</span>
                )}
                {summary.cobranza_status === 'PENDIENTE' && (
                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold">PENDIENTE</span>
                )}
              </div>
            </div>
          </div>

          {/* Movements Table */}
          <div className="overflow-x-auto rounded-xl border border-[#334155]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#334155] bg-[#0F172A]/80 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Fecha & Hora</th>
                  <th className="py-3 px-4">Tipo Movimiento</th>
                  <th className="py-3 px-4">Comprobante / Carrera</th>
                  <th className="py-3 px-4">Solicitante & Ruta / Detalle</th>
                  <th className="py-3 px-4">Móvil</th>
                  <th className="py-3 px-4 text-right">Importe (Bs.)</th>
                  <th className="py-3 px-4 text-right">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#334155] text-slate-300 bg-[#1E293B]">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                      No hay movimientos financieros en el período seleccionado.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-[#334155]/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-300">
                        {new Date(m.date).toLocaleDateString('es-BO')} {new Date(m.date).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      <td className="py-3.5 px-4">
                        {m.type === 'CARGO' && (
                          <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/30 font-bold rounded text-[10px]">CARGO</span>
                        )}
                        {m.type === 'PAGO' && (
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold rounded text-[10px]">PAGO</span>
                        )}
                        {m.type === 'AJUSTE' && (
                          <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/30 font-bold rounded text-[10px]">AJUSTE</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        {m.ticket_code}
                        {m.ride_code && <span className="text-[10px] text-slate-400 block font-normal">Carrera: {m.ride_code}</span>}
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-200">{m.requester_person || m.notes}</p>
                        {m.destination_address && <p className="text-[10px] text-slate-400 truncate max-w-xs">{m.destination_address}</p>}
                      </td>

                      <td className="py-3.5 px-4 text-slate-400">
                        {m.driver_movil ? `Móvil #${m.driver_movil}` : '—'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                        {m.type === 'CARGO' ? `+ Bs. ${m.amount.toFixed(2)}` : m.type === 'PAGO' ? `- Bs. ${m.amount.toFixed(2)}` : `Bs. ${m.amount.toFixed(2)}`}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {m.ride_code ? (
                          <Link
                            href={`/tickets/${m.ride_code}`}
                            className="text-[11px] text-sky-400 hover:underline font-semibold"
                          >
                            Ver Ticket
                          </Link>
                        ) : (
                          <span className="text-slate-500 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: REGISTRAR PAGO CORPORATIVO */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                  step="0.50"
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                  step="0.50"
                  required
                  placeholder="Ej. -50.00 (Descuento) o 20.00 (Recargo)"
                  value={adjustmentAmount || ''}
                  onChange={(e) => setAdjustmentAmount(Number(e.target.value))}
                  className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#FDDE12]"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Usa valor negativo (ej. <span className="font-mono text-emerald-400">-50.00</span>) para notas de crédito o descuentos.
                </p>
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
    </div>
  );
}
