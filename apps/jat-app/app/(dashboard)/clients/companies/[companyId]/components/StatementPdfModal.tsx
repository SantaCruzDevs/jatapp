'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  X, 
  FileText, 
  Download, 
  Send, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Calendar,
  Eye,
  Mail
} from 'lucide-react';
import { 
  getPendingStatementData, 
  generateCorporateStatementPDF, 
  CorporateStatementPayload 
} from '@/lib/services/statement-pdf';

interface StatementPdfModalProps {
  companyId: string;
  companyName: string;
  companyEmail?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function StatementPdfModal({
  companyId,
  companyName,
  companyEmail,
  isOpen,
  onClose,
}: StatementPdfModalProps) {
  const [periodFilter, setPeriodFilter] = useState<'all_pending' | 'current_month' | 'last_month' | 'custom'>('all_pending');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [payload, setPayload] = useState<CorporateStatementPayload | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfArrayBuffer, setPdfArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [sendingEmail, setSendingEmail] = useState<boolean>(false);
  const [emailStatusMsg, setEmailStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const prevUrlRef = useRef<string | null>(null);

  const loadAndGeneratePdf = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setEmailStatusMsg(null);

    const { payload: data, error } = await getPendingStatementData(
      companyId,
      periodFilter,
      customStart || undefined,
      customEnd || undefined
    );

    if (error || !data) {
      setErrorMsg(error?.message || 'Error al obtener datos del estado de cuenta.');
      setLoading(false);
      return;
    }

    setPayload(data);

    try {
      const { pdfBlob: blob, pdfArrayBuffer: buffer, fileName: name } = generateCorporateStatementPDF(data);

      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
      }

      const url = URL.createObjectURL(blob);
      prevUrlRef.current = url;

      setPdfBlob(blob);
      setPdfArrayBuffer(buffer);
      setFileName(name);
      setPreviewUrl(url);
    } catch (genErr: unknown) {
      console.error('Error generating PDF:', genErr);
      setErrorMsg('Error al construir el documento PDF.');
    } finally {
      setLoading(false);
    }
  }, [companyId, periodFilter, customStart, customEnd]);

  useEffect(() => {
    if (isOpen) {
      loadAndGeneratePdf();
    }
    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
    };
  }, [isOpen, loadAndGeneratePdf]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!pdfBlob || !fileName) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(pdfBlob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSendEmail = async () => {
    if (!companyEmail) {
      setEmailStatusMsg({
        type: 'error',
        text: 'Esta empresa no tiene un correo registrado en su perfil. Configure un correo antes de enviar.',
      });
      return;
    }

    if (!pdfArrayBuffer || !payload) {
      setEmailStatusMsg({ type: 'error', text: 'El PDF aún no ha sido generado.' });
      return;
    }

    setSendingEmail(true);
    setEmailStatusMsg(null);

    try {
      // Convert ArrayBuffer to Base64
      const bytes = new Uint8Array(pdfArrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Pdf = btoa(binary);

      const res = await fetch('/api/companies/send-statement-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          recipient_email: companyEmail,
          period_label: payload.period_label,
          total_pending: payload.summary.total_pending,
          pdf_base64: base64Pdf,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        setEmailStatusMsg({
          type: 'success',
          text: `Estado de Cuenta enviado exitosamente a ${companyEmail}.`,
        });
      } else {
        setEmailStatusMsg({
          type: 'error',
          text: resData.error || 'No se pudo enviar el correo electrónico.',
        });
      }
    } catch (err: unknown) {
      setEmailStatusMsg({
        type: 'error',
        text: (err as Error).message || 'Error de red al enviar correo.',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-scaleUp">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#334155] bg-[#0F172A]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-heading flex items-center gap-2">
                Estado de Cuenta Corporativo
                <span className="text-xs font-normal text-[#FDDE12] bg-[#FDDE12]/10 px-2 py-0.5 rounded-full border border-[#FDDE12]/20">
                  {companyName}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Previsualización formal de cobro y conciliación de tickets adeudados
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-[#1E293B] border-b border-[#334155] px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium">
              <Calendar className="w-4 h-4 text-[#FDDE12]" />
              <span>Período:</span>
            </div>

            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as any)}
              className="bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-1.5 text-white font-medium focus:outline-none focus:border-[#FDDE12]"
            >
              <option value="all_pending">Todos los pendientes (Recomendado)</option>
              <option value="current_month">Mes Actual</option>
              <option value="last_month">Mes Anterior</option>
              <option value="custom">Rango Personalizado</option>
            </select>

            {periodFilter === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-[#0F172A] border border-[#334155] rounded-xl px-2.5 py-1 text-white focus:outline-none focus:border-[#FDDE12]"
                />
                <span className="text-slate-500">a</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-[#0F172A] border border-[#334155] rounded-xl px-2.5 py-1 text-white focus:outline-none focus:border-[#FDDE12]"
                />
              </div>
            )}
          </div>

          {payload && (
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="bg-[#0F172A] px-3 py-1.5 rounded-lg border border-[#334155] text-slate-300">
                Tickets: <strong className="text-white">{payload.summary.total_pending_tickets}</strong>
              </div>
              <div className="bg-[#0F172A] px-3 py-1.5 rounded-lg border border-[#334155] text-slate-300">
                Pendiente: <strong className="text-[#FDDE12]">Bs. {payload.summary.total_pending.toFixed(2)}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Email Status Toast Notification */}
        {emailStatusMsg && (
          <div
            className={`px-6 py-2.5 text-xs flex items-center justify-between border-b ${
              emailStatusMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {emailStatusMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400" />
              )}
              <span>{emailStatusMsg.text}</span>
            </div>
            <button onClick={() => setEmailStatusMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* PDF Previewer Workspace Area */}
        <div className="flex-1 bg-[#0F172A] relative overflow-hidden flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
              <span className="text-xs font-medium">Generando previsualización del Estado de Cuenta...</span>
            </div>
          ) : errorMsg ? (
            <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-2xl max-w-md text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">No se pudo generar el documento</h4>
              <p className="text-xs text-rose-300">{errorMsg}</p>
            </div>
          ) : previewUrl ? (
            <iframe
              src={previewUrl}
              className="w-full h-full border-none bg-slate-900"
              title="Previsualización Estado de Cuenta PDF"
            />
          ) : (
            <span className="text-xs text-slate-500">Sin vista previa disponible.</span>
          )}
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="bg-[#1E293B] border-t border-[#334155] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Mail className="w-4 h-4 text-slate-400" />
            <span>Destino Correo:</span>
            {companyEmail ? (
              <span className="font-semibold text-white bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                {companyEmail}
              </span>
            ) : (
              <span className="text-rose-400 font-medium">Sin correo registrado</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={loading || !pdfBlob}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-700 transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-sky-400" />
              <span>Descargar PDF</span>
            </button>

            <button
              onClick={handleSendEmail}
              disabled={loading || sendingEmail || !pdfArrayBuffer || !companyEmail}
              className="inline-flex items-center gap-2 bg-[#FDDE12] hover:bg-[#e6c800] text-[#0F172A] text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg transition-colors disabled:opacity-50"
            >
              {sendingEmail ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Enviar al Cliente</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
