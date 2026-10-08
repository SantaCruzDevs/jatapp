'use client';

import React, { useState, useEffect, use, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getPublicVerificationTicket, PublicTicketPayload } from '@/lib/services/tickets';
import { 
  ShieldCheck, 
  CheckCircle2, 
  Ban, 
  Clock, 
  Bike, 
  AlertCircle, 
  Loader2 
} from 'lucide-react';

interface PublicTicketPageProps {
  params: Promise<{
    code: string;
  }>;
}

function PublicTicketPageContent({ code }: { code: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('t');

  const [payload, setPayload] = useState<PublicTicketPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function verifyTicket() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const { payload: data, error } = await getPublicVerificationTicket(code, token);
        if (error || !data) {
          setErrorMsg(error?.message || 'Token de verificación público inválido o caducado.');
        } else {
          setPayload(data);
        }
      } catch (err: unknown) {
        const error = err as Error;
        setErrorMsg(error.message || 'Error al validar comprobante.');
      } finally {
        setLoading(false);
      }
    }
    verifyTicket();
  }, [code, token]);

  return (
    <div className="p-6 pt-0 space-y-5">
      {loading ? (
        <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
          <span className="text-xs">Verificando autenticidad en tiempo real...</span>
        </div>
      ) : errorMsg || !payload ? (
        <div className="p-5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 text-center space-y-3">
          <AlertCircle className="w-10 h-10 mx-auto text-rose-500" />
          <h2 className="text-base font-bold">Comprobante No Verificado</h2>
          <p className="text-xs text-slate-300">
            {errorMsg || 'El enlace o token de verificación es inválido. No fue posible certificar este ticket.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Authenticity Stamp */}
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-xs">✓ COMPROBANTE OFICIAL MOTOJAT</h3>
              <p className="text-[10px] text-emerald-300">Firma criptográfica verificada sin alteración</p>
            </div>
          </div>

          {/* Status Indicator */}
          {payload.status === 'cancelled' ? (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-center font-extrabold text-xs uppercase flex items-center justify-center gap-2">
              <Ban className="w-4 h-4" />
              <span>COMPROBANTE ANULADO / INVALIDADO</span>
            </div>
          ) : payload.status === 'completed' ? (
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded-xl text-center font-bold text-xs uppercase flex items-center justify-center gap-2">
              <Bike className="w-4 h-4" />
              <span>SERVICIO FINALIZADO COMPLETAMENTE</span>
            </div>
          ) : (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl text-center font-bold text-xs uppercase flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              <span>SERVICIO PENDIENTE / EN CURSO</span>
            </div>
          )}

          {/* Privacy-Redacted Public Payload */}
          <div className="bg-[#0F172A] border border-[#334155] rounded-2xl p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-[#334155] pb-2">
              <span className="text-slate-400">Código Carrera:</span>
              <span className="font-mono font-bold text-sky-400">{payload.rideCode}</span>
            </div>

            <div className="flex items-center justify-between border-b border-[#334155] pb-2">
              <span className="text-slate-400">Comprobante Digital:</span>
              <span className="font-mono font-bold text-white">{payload.serviceCode || payload.ticketCode}</span>
            </div>

            <div className="flex items-center justify-between border-b border-[#334155] pb-2">
              <span className="text-slate-400">Empresa / Solicitante:</span>
              <span className="font-semibold text-slate-200">
                {payload.requester_company} ({payload.requester_initials})
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-[#334155] pb-2">
              <span className="text-slate-400">Recorrido Parcial:</span>
              <span className="text-slate-300 text-right">
                {payload.pickup_partial} → {payload.destination_partial}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-[#334155] pb-2">
              <span className="text-slate-400">Forma de Pago:</span>
              <span className="text-slate-200 font-bold">
                {payload.payment_method === 'Ticket' ? 'CRÉDITO CORPORATIVO' : (payload.payment_method || 'EFECTIVO').toUpperCase()}
              </span>
            </div>

            <div className="flex items-center justify-between pt-1 font-bold text-sm">
              <span className="text-white">Importe Total:</span>
              <span className="font-mono text-[#FDDE12]">Bs. {payload.total_fare.toFixed(2)}</span>
            </div>
          </div>

          {/* Timestamp */}
          <p className="text-[10px] text-slate-500 text-center font-mono">
            Registrado el {new Date(payload.created_at).toLocaleString('es-BO')}
          </p>
        </div>
      )}
    </div>
  );
}

export default function PublicTicketPage({ params }: PublicTicketPageProps) {
  const resolvedParams = use(params);
  const code = resolvedParams.code;

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1E293B] border border-[#334155] rounded-3xl shadow-2xl overflow-hidden space-y-6 animate-scaleUp">
        {/* Brand Header */}
        <div className="bg-[#0F172A] p-6 border-b border-[#334155] text-center space-y-1">
          <div className="inline-flex p-3 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-2xl mb-2">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-lg font-extrabold text-white font-heading">
            MOTOSERVI JUSTO A TIEMPO S.R.L.
          </h1>
          <p className="text-xs text-[#FDDE12] font-mono">
            Portal de Verificación Pública de Comprobantes
          </p>
        </div>

        <Suspense fallback={
          <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#FDDE12]" />
            <span className="text-xs">Cargando datos de verificación...</span>
          </div>
        }>
          <PublicTicketPageContent code={code} />
        </Suspense>
      </div>
    </div>
  );
}
