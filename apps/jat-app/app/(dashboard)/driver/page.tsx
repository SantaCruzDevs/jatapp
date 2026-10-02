'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Topbar from '@/components/layout/Topbar';
import { getCurrentUserProfileClient } from '@/lib/services/auth';
import { getDriverByProfileId, DriverWithProfile } from '@/lib/services/drivers';
import { getDriverCashSummary, DriverCashSummary } from '@/lib/services/driver-settlements';
import { getRides, requestSurcharge, updateRideStatus, RideWithDetails } from '@/lib/services/rides';
import { createClient } from '@/lib/supabase/client';
import { PaymentMethod } from '@/types/database.types';
import { 
  Bike, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Star, 
  DollarSign, 
  Clock, 
  FileText,
  MapPin,
  ChevronRight,
  ShieldCheck,
  CreditCard,
  QrCode,
  X,
  PackageCheck,
  PhoneCall
} from 'lucide-react';
import Link from 'next/link';

export default function DriverPage() {
  const [driver, setDriver] = useState<DriverWithProfile | null>(null);
  const [cashSummary, setCashSummary] = useState<DriverCashSummary | null>(null);
  const [assignedRidesQueue, setAssignedRidesQueue] = useState<RideWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Surcharge Request Form State
  const [surchargeAmount, setSurchargeAmount] = useState<number>(10);
  const [surchargeReason, setSurchargeReason] = useState<string>('');
  const [isSubmittingSurcharge, setIsSubmittingSurcharge] = useState<boolean>(false);

  // Finalization Confirmation Preview Modal State
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState<boolean>(false);
  const [rideToComplete, setRideToComplete] = useState<RideWithDetails | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('Efectivo');
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState<boolean>(false);

  const loadDriverData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
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

      // Load today's cash summary and rides
      const [sumRes, ridesRes] = await Promise.all([
        getDriverCashSummary(drv.id),
        getRides(),
      ]);

      if (sumRes.summary) setCashSummary(sumRes.summary);

      if (ridesRes.data) {
        // STRICT FILTERING: Only rides assigned to THIS authenticated driver that are assigned or ontheway
        const myActiveRides = ridesRes.data
          .filter((r) => r.driver_id === drv.id && (r.status === 'assigned' || r.status === 'ontheway'))
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); // Ascending by assignment/created_at

        setAssignedRidesQueue(myActiveRides);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error al cargar mis carreras');
    } finally {
      setLoading(false);
    }
  }, []);

  const driverRef = React.useRef<DriverWithProfile | null>(null);
  driverRef.current = driver;

  // Buffer for Realtime events received before driver profile completes loading
  const pendingRealtimeEventsRef = React.useRef<any[]>([]);

  const handleRealtimePayload = useCallback((payload: any, activeDriver: DriverWithProfile | null) => {
    const newRide = payload.new as Partial<RideWithDetails> | null;
    const oldRide = payload.old as Partial<RideWithDetails> | null;

    if (!activeDriver) {
      pendingRealtimeEventsRef.current.push(payload);
      return;
    }

    setAssignedRidesQueue((prevQueue) => {
      let updatedQueue = [...prevQueue];

      if (payload.eventType === 'INSERT' && newRide) {
        if (newRide.driver_id === activeDriver.id && (newRide.status === 'assigned' || newRide.status === 'ontheway')) {
          if (!updatedQueue.some(r => r.id === newRide.id)) {
            const customerPhone = (newRide as any).customer_phone;
            const customerName = (newRide as any).customer_name || newRide.requester_person;
            const customerObj = customerPhone
              ? { id: newRide.customer_id || '', full_name: customerName || '', phone: customerPhone }
              : null;

            updatedQueue.push({
              ...newRide,
              customer: customerObj,
            } as RideWithDetails);
          }
        }
      } else if (payload.eventType === 'UPDATE' && newRide) {
        const belongsToMe = newRide.driver_id === activeDriver.id;
        const isActiveStatus = newRide.status === 'assigned' || newRide.status === 'ontheway';

        if (belongsToMe && isActiveStatus) {
          const index = updatedQueue.findIndex(r => r.id === newRide.id);
          if (index !== -1) {
            const existing = updatedQueue[index];
            const customerPhone = (newRide as any).customer_phone;
            const customerObj = existing.customer || (customerPhone ? { id: newRide.customer_id || '', full_name: (newRide as any).customer_name || newRide.requester_person || '', phone: customerPhone } : null);

            updatedQueue[index] = {
              ...existing,
              ...newRide,
              customer: customerObj,
            };
          } else {
            const customerPhone = (newRide as any).customer_phone;
            const customerObj = customerPhone ? { id: newRide.customer_id || '', full_name: (newRide as any).customer_name || newRide.requester_person || '', phone: customerPhone } : null;

            updatedQueue.push({
              ...newRide,
              customer: customerObj,
            } as RideWithDetails);
          }
        } else {
          updatedQueue = updatedQueue.filter(r => r.id !== newRide.id);
        }
      } else if (payload.eventType === 'DELETE' && oldRide?.id) {
        updatedQueue = updatedQueue.filter(r => r.id !== oldRide.id);
      }

      return updatedQueue.sort((a, b) => new Date(a.created_at || Date.now()).getTime() - new Date(b.created_at || Date.now()).getTime());
    });
  }, []);

  // Flush buffered Realtime events when driver profile finishes loading
  useEffect(() => {
    if (driver && pendingRealtimeEventsRef.current.length > 0) {
      const events = [...pendingRealtimeEventsRef.current];
      pendingRealtimeEventsRef.current = [];
      events.forEach((ev) => handleRealtimePayload(ev, driver));
    }
  }, [driver, handleRealtimePayload]);

  // Initial load & silent 10s polling fallback for driver panel
  useEffect(() => {
    loadDriverData();
    const pollInterval = setInterval(() => {
      loadDriverData(true);
    }, 10000);
    return () => clearInterval(pollInterval);
  }, [loadDriverData]);

  // Standalone Realtime subscription & reconnection handler
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // 1. Initial auth token set
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
    });

    // 2. Instantiate channel and attach event listeners ONCE before subscribe()
    channel = supabase
      .channel('realtime-driver-operational-panel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rides' },
        (payload) => {
          handleRealtimePayload(payload, driverRef.current);
        }
      );

    channel.subscribe((status) => {
      if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Realtime Driver] Channel subscription issue:', status);
      }
    });

    // 3. Dynamic token updates on auth state changes without recreating channel callbacks
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadDriverData(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      authSubscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [handleRealtimePayload, loadDriverData]);

  // Request Surcharge
  const handleRequestSurcharge = async (e: React.FormEvent, rideId: string) => {
    e.preventDefault();
    setIsSubmittingSurcharge(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await requestSurcharge(rideId, surchargeAmount, surchargeReason);
      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg('Solicitud de ajuste de tarifa enviada a Central (PENDING).');
        await loadDriverData(true);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmittingSurcharge(false);
    }
  };

  // Start Ride (assigned -> ontheway)
  const handleStartRide = async (ride: RideWithDetails) => {
    setIsSubmittingSurcharge(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Optimistic UI Update
    setAssignedRidesQueue((prev) =>
      prev.map((r) => (r.id === ride.id ? { ...r, status: 'ontheway' as const } : r))
    );

    try {
      const { error } = await updateRideStatus(ride.id, 'ontheway');
      if (error) {
        setErrorMsg(error.message);
        await loadDriverData(true);
      } else {
        setSuccessMsg(`¡Carrera ${ride.ride_code} iniciada! Estado actual: EN CAMINO.`);
        await loadDriverData(true);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
      await loadDriverData(true);
    } finally {
      setIsSubmittingSurcharge(false);
    }
  };

  // Open Completion Modal
  const handleOpenCompleteModal = (ride: RideWithDetails) => {
    if (ride.surcharge_status === 'pending') {
      setErrorMsg(
        'Existe un sobrecargo pendiente de aprobación. El operador debe aprobar o rechazar antes de finalizar.'
      );
      return;
    }
    setRideToComplete(ride);
    setSelectedPaymentMethod(ride.payment_method || 'Efectivo');
    setIsCompleteModalOpen(true);
  };

  // Execute Finalization
  const handleConfirmCompletionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rideToComplete) return;

    if (!selectedPaymentMethod) {
      setErrorMsg('Selecciona la forma de pago antes de finalizar.');
      return;
    }

    setIsSubmittingCompletion(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Optimistic UI Update
    const completedRideId = rideToComplete.id;
    setAssignedRidesQueue((prev) => prev.filter((r) => r.id !== completedRideId));

    try {
      const { error } = await updateRideStatus(
        completedRideId,
        'completed',
        undefined,
        undefined,
        selectedPaymentMethod
      );

      if (error) {
        setErrorMsg(error.message);
        await loadDriverData(true);
      } else {
        setSuccessMsg(`¡Carrera ${rideToComplete.ride_code} completada exitosamente!`);
        setIsCompleteModalOpen(false);
        setRideToComplete(null);
        await loadDriverData(true);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
      await loadDriverData(true);
    } finally {
      setIsSubmittingCompletion(false);
    }
  };

  // Queue Segmentation
  const activeOnTheWayRide = assignedRidesQueue.find((r) => r.status === 'ontheway');
  const primaryRide = activeOnTheWayRide || assignedRidesQueue[0] || null;
  const queuedRides = assignedRidesQueue.filter((r) => r.id !== primaryRide?.id);

  // Today's summary stats
  const todayRides = cashSummary?.rides || [];
  const todayCount = todayRides.length;
  const todayGross = cashSummary?.gross_amount || 0;
  const todayCash = cashSummary?.cash_amount || 0;
  const todayQr = cashSummary?.qr_amount || 0;
  const todayTicket = cashSummary?.ticket_amount || 0;
  const todayTicketPending = todayRides.filter((r) => r.payment_method === 'Ticket').length;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <Topbar
        title="MIS CARRERAS"
        subtitle="Pantalla operacional principal del motoquero — En ruta y próximas asignaciones"
      />

      <main className="p-6 space-y-6 flex-1 max-w-5xl mx-auto w-full">
        {/* Banners */}
        {successMsg && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center justify-between animate-fadeIn font-semibold">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center justify-between animate-fadeIn font-semibold">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
            <span className="text-sm font-bold">Cargando mis carreras...</span>
          </div>
        ) : !driver ? (
          <div className="p-8 bg-[#1E293B] border border-[#334155] rounded-2xl text-center text-slate-400 space-y-2">
            <Bike className="w-10 h-10 mx-auto text-[#FDDE12]" />
            <p className="text-base font-bold text-white">Sin Perfil de Conductor Asignado</p>
            <p className="text-xs">Pide a la Central de Operaciones vincular tu usuario a un número de móvil.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Badge */}
            <div className="bg-[#1E293B] p-4 rounded-2xl border border-[#334155] shadow-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#0F172A] border-2 border-[#FDDE12] text-[#FDDE12] font-black flex items-center justify-center text-xl shadow">
                  #{driver.movil_number}
                </div>
                <div>
                  <h2 className="text-base font-bold text-white font-heading">
                    Móvil #{driver.movil_number} — {driver.profile?.full_name || 'Motoquero'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Vehículo: <strong className="text-slate-200">{driver.vehicle_type}</strong> ({driver.vehicle_plate}) • Zona: {driver.zone}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0F172A] rounded-xl border border-[#334155]">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="font-bold text-white text-sm">{Number(driver.rating).toFixed(1)}</span>
              </div>
            </div>

            {/* CARRERA ACTUAL */}
            {primaryRide ? (
              <div className="bg-[#1E293B] p-6 rounded-2xl border-4 border-[#FDDE12] shadow-2xl space-y-5 relative">
                <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#FDDE12]/20 border border-[#FDDE12]/40 text-[#FDDE12] rounded-xl">
                      <Bike className="w-7 h-7 animate-bounce" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-amber-400 uppercase tracking-widest block font-heading">
                        CARRERA ACTUAL
                      </span>
                      <h3 className="text-lg font-extrabold text-white font-heading">
                        Código {primaryRide.ride_code}
                      </h3>
                    </div>
                  </div>

                  <span className={`px-4 py-1.5 text-xs font-black rounded-xl uppercase ${
                    primaryRide.status === 'ontheway'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                      : 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                  }`}>
                    {primaryRide.status === 'ontheway' ? 'EN CAMINO' : 'ASIGNADA'}
                  </span>
                </div>

                {/* Info Display for Driver */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-3 p-4 bg-[#0F172A] border border-[#334155] rounded-xl">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">SOLICITANTE / CLIENTE</span>
                      <p className="text-sm font-bold text-white">{primaryRide.requester_person}</p>
                      <p className="text-xs text-indigo-300 font-medium">{primaryRide.requester_company}</p>
                      {primaryRide.customer?.phone && (
                        <p className="text-xs text-sky-400 font-mono flex items-center gap-1 mt-1">
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>Tel: {primaryRide.customer.phone}</span>
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-[#334155]">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">ORIGEN / RECOJO</span>
                      <p className="text-xs text-emerald-400 font-bold flex items-start gap-1">
                        <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{primaryRide.pickup_address}</span>
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[#334155]">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">DESTINO / ENTREGA</span>
                      <p className="text-xs text-rose-400 font-bold flex items-start gap-1">
                        <ChevronRight className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{primaryRide.destination_address}</span>
                      </p>
                    </div>

                    {primaryRide.cargo_description && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-xl text-amber-300 font-bold text-xs flex items-center gap-2">
                        <PackageCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span>¿Qué lleva?: &quot;{primaryRide.cargo_description}&quot;</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 p-4 bg-[#0F172A] border border-[#334155] rounded-xl flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">FORMA DE PAGO REGISTRADA</span>
                      <p className="text-sm font-bold text-white">{primaryRide.payment_method || 'Se define al finalizar'}</p>
                    </div>

                    <div className="p-4 bg-[#1E293B] border border-[#FDDE12]/50 rounded-xl text-right space-y-1">
                      <span className="text-[10px] text-[#FDDE12] font-extrabold uppercase block">TARIFA AUTORIZADA</span>
                      <div className="text-3xl font-black text-[#FDDE12] font-mono">
                        Bs. {Number(primaryRide.total_fare).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Surcharge Warning Banner */}
                {primaryRide.surcharge_status === 'pending' && (
                  <div className="p-4 bg-amber-500/10 border-2 border-amber-500/50 rounded-xl space-y-1 text-xs text-amber-300">
                    <div className="flex items-center gap-2 font-black text-sm">
                      <AlertCircle className="w-5 h-5 text-amber-400 animate-pulse" />
                      <span>Sobrecargo pendiente de aprobación (+Bs. {Number(primaryRide.surcharge_amount || 0).toFixed(2)})</span>
                    </div>
                    <p className="text-xs text-amber-200 font-medium">
                      El operador debe aprobar o rechazar antes de finalizar la carrera. (Motivo: &quot;{primaryRide.surcharge_reason}&quot;)
                    </p>
                  </div>
                )}

                {primaryRide.surcharge_status === 'approved' && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Sobrecargo Aprobado (+Bs. {Number(primaryRide.surcharge_amount || 0).toFixed(2)}). Tarifa actualizada.</span>
                  </div>
                )}

                {primaryRide.surcharge_status === 'rejected' && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2 font-bold">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span>Sobrecargo Rechazado por Central. Se mantiene la tarifa inicial.</span>
                  </div>
                )}

                {/* Request Surcharge Form (ONTHEWAY and NOT pending) */}
                {primaryRide.status === 'ontheway' && primaryRide.surcharge_status !== 'pending' && (
                  <form onSubmit={(e) => handleRequestSurcharge(e, primaryRide.id)} className="p-4 bg-[#0F172A] border border-[#334155] rounded-xl space-y-3">
                    <h4 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-amber-400" />
                      <span>SOLICITAR AJUSTE DE TARIFA (Espera / Ruta / Peso)</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Monto Sobrecargo (Bs.)</label>
                        <input
                          type="number"
                          step="0.50"
                          min="1"
                          required
                          value={surchargeAmount}
                          onChange={(e) => setSurchargeAmount(Number(e.target.value))}
                          className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#FDDE12]"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-slate-400 mb-1">Motivo del Ajuste</label>
                        <input
                          type="text"
                          required
                          placeholder="Ej. Tiempo de espera 20 min en recepción..."
                          value={surchargeReason}
                          onChange={(e) => setSurchargeReason(e.target.value)}
                          className="w-full bg-[#1E293B] border border-[#334155] rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#FDDE12]"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmittingSurcharge}
                      className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-[#0F172A] font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow disabled:opacity-50"
                    >
                      {isSubmittingSurcharge && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>[ SOLICITAR AJUSTE DE TARIFA ]</span>
                    </button>
                  </form>
                )}

                {/* State Transition Buttons */}
                <div className="pt-2">
                  {primaryRide.status === 'assigned' && (
                    <button
                      onClick={() => handleStartRide(primaryRide)}
                      disabled={isSubmittingSurcharge}
                      className="w-full py-4 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-black rounded-xl text-sm flex items-center justify-center gap-3 transition-all shadow-xl active:scale-98"
                    >
                      <Bike className="w-6 h-6" />
                      <span>[ INICIAR CARRERA / EN CAMINO ]</span>
                    </button>
                  )}

                  {primaryRide.status === 'ontheway' && (
                    <button
                      onClick={() => handleOpenCompleteModal(primaryRide)}
                      disabled={primaryRide.surcharge_status === 'pending' || isSubmittingSurcharge}
                      className={`w-full py-4 rounded-xl font-black text-sm flex items-center justify-center gap-3 transition-all shadow-xl ${
                        primaryRide.surcharge_status === 'pending'
                          ? 'bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-[#0F172A]'
                      }`}
                    >
                      <CheckCircle2 className="w-6 h-6" />
                      <span>[ FINALIZAR CARRERA ]</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 bg-[#1E293B] border border-[#334155] rounded-2xl text-center text-slate-400 space-y-2 shadow-xl">
                <Bike className="w-14 h-14 mx-auto text-slate-600" />
                <p className="text-lg font-bold text-white">Sin Carreras Asignadas en Este Momento</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  En este momento no tienes carreras en curso ni pendientes en tu cola. La pantalla se actualizará automáticamente cuando la Central te asigne un nuevo servicio.
                </p>
              </div>
            )}

            {/* PRÓXIMAS CARRERAS EN COLA */}
            {queuedRides.length > 0 && (
              <div className="bg-[#1E293B] rounded-2xl border border-[#334155] p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-[#334155] pb-3">
                  <h3 className="font-bold text-sm text-white flex items-center gap-2 font-heading">
                    <Clock className="w-4 h-4 text-sky-400" />
                    <span>PRÓXIMAS CARRERAS EN COLA ({queuedRides.length})</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">Ordenadas por horario de asignación</span>
                </div>

                <div className="space-y-3">
                  {queuedRides.map((ride, idx) => (
                    <div
                      key={ride.id}
                      className="p-4 bg-[#0F172A] border border-[#334155] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 text-sky-400 font-black flex items-center justify-center text-xs">
                          #{idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sky-400">{ride.ride_code}</span>
                            <span className="font-bold text-white">{ride.requester_person}</span>
                            <span className="text-indigo-300">({ride.requester_company})</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {ride.pickup_address} <span className="text-slate-500">→</span> {ride.destination_address}
                          </p>
                          {ride.cargo_description && (
                            <p className="text-xs text-amber-300 mt-0.5 font-medium">📦 Contenido: &quot;{ride.cargo_description}&quot;</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="font-mono font-bold text-[#FDDE12] text-base">
                          Bs. {Number(ride.total_fare).toFixed(2)}
                        </div>
                        <button
                          onClick={() => handleStartRide(ride)}
                          className="px-4 py-2 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl text-xs shadow"
                        >
                          Iniciar Esta Carrera
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* COMPLETADAS HOY RESUMEN */}
            <div className="bg-[#1E293B] rounded-2xl border border-[#334155] overflow-hidden shadow-xl">
              <div className="p-4 bg-[#0F172A] border-b border-[#334155] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-bold text-xs text-white uppercase tracking-wider font-heading">
                    COMPLETADAS HOY ({todayCount})
                  </h3>
                </div>
                <div className="text-xs font-mono flex items-center gap-3">
                  <span>Facturado: <strong className="text-emerald-400">Bs. {todayGross.toFixed(2)}</strong></span>
                  <span>Efectivo: <strong className="text-amber-400">Bs. {todayCash.toFixed(2)}</strong></span>
                  <span>QR: <strong className="text-sky-400">Bs. {todayQr.toFixed(2)}</strong></span>
                  <span>Ticket: <strong className="text-indigo-400">Bs. {todayTicket.toFixed(2)}</strong> ({todayTicketPending} pend. liq.)</span>
                </div>
              </div>

              {todayRides.length === 0 ? (
                <p className="p-6 text-center text-slate-500 text-xs">No has completado carreras en la jornada de hoy.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#334155] bg-[#0F172A]/40 text-slate-400 font-semibold uppercase">
                        <th className="py-3 px-4">Código</th>
                        <th className="py-3 px-4">Solicitante</th>
                        <th className="py-3 px-4">Recorrido</th>
                        <th className="py-3 px-4">Forma de Pago</th>
                        <th className="py-3 px-4 text-right">Tarifa Final</th>
                        <th className="py-3 px-4 text-right">Comprobante</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#334155] text-slate-300">
                      {todayRides.map((r) => (
                        <tr key={r.id} className="hover:bg-[#334155]/30 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-sky-400">{r.ride_code}</td>
                          <td className="py-3 px-4 font-semibold text-white">{r.requester_person}</td>
                          <td className="py-3 px-4 text-slate-400 text-xs max-w-xs truncate">
                            {r.pickup_address} → {r.destination_address}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-200 rounded font-bold text-[11px]">
                              {r.payment_method || 'Efectivo'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-white">
                            Bs. {Number(r.total_fare).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Link href={`/tickets/${r.ride_code}`} className="text-[#FDDE12] hover:underline font-bold text-xs">
                              Ver Comprobante
                            </Link>
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

      {/* FINALIZATION PREVIEW & PAYMENT METHOD SELECTION MODAL */}
      {isCompleteModalOpen && rideToComplete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border-2 border-emerald-500 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-xl">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-heading">
                    RESUMEN DEL SERVICIO
                  </h3>
                  <p className="text-xs text-slate-400">Confirma los importes y selecciona la forma de pago</p>
                </div>
              </div>
              <button
                onClick={() => setIsCompleteModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCompletionSubmit} className="space-y-4 text-xs">
              {/* Summary Details */}
              <div className="p-4 bg-[#0F172A] border border-[#334155] rounded-xl space-y-2 text-slate-300">
                <div className="flex items-center justify-between pb-2 border-b border-[#334155]">
                  <span className="font-mono font-extrabold text-sky-400 text-base">Carrera {rideToComplete.ride_code}</span>
                  <span className="px-2.5 py-1 bg-purple-500/20 text-purple-300 text-xs font-bold rounded uppercase">
                    {rideToComplete.status}
                  </span>
                </div>

                <p><strong>Cliente:</strong> <span className="text-white font-bold">{rideToComplete.requester_person} ({rideToComplete.requester_company})</span></p>
                <p><strong className="text-slate-400">Origen:</strong> {rideToComplete.pickup_address}</p>
                <p><strong className="text-slate-400">Destino:</strong> {rideToComplete.destination_address}</p>
                {rideToComplete.cargo_description && (
                  <p className="text-amber-300 font-semibold"><strong>Contenido:</strong> &quot;{rideToComplete.cargo_description}&quot;</p>
                )}
              </div>

              {/* Financial Breakdown */}
              <div className="p-4 bg-[#0F172A] border border-[#334155] rounded-xl space-y-2 font-mono text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Tarifa base:</span>
                  <span>Bs. {Number(rideToComplete.initial_fare).toFixed(2)}</span>
                </div>
                {rideToComplete.wait_time_cost > 0 && (
                  <div className="flex justify-between text-slate-300">
                    <span>Tiempo de espera:</span>
                    <span>Bs. {Number(rideToComplete.wait_time_cost).toFixed(2)}</span>
                  </div>
                )}
                {rideToComplete.surcharge_status === 'approved' && rideToComplete.surcharge_amount && (
                  <div className="flex justify-between text-emerald-400 font-bold">
                    <span>Sobrecargo aprobado:</span>
                    <span>+ Bs. {Number(rideToComplete.surcharge_amount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-3 border-t-2 border-[#334155] text-[#FDDE12] font-black text-base">
                  <span>TOTAL A COBRAR:</span>
                  <span>Bs. {Number(rideToComplete.total_fare).toFixed(2)}</span>
                </div>
              </div>

              {/* MANDATORY PAYMENT METHOD SELECTION */}
              <div className="space-y-2 pt-1">
                <label className="block text-white font-bold text-xs flex items-center gap-1.5 uppercase font-heading">
                  <CreditCard className="w-4 h-4 text-[#FDDE12]" />
                  <span>FORMA DE PAGO (OBLIGATORIO) <span className="text-rose-400">*</span></span>
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('Efectivo')}
                    className={`py-3.5 px-2 rounded-xl border text-center font-black text-xs transition-all flex flex-col items-center gap-1 ${
                      selectedPaymentMethod === 'Efectivo'
                        ? 'bg-amber-500 text-[#0F172A] border-amber-400 shadow-lg ring-2 ring-amber-400/50'
                        : 'bg-[#0F172A] text-slate-300 border-[#334155] hover:border-slate-500'
                    }`}
                  >
                    <DollarSign className="w-5 h-5" />
                    <span>EFECTIVO</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('QR')}
                    className={`py-3.5 px-2 rounded-xl border text-center font-black text-xs transition-all flex flex-col items-center gap-1 ${
                      selectedPaymentMethod === 'QR'
                        ? 'bg-sky-500 text-white border-sky-400 shadow-lg ring-2 ring-sky-400/50'
                        : 'bg-[#0F172A] text-slate-300 border-[#334155] hover:border-slate-500'
                    }`}
                  >
                    <QrCode className="w-5 h-5" />
                    <span>PAGO QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('Ticket')}
                    className={`py-3.5 px-2 rounded-xl border text-center font-black text-xs transition-all flex flex-col items-center gap-1 ${
                      selectedPaymentMethod === 'Ticket'
                        ? 'bg-indigo-500 text-white border-indigo-400 shadow-lg ring-2 ring-indigo-400/50'
                        : 'bg-[#0F172A] text-slate-300 border-[#334155] hover:border-slate-500'
                    }`}
                  >
                    <FileText className="w-5 h-5" />
                    <span>TICKET</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCompleteModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition-colors"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCompletion}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-[#0F172A] font-black rounded-xl text-xs flex items-center gap-2 transition-all shadow-xl disabled:opacity-50"
                >
                  {isSubmittingCompletion && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>[ CONFIRMAR Y FINALIZAR ]</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
