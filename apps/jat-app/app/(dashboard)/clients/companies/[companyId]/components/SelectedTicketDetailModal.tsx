'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { calculateTaxSurcharge } from '@/lib/services/company-account';
import { CompanyTaxMode } from '@/types/database.types';
import { 
  FileText, 
  X, 
  Loader2, 
  User, 
  Building2, 
  Bike, 
  MapPin, 
  Calendar, 
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';

interface SelectedTicketDetailModalProps {
  rideId?: string | null;
  rideCode?: string | null;
  ticketCode?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

interface TicketRideFullDetails {
  id: string;
  ride_code: string;
  ticket_code: string;
  created_at: string;
  status: string;
  payment_method: string;
  requester_person: string;
  requester_company: string;
  pickup_address: string;
  destination_address: string;
  initial_fare: number;
  wait_time_minutes: number;
  wait_time_cost: number;
  total_fare: number;
  observations?: string | null;
  cargo_description?: string | null;
  driver_movil?: number | null;
  driver_name?: string | null;
  company_name?: string | null;
  tax_mode?: CompanyTaxMode;
  tax_rate_label?: string;
  subtotal_base?: number;
  tax_amount?: number;
  total_with_tax?: number;
}

export function SelectedTicketDetailModal({
  rideId,
  rideCode,
  ticketCode,
  isOpen,
  onClose,
}: SelectedTicketDetailModalProps) {
  const [details, setDetails] = useState<TicketRideFullDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    async function loadTicketDetails() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const supabase = createClient();
        let query = supabase.from('rides').select(`
          id,
          ride_code,
          created_at,
          status,
          payment_method,
          requester_person,
          requester_company,
          pickup_address,
          destination_address,
          initial_fare,
          wait_time_minutes,
          wait_time_cost,
          total_fare,
          observations,
          cargo_description,
          driver:drivers (
            movil_number,
            profile:profiles (
              full_name
            )
          ),
          company:companies (
            business_name,
            tax_mode
          )
        `);

        if (rideId) {
          query = query.eq('id', rideId);
        } else if (rideCode) {
          query = query.eq('ride_code', rideCode);
        } else {
          setErrorMsg('No se especificó un identificador de carrera válido.');
          setLoading(false);
          return;
        }

        const { data, error } = await query.single();

        if (error || !data) {
          setErrorMsg('No se encontró el detalle de la carrera.');
          setLoading(false);
          return;
        }

        // Fetch corporate ticket code if applicable
        const { data: corpData } = await supabase
          .from('corporate_tickets')
          .select('ticket_code')
          .eq('ride_id', data.id)
          .single();

        const driverObj = data.driver as unknown as { movil_number?: number; profile?: { full_name?: string } } | null;
        const companyObj = data.company as unknown as { business_name?: string; tax_mode?: CompanyTaxMode } | null;

        const totalFare = Number(data.total_fare || 0);
        const companyTaxMode = companyObj?.tax_mode || 'SIN_FACTURA';
        const taxBreakdown = calculateTaxSurcharge(totalFare, companyTaxMode);

        setDetails({
          id: data.id,
          ride_code: data.ride_code,
          ticket_code: corpData?.ticket_code || ticketCode || `TK-${data.ride_code}`,
          created_at: data.created_at,
          status: data.status,
          payment_method: data.payment_method,
          requester_person: data.requester_person || 'No registrado',
          requester_company: data.requester_company || 'Particular',
          pickup_address: data.pickup_address || 'Origen no especificado',
          destination_address: data.destination_address || 'Destino no especificado',
          initial_fare: Number(data.initial_fare || 0),
          wait_time_minutes: Number(data.wait_time_minutes || 0),
          wait_time_cost: Number(data.wait_time_cost || 0),
          total_fare: totalFare,
          observations: data.observations || null,
          cargo_description: data.cargo_description || null,
          driver_movil: driverObj?.movil_number || null,
          driver_name: driverObj?.profile?.full_name || null,
          company_name: companyObj?.business_name || data.requester_company,
          tax_mode: companyTaxMode,
          tax_rate_label: taxBreakdown.tax_rate_label,
          subtotal_base: taxBreakdown.subtotal_base,
          tax_amount: taxBreakdown.tax_amount,
          total_with_tax: taxBreakdown.total_with_tax,
        });
      } catch (err: unknown) {
        setErrorMsg((err as Error).message || 'Error al cargar detalle del ticket.');
      } finally {
        setLoading(false);
      }
    }

    loadTicketDetails();
  }, [isOpen, rideId, rideCode, ticketCode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-4 animate-scaleUp">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-heading flex items-center gap-2">
                Detalle de Ticket Corporativo
              </h3>
              <p className="text-xs text-slate-400">
                Información operacional completa del vale de carrera
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Loading */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
            <span className="text-xs font-medium">Cargando datos operacionales del ticket...</span>
          </div>
        ) : errorMsg || !details ? (
          <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-xl text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-xs text-rose-300">{errorMsg || 'No se pudo cargar la información del ticket.'}</p>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Header Badge Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0F172A] p-3.5 rounded-xl border border-[#334155]">
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Nº Ticket / Vale</span>
                <span className="text-sm font-black text-[#FDDE12] font-mono">{details.ticket_code}</span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Código Carrera</span>
                <span className="text-xs font-bold text-white font-mono">{details.ride_code}</span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Estado Servicio</span>
                <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold rounded text-[10px] uppercase">
                  {details.status}
                </span>
              </div>
            </div>

            {/* Grid of Main Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
                <span className="text-slate-400 text-[10px] font-semibold uppercase flex items-center gap-1">
                  <User className="w-3 h-3 text-sky-400" />
                  Solicitante
                </span>
                <p className="font-bold text-white text-xs">{details.requester_person}</p>
                <p className="text-[11px] text-slate-400">{details.company_name}</p>
              </div>

              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
                <span className="text-slate-400 text-[10px] font-semibold uppercase flex items-center gap-1">
                  <Bike className="w-3 h-3 text-emerald-400" />
                  Conductor Asignado
                </span>
                <p className="font-bold text-white text-xs">
                  {details.driver_movil ? `Móvil #${details.driver_movil}` : '—'}
                </p>
                {details.driver_name && <p className="text-[11px] text-slate-400">{details.driver_name}</p>}
              </div>
            </div>

            {/* Route Box */}
            <div className="p-3.5 bg-[#0F172A] rounded-xl border border-[#334155] space-y-2">
              <span className="text-slate-400 text-[10px] font-semibold uppercase flex items-center gap-1">
                <MapPin className="w-3 h-3 text-rose-400" />
                Ruta del Servicio
              </span>
              <div className="space-y-1 text-slate-200">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold text-[10px] mt-0.5">ORIGEN:</span>
                  <span className="font-medium text-white">{details.pickup_address}</span>
                </div>
                <div className="flex items-start gap-2 pt-1 border-t border-[#334155]">
                  <span className="text-rose-400 font-bold text-[10px] mt-0.5">DESTINO:</span>
                  <span className="font-medium text-white">{details.destination_address}</span>
                </div>
              </div>
            </div>

            {/* Fare & Timestamps Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Fecha & Hora</span>
                <span className="text-xs font-semibold text-slate-200 font-mono">
                  {new Date(details.created_at).toLocaleString('es-BO')}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Forma de Pago</span>
                <span className="text-xs font-semibold text-slate-200">{details.payment_method}</span>
              </div>

              <div>
                <span className="text-[10px] text-[#FDDE12] block font-semibold uppercase">Tarifa Base Servicio</span>
                <span className="text-sm font-bold text-white font-mono">Bs. {details.total_fare.toFixed(2)}</span>
              </div>
            </div>

            {/* Tax Treatment Breakdown Block */}
            {details.tax_mode && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-amber-300 font-bold border-b border-amber-500/20 pb-1">
                  <span>Tratamiento Tributario Aplicable:</span>
                  <span className="font-mono bg-amber-500/20 px-2 py-0.5 rounded text-[11px]">{details.tax_rate_label}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-slate-300 pt-0.5">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Base Servicio:</span>
                    <span>Bs. {(details.subtotal_base || details.total_fare).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-amber-400 text-[10px] block">Impuesto Aplicado:</span>
                    <span className="text-amber-300 font-semibold">+ Bs. {(details.tax_amount || 0).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-emerald-400 text-[10px] block">Total con Impuesto:</span>
                    <span className="text-white font-bold">Bs. {(details.total_with_tax || details.total_fare).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Observations / Cargo */}
            {details.observations && (
              <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase mb-0.5">Observaciones</span>
                <p className="text-xs text-slate-200">{details.observations}</p>
              </div>
            )}

            {/* Actions */}
            <div className="pt-3 border-t border-[#334155] flex items-center justify-between">
              <Link
                href={`/t/${details.ride_code}`}
                target="_blank"
                className="text-sky-400 hover:text-sky-300 font-semibold text-xs flex items-center gap-1 hover:underline"
              >
                <span>Ver Comprobante Público Digital →</span>
              </Link>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
