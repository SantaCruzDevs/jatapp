'use client';

import React, { useState, useEffect, use } from 'react';
import Topbar from '@/components/layout/Topbar';
import { getDigitalTicketByCode, DigitalTicket } from '@/lib/services/tickets';
import { getTicketFormatSetting, TicketFormat } from '@/lib/services/system-settings';
import { 
  FileText, 
  Printer, 
  QrCode, 
  ArrowLeft, 
  CheckCircle2, 
  Ban, 
  Bike, 
  Building2, 
  MapPin, 
  Clock, 
  DollarSign, 
  Loader2, 
  AlertCircle, 
  ShieldCheck 
} from 'lucide-react';
import Link from 'next/link';
import TicketDeliveryControls from '@/components/tickets/TicketDeliveryControls';

interface TicketDetailPageProps {
  params: Promise<{
    code: string;
  }>;
}

export default function TicketDetailPage({ params }: TicketDetailPageProps) {
  const resolvedParams = use(params);
  const code = resolvedParams.code;

  const [ticket, setTicket] = useState<DigitalTicket | null>(null);
  const [ticketFormat, setTicketFormat] = useState<TicketFormat>('detailed');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadTicket() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const [ticketRes, formatRes] = await Promise.all([
          getDigitalTicketByCode(code),
          getTicketFormatSetting(),
        ]);
        setTicketFormat(formatRes);

        if (ticketRes.error || !ticketRes.ticket) {
          setErrorMsg(ticketRes.error?.message || 'Comprobante no encontrado');
        } else {
          setTicket(ticketRes.ticket);
        }
      } catch (err: unknown) {
        const error = err as Error;
        setErrorMsg(error.message || 'Error al obtener ticket');
      } finally {
        setLoading(false);
      }
    }
    loadTicket();
  }, [code]);

  const handlePrint = () => {
    window.print();
  };

  const publicUrl = ticket ? `/t/${ticket.rideCode}?t=${ticket.publicToken}` : '#';

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      {/* Topbar hidden on print */}
      <div className="print:hidden">
        <Topbar
          title={`Ticket Digital — ${code}`}
          subtitle="Comprobante fiscal/operativo de servicio expreso MotoJAT"
        />
      </div>

      <main className="p-6 space-y-6 flex-1 max-w-3xl mx-auto w-full">
        {/* Navigation & Action Buttons (Hidden on Print) */}
        <div className="print:hidden flex items-center justify-between gap-4 bg-[#1E293B] p-4 rounded-2xl border border-[#334155] shadow-lg">
          <Link
            href="/tickets"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Tickets</span>
          </Link>

          <div className="flex items-center gap-3">
            {ticket && (
              <>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors"
                >
                  <QrCode className="w-4 h-4" />
                  <span>QR Público</span>
                </a>

                {ticket.status === 'completed' && (
                  <button
                    onClick={() => {
                      const shareUrl = `${window.location.origin}/t/${ticket.rideCode}?t=${ticket.publicToken}`;
                      const text = encodeURIComponent(
                        `🛵 *MotoJAT Comprobante Digital*\nCarrera: ${ticket.rideCode}\nCliente: ${ticket.requester_person}\nEmpresa: ${ticket.requester_company}\nTarifa Final: Bs. ${ticket.total_fare.toFixed(2)}\nVer Comprobante: ${shareUrl}`
                      );
                      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
                    }}
                    className="px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors"
                  >
                    <span>Enviar por WhatsApp</span>
                  </button>
                )}
              </>
            )}

            <button
              onClick={handlePrint}
              disabled={!ticket}
              className="px-4 py-2 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Ticket</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
            <span className="text-xs">Cargando comprobante de servicio...</span>
          </div>
        ) : errorMsg || !ticket ? (
          <div className="p-12 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 text-center space-y-3">
            <AlertCircle className="w-10 h-10 mx-auto" />
            <h3 className="text-base font-bold">Comprobante No Encontrado</h3>
            <p className="text-xs text-slate-400">{errorMsg || 'El código especificado no corresponde a ningún ticket válido.'}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {ticketFormat === 'simple' ? (
              /* DIGITAL TICKET SIMPLE FORMAT (Thermal Receipt style - Narrow width with Prominent Driver Header) */
          <div className="max-w-[380px] mx-auto w-full bg-white text-slate-900 rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4 font-mono print:shadow-none print:border-none print:p-0 print:max-w-[80mm] print:w-full print:mx-auto">
            {/* Receipt Header */}
            <div className="text-center border-b-2 border-dashed border-slate-300 pb-3 space-y-1">
              <h1 className="text-2xl font-black font-heading tracking-wide text-slate-900">MotoJat</h1>
              <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">COMPROBANTE DIGITAL DE SERVICIO</p>
              <p className="text-xs font-extrabold text-slate-800">Nro: {ticket.serviceCode}</p>
            </div>

            {/* Prominent Conductor MotoJAT & Vehicle Fleet Section (CEO Priority view at Top) */}
            <div className="bg-slate-100 border-2 border-slate-900 rounded-xl p-3 text-center space-y-1.5 print:bg-slate-100 print:border-slate-900">
              <div className="flex items-center justify-center gap-1.5 text-slate-900 font-extrabold text-xs uppercase tracking-wider">
                <Bike className="w-4 h-4 text-slate-900" />
                <span>CONDUCTOR MOTOJAT</span>
              </div>
              <p className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight">
                {ticket.driver_movil ? `Móvil #${ticket.driver_movil} ${ticket.driver_name ? `(${ticket.driver_name})` : ''}` : 'Pendiente de Asignación'}
              </p>
              <div className="pt-1 flex items-center justify-center gap-2 text-xs border-t border-slate-300 font-bold text-slate-800">
                <span className="text-slate-500 uppercase text-[10px]">PLACA DE VEHÍCULO:</span>
                <span className="font-mono text-slate-900 font-extrabold">{ticket.driver_plate || '—'}</span>
              </div>
            </div>

            {/* Fleet & Service Info */}
            <div className="space-y-2 text-xs border-b-2 border-dashed border-slate-300 pb-3">
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Fecha Emisión:</span>
                <span className="font-semibold text-slate-900">
                  {new Date(ticket.created_at).toLocaleDateString('es-BO', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Empresa:</span>
                <span className="font-bold text-slate-900 text-right">{ticket.requester_company}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Solicitante:</span>
                <span className="font-semibold text-slate-900 text-right">{ticket.requester_person}</span>
              </div>
            </div>

            {/* Recorrido */}
            <div className="space-y-2 text-xs border-b-2 border-dashed border-slate-300 pb-3">
              <div className="flex justify-between items-start">
                <span className="text-slate-500 font-bold min-w-[65px]">Origen:</span>
                <span className="font-medium text-slate-900 text-right">{ticket.pickup_address}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-slate-500 font-bold min-w-[65px]">Destino:</span>
                <span className="font-medium text-slate-900 text-right">{ticket.destination_address}</span>
              </div>
              {ticket.cargo_description && (
                <div className="flex justify-between items-start pt-1">
                  <span className="text-slate-500 font-bold min-w-[65px]">Contenido:</span>
                  <span className="font-semibold text-slate-900 text-right">{ticket.cargo_description}</span>
                </div>
              )}
            </div>

            {/* Financial Breakdown */}
            <div className="space-y-2 text-xs border-b-2 border-dashed border-slate-300 pb-3">
              <div className="flex justify-between">
                <span className="text-slate-600">Tarifa Base:</span>
                <span className="font-semibold text-slate-900">Bs. {ticket.initial_fare.toFixed(2)}</span>
              </div>
              {ticket.wait_time_minutes > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Tiempo de Espera ({ticket.wait_time_minutes} min):</span>
                  <span className="font-semibold text-slate-900">Bs. {ticket.wait_time_cost.toFixed(2)}</span>
                </div>
              )}
              {ticket.surcharge_status === 'approved' && Number(ticket.surcharge_amount) > 0 && (
                <div className="flex justify-between text-emerald-800">
                  <span>Sobrecargo Aprobado:</span>
                  <span className="font-semibold">+ Bs. {Number(ticket.surcharge_amount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Forma de Pago:</span>
                <span className="font-bold text-slate-900">
                  {ticket.payment_method === 'Ticket' ? 'CRÉDITO CORPORATIVO' : (ticket.payment_method || 'Efectivo').toUpperCase()}
                </span>
              </div>
              {ticket.payment_method === 'Ticket' && ticket.corporateTicketCode && (
                <div className="flex justify-between text-[#0F172A] font-bold bg-amber-50 p-1.5 rounded border border-amber-200">
                  <span>Ticket Corporativo:</span>
                  <span className="font-mono">{ticket.corporateTicketCode}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 text-sm sm:text-base font-extrabold text-slate-900 border-t border-slate-400">
                <span>TARIFA FINAL:</span>
                <span className="text-emerald-700">Bs. {ticket.total_fare.toFixed(2)}</span>
              </div>
            </div>

            {/* Footer Verification & QR Code */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="space-y-1 text-[10px] text-slate-500">
                <div className="flex items-center gap-1 font-bold text-slate-800">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>MotoJAT Digital</span>
                </div>
                <p className="font-mono text-slate-400 text-[9px]">Token: {ticket.publicToken}</p>
              </div>

              <div className="p-1.5 bg-slate-100 border border-slate-300 rounded-xl text-center flex flex-col items-center">
                <QrCode className="w-9 h-9 text-slate-800" />
                <span className="text-[8px] font-mono text-slate-600 mt-0.5">Escanea QR</span>
              </div>
            </div>
          </div>
        ) : (
          /* DIGITAL TICKET DETAILED PRINTABLE CARD */
          <div className="bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 print:shadow-none print:border-none print:rounded-none print:p-0">
            {/* Header Brand */}
            <div className="bg-[#0F172A] text-white p-6 border-b-4 border-[#FDDE12] print:bg-white print:text-black print:border-b-2 print:border-black print:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight font-heading">
                    MOTOSERVI JUSTO A TIEMPO S.R.L.
                  </h1>
                  <p className="text-xs text-[#FDDE12] font-mono print:text-slate-700">
                    COMPROBANTE DIGITAL DE SERVICIO DE MENSAJERÍA & CARGO
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-3 py-1 bg-slate-800 text-[#FDDE12] border border-slate-700 rounded-lg text-xs font-mono font-bold print:bg-slate-100 print:text-black print:border-slate-300">
                    {ticket.serviceCode}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6 text-xs print:p-4 print:space-y-4">
              {/* Prominent Conductor & Vehicle Fleet Header Section (Priority View) */}
              <div className="bg-slate-100/70 border border-slate-200/90 rounded-2xl p-4 flex items-center justify-between gap-4 print:bg-slate-100 print:border-slate-300">
                {/* Conductor Block */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="p-2.5 bg-slate-900 text-[#FDDE12] rounded-xl flex-shrink-0 print:bg-slate-900 print:text-[#FDDE12]">
                    <Bike className="w-7 h-7 sm:w-8 sm:h-8" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block mb-0.5">
                      CONDUCTOR MOTOJAT
                    </span>
                    {ticket.driver_movil ? (
                      <p className="font-extrabold text-slate-900 text-base sm:text-lg leading-tight truncate">
                        Móvil #{ticket.driver_movil} {ticket.driver_name ? `(${ticket.driver_name})` : ''}
                      </p>
                    ) : (
                      <p className="text-slate-500 italic font-semibold">
                        Conductor Pendiente de Asignación
                      </p>
                    )}
                  </div>
                </div>

                {/* Vertical Separator */}
                <div className="h-10 w-px bg-slate-300/80 flex-shrink-0" />

                {/* Placa Block */}
                <div className="flex items-center gap-2.5 min-w-0 flex-shrink-0">
                  <div className="p-1.5 bg-slate-200/70 text-slate-800 rounded-lg flex-shrink-0 hidden xs:flex">
                    <Bike className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block mb-0.5">
                      PLACA DE VEHÍCULO
                    </span>
                    <p className="font-mono font-extrabold text-slate-900 text-base sm:text-lg leading-tight">
                      {ticket.driver_plate || '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Watermark Banner */}
              {ticket.status === 'cancelled' ? (
                <div className="p-3 bg-rose-50 border-2 border-rose-400 text-rose-700 rounded-xl text-center font-extrabold uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                  <Ban className="w-5 h-5" />
                  <span>COMPROBANTE ANULADO / INVALIDADO</span>
                </div>
              ) : ticket.status === 'completed' ? (
                <div className="p-3 bg-emerald-50 border border-emerald-400 text-emerald-800 rounded-xl text-center font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>SERVICIO COMPLETADO Y VERIFICADO POR MOTOJAT</span>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-400 text-amber-800 rounded-xl text-center font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>SERVICIO EN CURSO ({ticket.status.toUpperCase()})</span>
                </div>
              )}

              {/* Grid Details */}
              <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">CÓDIGO DE CARRERA</span>
                  <p className="font-mono font-bold text-slate-900 text-sm">{ticket.rideCode}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">FECHA Y HORA EMISIÓN</span>
                  <p className="font-mono text-slate-800">
                    {new Date(ticket.created_at).toLocaleString('es-BO', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              {/* Customer & Company Details */}
              <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">SOLICITANTE / CLIENTE</span>
                  <p className="font-bold text-slate-900">{ticket.requester_person}</p>
                  {ticket.customer_phone && <p className="text-slate-600 font-mono">Tel: {ticket.customer_phone}</p>}
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">EMPRESA CORPORATIVA</span>
                  <p className="font-bold text-slate-900">{ticket.requester_company}</p>
                  {ticket.company_nit && <p className="text-slate-600 font-mono">NIT: {ticket.company_nit}</p>}
                </div>
              </div>

              {/* Route Details */}
              <div className="border-b border-slate-200 pb-4 space-y-2">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">DETALLE DEL RECORRIDO</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 print:bg-white print:border-slate-300">
                  <div>
                    <span className="text-[10px] text-emerald-700 font-bold uppercase block">ORIGEN / RECOJO</span>
                    <p className="text-slate-800 font-medium">{ticket.pickup_address}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-rose-700 font-bold uppercase block">DESTINO / ENTREGA</span>
                    <p className="text-slate-800 font-medium">{ticket.destination_address}</p>
                  </div>
                </div>

                {/* Cargo Description / Qué lleva */}
                <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200 print:bg-white print:border-slate-300">
                  <span className="text-[10px] text-amber-800 font-bold uppercase block mb-0.5">CONTENIDO / QUÉ LLEVA</span>
                  <p className="text-slate-900 font-semibold">{ticket.cargo_description || 'Sin especificar'}</p>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 print:bg-white print:border-slate-300">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">DESGLOSE DE TARIFA Y PAGO</span>
                <div className="flex justify-between text-slate-700">
                  <span>Tarifa Base de Carrera:</span>
                  <span className="font-mono">Bs. {ticket.initial_fare.toFixed(2)}</span>
                </div>
                {ticket.wait_time_minutes > 0 && (
                  <div className="flex justify-between text-slate-700">
                    <span>Tiempo de Espera ({ticket.wait_time_minutes} min):</span>
                    <span className="font-mono">Bs. {ticket.wait_time_cost.toFixed(2)}</span>
                  </div>
                )}
                {ticket.surcharge_status === 'approved' && Number(ticket.surcharge_amount) > 0 && (
                  <div className="flex justify-between text-emerald-800 font-semibold">
                    <span>Sobrecargo Aprobado ({ticket.surcharge_reason || 'Servicio adicional'}):</span>
                    <span className="font-mono">+ Bs. {Number(ticket.surcharge_amount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-700 pt-1 border-t border-slate-200">
                  <span>Forma de Pago:</span>
                  <span className="font-bold text-slate-900">
                    {ticket.payment_method === 'Ticket' ? 'CRÉDITO CORPORATIVO' : (ticket.payment_method || 'Efectivo').toUpperCase()}
                  </span>
                </div>
                {ticket.payment_method === 'Ticket' && ticket.corporateTicketCode && (
                  <div className="flex justify-between text-slate-900 bg-amber-50 p-2 rounded-lg border border-amber-200 font-bold">
                    <span>Ticket Corporativo Digital:</span>
                    <span className="font-mono text-amber-900">{ticket.corporateTicketCode}</span>
                  </div>
                )}
                {ticket.observations && (
                  <div className="flex justify-between text-slate-700">
                    <span>Observaciones:</span>
                    <span className="font-medium text-slate-900">{ticket.observations}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-slate-900 pt-2 border-t-2 border-slate-900 font-extrabold text-base">
                  <span>TARIFA FINAL AUTORIZADA:</span>
                  <span className="font-mono text-emerald-700">Bs. {ticket.total_fare.toFixed(2)}</span>
                </div>
              </div>

              {/* Footer QR Verification Code */}
              <div className="pt-2 flex items-center justify-between gap-4 border-t border-slate-200">
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-slate-900 font-bold">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Verificación Anti-manipulación MotoJAT</span>
                  </div>
                  <p className="text-[10px] text-slate-500 max-w-md">
                    Este comprobante digital cuenta con firma de autenticidad basada en hash criptográfico. Escanee el código QR para validar el estado oficial en el portal público.
                  </p>
                  <p className="text-[10px] font-mono text-slate-400">Token: {ticket.publicToken}</p>
                </div>

                <div className="p-2 bg-slate-100 border border-slate-300 rounded-xl text-center flex flex-col items-center">
                  <QrCode className="w-12 h-12 text-slate-800" />
                  <span className="text-[9px] font-mono text-slate-600 mt-1">Escanea QR</span>
                </div>
              </div>
            </div>
          </div>
        )}

          {/* Delivery & Re-send Controls (Email / WhatsApp) */}
          <TicketDeliveryControls
            rideId={ticket.id}
            customerEmail={null}
            customerPhone={ticket.customer_phone}
            companyAddress={ticket.company_address}
          />
        </div>
      )}
      </main>
    </div>
  );
}
