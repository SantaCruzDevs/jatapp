'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Topbar from '@/components/layout/Topbar';
import { getDrivers, updateDriverStatus, deactivateDriver, reactivateDriver, DriverWithProfile } from '@/lib/services/drivers';
import {
  getDriverPreSettlementCandidateSummary,
  createDriverSettlementAtomic,
  createAndPayDriverSettlementAtomic,
  confirmDraftSettlementAtomic,
  markSettlementAsPaidAtomic,
  voidDriverSettlementAtomic,
  getDriverSettlements,
  getSettlementItemsBySettlementId,
  PreSettlementCandidateSummary,
  DriverSettlementWithDetails
} from '@/lib/services/driver-settlements';
import { getSystemSettings } from '@/lib/services/system-settings';
import { DriverSettlementItem, DriverStatus, Ride } from '@/types/database.types';
import { getCurrentUserProfileClient } from '@/lib/services/auth';
import {
  Bike,
  Search,
  Plus,
  ShieldCheck,
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  AlertCircle,
  FileText,
  UserCheck,
  Building2,
  ChevronRight,
  TrendingUp,
  Receipt,
  Download,
  Calendar,
  Loader2,
  X,
  Phone,
  MapPin,
  Star,
  ArrowRight,
  RotateCcw,
  Lock,
  Eye,
  History,
  Ban,
  Check,
  HelpCircle,
  ArrowDownRight,
  Sparkles,
  AlertTriangle,
  UserX
} from 'lucide-react';
import Link from 'next/link';

// Helper to format role name for display (SUPERADMIN -> Soporte)
const formatRoleName = (role?: string | null) => {
  if (!role) return 'Sistema';
  if (role === 'SUPERADMIN') return 'Soporte';
  if (role === 'ADMIN') return 'Administración';
  if (role === 'SUPERVISOR') return 'Supervisión';
  if (role === 'OPERATOR') return 'Operaciones';
  if (role === 'DRIVER') return 'Motoquero';
  return role;
};

// Helper to format date for datetime-local input
const getNowForDatetimeLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export default function DriversModulePage() {
  const [drivers, setDrivers] = useState<DriverWithProfile[]>([]);
  const [settlements, setSettlements] = useState<DriverSettlementWithDetails[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [preSettlementsEnabled, setPreSettlementsEnabled] = useState<boolean>(false);

  // Global Banners
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active Tab: 'fleet' | 'pre_settlement' | 'settlements'
  const [activeTab, setActiveTab] = useState<'fleet' | 'pre_settlement' | 'settlements'>('fleet');

  // Selected Driver & Cutoff for Pre-Settlement
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [cutoffAt, setCutoffAt] = useState<string>(getNowForDatetimeLocal());
  const [candidateSummary, setCandidateSummary] = useState<PreSettlementCandidateSummary | null>(null);
  const [loadingCandidate, setLoadingCandidate] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  // Dual-Mode Adjustments (Default: desired_amount = Fijar Monto Final)
  const [inputMode, setInputMode] = useState<'desired_amount' | 'direct'>('desired_amount');
  const [bonusAmount, setBonusAmount] = useState<string>('0');
  const [discountAmount, setDiscountAmount] = useState<string>('0');
  const [discountReason, setDiscountReason] = useState<string>('');
  const [desiredNetBalance, setDesiredNetBalance] = useState<string>('');
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState(false);

  // Modals State
  const [isConfirmCloseModalOpen, setIsConfirmCloseModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedSettlementForPayment, setSelectedSettlementForPayment] = useState<DriverSettlementWithDetails | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [selectedSettlementForVoid, setSelectedSettlementForVoid] = useState<DriverSettlementWithDetails | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [isSubmittingVoid, setIsSubmittingVoid] = useState(false);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedSettlementForDetail, setSelectedSettlementForDetail] = useState<DriverSettlementWithDetails | null>(null);
  const [detailItems, setDetailItems] = useState<DriverSettlementItem[]>([]);
  const [loadingDetailItems, setLoadingDetailItems] = useState(false);

  // Deactivation (Dar de baja) Modal State
  const [selectedDriverForBaja, setSelectedDriverForBaja] = useState<DriverWithProfile | null>(null);
  const [deactivatingDriver, setDeactivatingDriver] = useState<boolean>(false);
  const [bajaErrorMsg, setBajaErrorMsg] = useState<string | null>(null);

  const handleDeactivateDriverConfirm = async () => {
    if (!selectedDriverForBaja) return;
    setDeactivatingDriver(true);
    setBajaErrorMsg(null);
    try {
      const { error } = await deactivateDriver(selectedDriverForBaja.id);
      if (error) {
        setBajaErrorMsg(error.message);
        return;
      }
      setSuccessMsg(`El motoquero Móvil #${selectedDriverForBaja.movil_number} (${selectedDriverForBaja.profile?.full_name || 'Motoquero'}) fue dado de baja exitosamente. El Móvil #${selectedDriverForBaja.movil_number} queda libre para reutilización.`);
      setSelectedDriverForBaja(null);
      loadInitialData();
    } catch (err: any) {
      setBajaErrorMsg(err.message || 'Error al dar de baja al motoquero.');
    } finally {
      setDeactivatingDriver(false);
    }
  };

  // Reactivation Modal State
  const [selectedDriverForReactivation, setSelectedDriverForReactivation] = useState<DriverWithProfile | null>(null);
  const [reactivatingDriver, setReactivatingDriver] = useState<boolean>(false);
  const [reactivationErrorMsg, setReactivationErrorMsg] = useState<string | null>(null);

  const handleReactivateDriverConfirm = async () => {
    if (!selectedDriverForReactivation) return;
    setReactivatingDriver(true);
    setReactivationErrorMsg(null);
    try {
      const { data: updated, error } = await reactivateDriver(selectedDriverForReactivation.id);
      if (error) {
        setReactivationErrorMsg(error.message);
        return;
      }
      setSuccessMsg(`El motoquero ${selectedDriverForReactivation.profile?.full_name || 'Motoquero'} fue reactivado exitosamente con el Móvil #${updated?.movil_number}.`);
      setSelectedDriverForReactivation(null);
      loadInitialData();
    } catch (err: any) {
      setReactivationErrorMsg(err.message || 'Error al reactivar al motoquero.');
    } finally {
      setReactivatingDriver(false);
    }
  };

  // Load Drivers & User Role
  useEffect(() => {
    getCurrentUserProfileClient().then((profile) => {
      if (profile) setCurrentUserRole(profile.role);
    });
  }, []);

  const loadInitialData = useCallback(async () => {
    setLoadingData(true);
    setErrorMsg(null);
    try {
      const [driversRes, settlementsRes, sysSettings] = await Promise.all([
        getDrivers(undefined, true),
        getDriverSettlements(),
        getSystemSettings(),
      ]);

      if (sysSettings) {
        setPreSettlementsEnabled(sysSettings.preSettlementsEnabled);
      }
      if (driversRes.data) {
        setDrivers(driversRes.data);
        if (driversRes.data.length > 0 && !selectedDriverId) {
          setSelectedDriverId(driversRes.data[0].id);
        }
      }
      if (settlementsRes.data) {
        setSettlements(settlementsRes.data);
      }
      if (driversRes.error) setErrorMsg(driversRes.error.message);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al cargar módulo de Motoqueros');
    } finally {
      setLoadingData(false);
    }
  }, [selectedDriverId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Load Candidate Pre-Settlement Summary
  const loadCandidateSummary = useCallback(async () => {
    if (!selectedDriverId) return;
    setLoadingCandidate(true);
    setCandidateError(null);

    const cutoffIso = new Date(cutoffAt).toISOString();
    const { summary, error } = await getDriverPreSettlementCandidateSummary(
      selectedDriverId,
      cutoffIso,
      80.00
    );
    setLoadingCandidate(false);

    if (error) {
      setCandidateError(error.message);
      setCandidateSummary(null);
    } else {
      setCandidateSummary(summary);
    }
  }, [selectedDriverId, cutoffAt]);

  useEffect(() => {
    if (activeTab === 'pre_settlement' && selectedDriverId) {
      loadCandidateSummary();
    }
  }, [activeTab, selectedDriverId, cutoffAt, loadCandidateSummary]);

  // Handle Driver Status Toggle
  const handleStatusChange = async (driverId: string, newStatus: DriverStatus) => {
    setErrorMsg(null);
    const { error } = await updateDriverStatus(driverId, newStatus);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setSuccessMsg(`Estado del motoquero actualizado a ${newStatus.toUpperCase()}.`);
    loadInitialData();
  };

  // Calculations for Pre-Settlement
  const grossNetBalance = candidateSummary ? candidateSummary.gross_net_balance : 0;
  const driverBaseShare = candidateSummary ? candidateSummary.driver_base_share : 0;
  const numericBonus = Math.max(0, parseFloat(bonusAmount) || 0);
  const numericDiscount = Math.max(0, parseFloat(discountAmount) || 0);

  const finalNetBalance = Number((grossNetBalance + numericBonus - numericDiscount).toFixed(2));
  const finalPayoutAmount = Number((driverBaseShare + numericBonus - numericDiscount).toFixed(2));

  let resultType: 'motojat_paga' | 'motoquero_rinde' | 'conciliado' = 'conciliado';
  if (finalNetBalance > 0.009) resultType = 'motojat_paga';
  else if (finalNetBalance < -0.009) resultType = 'motoquero_rinde';
  const resultAmount = Math.abs(finalNetBalance);

  // Handle Desired Amount Input (Mode B)
  const handleDesiredAmountChange = (val: string) => {
    setDesiredNetBalance(val);
    const target = parseFloat(val);
    if (isNaN(target)) {
      setBonusAmount('0');
      setDiscountAmount('0');
      return;
    }
    const diff = Number((target - grossNetBalance).toFixed(2));
    if (diff > 0) {
      setBonusAmount(diff.toFixed(2));
      setDiscountAmount('0');
      setDiscountReason('');
    } else if (diff < 0) {
      setBonusAmount('0');
      setDiscountAmount(Math.abs(diff).toFixed(2));
    } else {
      setBonusAmount('0');
      setDiscountAmount('0');
      setDiscountReason('');
    }
  };

  // Pre-Settlement Validation & Actions
  const validateAdjustments = (): boolean => {
    setErrorMsg(null);
    if (numericDiscount > 0 && !discountReason.trim()) {
      setErrorMsg('Debe ingresar obligatoriamente el motivo del descuento aplicado.');
      return false;
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!validateAdjustments() || !selectedDriverId) return;
    setIsSubmittingSettlement(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const { settlementId, error } = await createDriverSettlementAtomic({
      driver_id: selectedDriverId,
      cutoff_at: new Date(cutoffAt).toISOString(),
      bonus_amount: numericBonus,
      discount_amount: numericDiscount,
      discount_reason: numericDiscount > 0 ? discountReason.trim() : undefined,
      status: 'draft',
    });

    setIsSubmittingSettlement(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSuccessMsg(`Pre-liquidación guardada en estado BORRADOR (Draft ID: ${settlementId?.slice(0, 8)}...).`);
    loadInitialData();
    loadCandidateSummary();
  };

  const handleOpenConfirmCloseModal = () => {
    if (!validateAdjustments()) return;
    setIsConfirmCloseModalOpen(true);
  };

  const handleConfirmCloseSettlement = async () => {
    if (!selectedDriverId) return;
    setIsSubmittingSettlement(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const cutoffIso = new Date(cutoffAt).toISOString();
    const commonParams = {
      driver_id: selectedDriverId,
      cutoff_at: cutoffIso,
      bonus_amount: numericBonus,
      discount_amount: numericDiscount,
      discount_reason: numericDiscount > 0 ? discountReason.trim() : undefined,
    };

    let result;
    if (preSettlementsEnabled) {
      result = await createDriverSettlementAtomic({
        ...commonParams,
        status: 'closed',
      });
    } else {
      result = await createAndPayDriverSettlementAtomic(commonParams);
    }

    const { settlementId, error } = result;

    setIsSubmittingSettlement(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setIsConfirmCloseModalOpen(false);
    if (preSettlementsEnabled) {
      setSuccessMsg(`Liquidación CERRADA exitosamente (ID: ${settlementId?.slice(0, 8)}...). El pago podrá ser registrado posteriormente.`);
    } else {
      setSuccessMsg(`Liquidación CERRADA y PAGADA exitosamente (ID: ${settlementId?.slice(0, 8)}...).`);
    }

    // Reset inputs
    setBonusAmount('0');
    setDiscountAmount('0');
    setDiscountReason('');
    setDesiredNetBalance('');

    loadInitialData();
    loadCandidateSummary();
  };

  // Confirm Draft Settlement -> Closed
  const handleConfirmDraftToClosed = async (settlementId: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const { error } = await confirmDraftSettlementAtomic(settlementId);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setSuccessMsg('Liquidación BORRADOR confirmada a CERRADA (Closed) atómicamente.');
    loadInitialData();
  };

  // Mark Settlement as Paid
  const handleOpenPaymentModal = (st: DriverSettlementWithDetails) => {
    setSelectedSettlementForPayment(st);
    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedSettlementForPayment) return;
    setIsSubmittingPayment(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const { error } = await markSettlementAsPaidAtomic(selectedSettlementForPayment.id);
    setIsSubmittingPayment(false);
    setIsPaymentModalOpen(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSuccessMsg(`Pago registrado exitosamente para la liquidación. Estado: PAGADO (Paid).`);
    loadInitialData();
  };

  // Void Settlement
  const handleOpenVoidModal = (st: DriverSettlementWithDetails) => {
    setSelectedSettlementForVoid(st);
    setVoidReason('');
    setIsVoidModalOpen(true);
  };

  const handleConfirmVoid = async () => {
    if (!selectedSettlementForVoid) return;
    if (!voidReason.trim()) {
      setErrorMsg('Debe ingresar la justificación obligatoria para anular la liquidación.');
      return;
    }

    setIsSubmittingVoid(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const { error } = await voidDriverSettlementAtomic(selectedSettlementForVoid.id);
    setIsSubmittingVoid(false);
    setIsVoidModalOpen(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSuccessMsg('Liquidación ANULADA (Voided). Sus carreras han sido liberadas para futura liquidación.');
    loadInitialData();
  };

  // Detail Historical Modal (Reads Snapshot Items)
  const handleOpenDetailModal = async (st: DriverSettlementWithDetails) => {
    setSelectedSettlementForDetail(st);
    setIsDetailModalOpen(true);
    setLoadingDetailItems(true);

    const { data, error } = await getSettlementItemsBySettlementId(st.id);
    setLoadingDetailItems(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setDetailItems(data || []);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <Topbar
        title="Módulo de Motoqueros & Liquidaciones MotoJAT"
        subtitle="Gestión de flota, arqueo de caja previo, módulo transaccional de liquidaciones 80/20 y pagos"
      />

      <main className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 flex-1 max-w-7xl mx-auto w-full">
        {/* Global Feedback Banners */}
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

        {successMsg && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tab Navigation Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#1E293B] p-4 rounded-2xl border border-[#334155] shadow-lg">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('fleet')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'fleet'
                  ? 'bg-[#FDDE12] text-[#0F172A] shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Bike className="w-4 h-4" />
              <span>Flota & Perfiles ({drivers.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('pre_settlement')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'pre_settlement'
                  ? 'bg-[#FDDE12] text-[#0F172A] shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>Pre-liquidación & Cierre 80/20</span>
            </button>

            <button
              onClick={() => setActiveTab('settlements')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'settlements'
                  ? 'bg-[#FDDE12] text-[#0F172A] shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Historial de Liquidaciones ({settlements.length})</span>
            </button>
          </div>

          <div className="text-right text-[11px] text-slate-400 hidden lg:block">
            <span>Operador actual: <strong className="text-white font-semibold">{formatRoleName(currentUserRole)}</strong></span>
          </div>
        </div>

        {/* TAB 1: FLOTA & PERFILES */}
        {activeTab === 'fleet' && (
          <div className="bg-[#1E293B] rounded-2xl border border-[#334155] overflow-hidden shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div>
                <h3 className="text-base font-bold text-white font-heading">Conductores Registrados en MotoJAT</h3>
                <p className="text-xs text-slate-400">Estado operativo y control de flota en tiempo real</p>
              </div>
            </div>

            {loadingData ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
                <span className="text-xs">Cargando flota de motoqueros...</span>
              </div>
            ) : drivers.length === 0 ? (
              <p className="p-8 text-center text-slate-400 text-xs">No hay conductores registrados en el sistema.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {drivers.map((drv) => (
                  <div key={drv.id} className="bg-[#0F172A] border border-[#334155] rounded-xl p-4 space-y-3 shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-[#FDDE12] font-extrabold flex items-center justify-center text-base">
                          #{drv.movil_number}
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-xs">
                            {drv.profile?.full_name || `Motoquero #${drv.movil_number}`}
                          </h4>
                          <p className="text-[11px] text-slate-400">Placa: <strong className="font-mono text-slate-200">{drv.vehicle_plate}</strong></p>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center gap-1 text-amber-400 font-bold text-xs">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          <span>{Number(drv.rating).toFixed(1)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-slate-300 space-y-1 bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
                      <p><span className="text-slate-500">Vehículo:</span> {drv.vehicle_type}</p>
                      <p><span className="text-slate-500">Zona Operativa:</span> {drv.zone}</p>
                      {drv.profile?.phone && <p><span className="text-slate-500">Teléfono:</span> <span className="font-mono text-sky-400">{drv.profile.phone}</span></p>}
                    </div>

                    <div className="pt-2 border-t border-[#334155] flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400">Estado Operativo:</span>
                      {drv.status === 'baja' ? (
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-rose-950/80 border border-rose-800/60 text-rose-400 text-xs font-bold rounded-lg flex items-center gap-1">
                            <Ban className="w-3 h-3" />
                            <span>BAJA (Inactivo)</span>
                          </span>
                          {(!currentUserRole || ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'CEO'].includes((currentUserRole || '').toUpperCase())) && (
                            <button
                              onClick={() => {
                                setReactivationErrorMsg(null);
                                setSelectedDriverForReactivation(drv);
                              }}
                              title="Reactivar a este motoquero"
                              className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/60 text-emerald-300 hover:text-emerald-200 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 flex-shrink-0 cursor-pointer shadow-sm hover:shadow"
                            >
                              <RotateCcw className="w-3 h-3 text-emerald-400" />
                              <span>Reactivar Motoquero</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={drv.status}
                            onChange={(e) => handleStatusChange(drv.id, e.target.value as DriverStatus)}
                            className="bg-[#1E293B] border border-[#334155] text-white text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-[#FDDE12]"
                          >
                            <option value="available">🟢 Disponible</option>
                            <option value="busy">🟡 En Servicio</option>
                            <option value="offline">⚪ Desconectado</option>
                          </select>
                          {(!currentUserRole || ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'CEO'].includes((currentUserRole || '').toUpperCase())) && (
                            <button
                              onClick={() => {
                                setBajaErrorMsg(null);
                                setSelectedDriverForBaja(drv);
                              }}
                              title="Dar de baja a este motoquero"
                              className="px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 hover:text-rose-200 text-[11px] font-semibold rounded-lg transition-colors flex items-center gap-1 flex-shrink-0 cursor-pointer"
                            >
                              <UserX className="w-3 h-3 text-rose-400" />
                              <span>Baja</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PRE-LIQUIDACIÓN & CIERRE 80/20 */}
        {activeTab === 'pre_settlement' && (
          <div className="space-y-6">
            {/* Driver & Cutoff Selection Bar */}
            <div className="bg-[#1E293B] p-5 rounded-2xl border border-[#334155] shadow-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 flex-1">
                <div className="flex-1">
                  <label className="block text-[11px] text-slate-400 mb-1 font-semibold">1. Seleccionar Conductor (Motoquero):</label>
                  <select
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] text-white text-xs rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:border-[#FDDE12]"
                  >
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        Móvil #{d.movil_number} — {d.profile?.full_name || 'Motoquero'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-[11px] text-slate-400 mb-1 font-semibold">2. Fecha / Hora de Corte (cutoff_at):</label>
                  <input
                    type="datetime-local"
                    value={cutoffAt}
                    onChange={(e) => setCutoffAt(e.target.value)}
                    className="w-full bg-[#0F172A] border border-[#334155] text-white text-xs rounded-xl px-3.5 py-2 font-mono font-bold focus:outline-none focus:border-[#FDDE12]"
                  />
                </div>
              </div>

              <div className="flex items-end">
                <button
                  onClick={loadCandidateSummary}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#FDDE12]" />
                  <span>Recalcular Pre-liquidación</span>
                </button>
              </div>
            </div>

            {/* Candidate Pre-Settlement Metrics */}
            {loadingCandidate ? (
              <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-3 bg-[#1E293B] rounded-2xl border border-[#334155]">
                <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
                <span className="text-xs">Filtro de carreras elegibles hasta {new Date(cutoffAt).toLocaleString('es-BO')}...</span>
              </div>
            ) : candidateError ? (
              <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 text-xs">
                {candidateError}
              </div>
            ) : !candidateSummary ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-[#1E293B] rounded-2xl border border-[#334155]">
                Seleccione un motoquero para evaluar carreras pendientes de liquidación.
              </div>
            ) : (
              <div className="space-y-6">
                {/* 4 Cards Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-5 shadow-lg space-y-1">
                    <span className="text-[11px] text-slate-400 font-bold uppercase">FACTURACIÓN BRUTA (T)</span>
                    <div className="text-2xl font-extrabold text-white font-mono">
                      Bs. {candidateSummary.gross_amount.toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-400">{candidateSummary.total_rides} carreras pendientes</p>
                  </div>

                  <div className="bg-[#1E293B] border border-emerald-500/30 rounded-2xl p-5 shadow-lg space-y-1">
                    <span className="text-[11px] text-emerald-400 font-bold uppercase">80% GANANCIA MOTOQUERO</span>
                    <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                      Bs. {candidateSummary.driver_base_share.toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-400">Participación base 80%</p>
                  </div>

                  <div className="bg-[#1E293B] border border-purple-500/30 rounded-2xl p-5 shadow-lg space-y-1">
                    <span className="text-[11px] text-purple-400 font-bold uppercase">20% COMISIÓN MOTOJAT</span>
                    <div className="text-2xl font-extrabold text-purple-400 font-mono">
                      Bs. {candidateSummary.central_commission_amount.toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-400">Comisión central 20%</p>
                  </div>

                  <div className="bg-[#1E293B] border border-amber-500/30 rounded-2xl p-5 shadow-lg space-y-1">
                    <span className="text-[11px] text-amber-400 font-bold uppercase">💵 EFECTIVO + QR EN MANO</span>
                    <div className="text-2xl font-extrabold text-amber-400 font-mono">
                      Bs. {(candidateSummary.cash_collected + candidateSummary.qr_collected).toFixed(2)}
                    </div>
                    <p className="text-[11px] text-slate-400">Efectivo: Bs. {candidateSummary.cash_collected.toFixed(2)} | QR: Bs. {candidateSummary.qr_collected.toFixed(2)}</p>
                  </div>
                </div>

                {/* Adjustments & Dual Mode Panel */}
                <div className="bg-[#1E293B] p-6 rounded-2xl border border-[#334155] shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#334155]">
                    <div>
                      <h4 className="font-bold text-white text-sm font-heading flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#FDDE12]" />
                        <span>Ajustes Financieros (Bonos & Descuentos)</span>
                      </h4>
                      <p className="text-xs text-slate-400">Modifica el saldo neto sin romper la fórmula base 80/20</p>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex items-center gap-1 bg-[#0F172A] p-1 rounded-xl border border-[#334155] text-xs">
                      <button
                        type="button"
                        onClick={() => setInputMode('desired_amount')}
                        className={`px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                          inputMode === 'desired_amount' ? 'bg-[#FDDE12] text-[#0F172A] shadow-sm' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Fijar Monto Final
                      </button>
                      <button
                        type="button"
                        onClick={() => setInputMode('direct')}
                        className={`px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                          inputMode === 'direct' ? 'bg-[#FDDE12] text-[#0F172A] shadow-sm' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Ajustar con Bono/Descuento
                      </button>
                    </div>
                  </div>

                  {inputMode === 'direct' ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-slate-300 font-semibold mb-1">🟢 Bono Adicional (Bs.):</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={bonusAmount}
                          onChange={(e) => setBonusAmount(e.target.value)}
                          className="w-full bg-[#0F172A] border border-[#334155] text-emerald-400 text-xs rounded-xl px-3.5 py-2 font-mono font-bold focus:outline-none focus:border-emerald-500"
                          placeholder="0.00"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-300 font-semibold mb-1">🔴 Descuento (Bs.):</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={discountAmount}
                          onChange={(e) => setDiscountAmount(e.target.value)}
                          className="w-full bg-[#0F172A] border border-[#334155] text-rose-400 text-xs rounded-xl px-3.5 py-2 font-mono font-bold focus:outline-none focus:border-rose-500"
                          placeholder="0.00"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-slate-300 font-semibold mb-1">
                          Motivo del Descuento {numericDiscount > 0 && <span className="text-rose-400 font-bold">* Obligatorio</span>}:
                        </label>
                        <input
                          type="text"
                          value={discountReason}
                          onChange={(e) => setDiscountReason(e.target.value)}
                          disabled={numericDiscount <= 0}
                          className={`w-full bg-[#0F172A] border text-xs rounded-xl px-3.5 py-2 focus:outline-none ${
                            numericDiscount > 0 && !discountReason.trim()
                              ? 'border-rose-500 text-rose-300 placeholder-rose-500/50'
                              : 'border-[#334155] text-white'
                          } disabled:opacity-40`}
                          placeholder={numericDiscount > 0 ? 'Ej: Multa por inasistencia o cobro indebido' : 'No requiere motivo'}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-300 font-semibold mb-1">
                          🎯 Monto Neto Final Deseado a Liquidad (Bs.):
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={desiredNetBalance}
                          onChange={(e) => handleDesiredAmountChange(e.target.value)}
                          className="w-full bg-[#0F172A] border border-[#FDDE12]/50 text-[#FDDE12] text-xs rounded-xl px-3.5 py-2 font-mono font-bold focus:outline-none focus:border-[#FDDE12]"
                          placeholder={`Saldo Base: ${grossNetBalance.toFixed(2)}`}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          Calcula automáticamente Bono (Bs. {numericBonus.toFixed(2)}) o Descuento (Bs. {numericDiscount.toFixed(2)}).
                        </p>
                      </div>

                      {numericDiscount > 0 && (
                        <div>
                          <label className="block text-xs text-slate-300 font-semibold mb-1">
                            Motivo del Descuento Auto-calculado <span className="text-rose-400 font-bold">* Obligatorio</span>:
                          </label>
                          <input
                            type="text"
                            value={discountReason}
                            onChange={(e) => setDiscountReason(e.target.value)}
                            className="w-full bg-[#0F172A] border border-rose-500 text-xs text-white rounded-xl px-3.5 py-2 focus:outline-none"
                            placeholder="Ej: Ajuste acordado por diferencia de caja"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* RESULT BANNER (Dynamic Final Net Balance) */}
                <div className="p-6 bg-[#1E293B] border-2 border-[#334155] rounded-2xl shadow-xl flex flex-col md:flex-row items-stretch justify-between gap-6">
                  <div className="flex-1 space-y-2">
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                      SALDO NETO FINAL [S = (T × 0.80) - EFECTIVO + BONO - DESCUENTO]
                    </span>

                    {resultType === 'motojat_paga' && (
                      <div className="mt-1 space-y-1">
                        <h3 className="text-xl font-extrabold text-emerald-400 flex items-center gap-2 font-heading">
                          <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
                          <span>MOTOJAT DEBE PAGAR AL MOTOQUERO: Bs. {resultAmount.toFixed(2)}</span>
                        </h3>
                        <p className="text-xs text-slate-300">
                          El conductor cobró en mano un importe inferior a su ganancia 80% ajustada. Central le abonará este saldo a favor.
                        </p>
                      </div>
                    )}

                    {resultType === 'motoquero_rinde' && (
                      <div className="mt-1 space-y-1">
                        <h3 className="text-xl font-extrabold text-rose-400 flex items-center gap-2 font-heading">
                          <AlertCircle className="w-6 h-6 flex-shrink-0" />
                          <span>EL MOTOQUERO DEBE RENDIR A MOTOJAT: Bs. {resultAmount.toFixed(2)}</span>
                        </h3>
                        <p className="text-xs text-slate-300">
                          El conductor cobró en mano un importe superior a su ganancia 80% ajustada. Debe rendir el excedente a Central.
                        </p>
                      </div>
                    )}

                    {resultType === 'conciliado' && (
                      <div className="mt-1 space-y-1">
                        <h3 className="text-xl font-extrabold text-sky-400 flex items-center gap-2 font-heading">
                          <ShieldCheck className="w-6 h-6 flex-shrink-0" />
                          <span>LIQUIDACIÓN CONCILIADA EN CERO: Bs. 0.00</span>
                        </h3>
                        <p className="text-xs text-slate-300">Las rendiciones coinciden exactamente con el 80% ajustado.</p>
                      </div>
                    )}
                  </div>

                  <div className="bg-[#0F172A] p-4.5 rounded-xl border border-[#334155] text-xs space-y-2 min-w-[320px] flex flex-col justify-center">
                    <div className="flex justify-between text-slate-400 border-b border-slate-800 pb-1.5">
                      <span>Base 80% Conductor (+):</span>
                      <span className="font-mono font-bold text-emerald-400">Bs. {candidateSummary.driver_base_share.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 border-b border-slate-800 pb-1.5">
                      <span>Efectivo cobrado (-):</span>
                      <span className="font-mono font-bold text-amber-400">Bs. {candidateSummary.cash_collected.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 border-b border-slate-800 pb-1.5">
                      <span>QR cobrado (-):</span>
                      <span className="font-mono font-bold text-amber-300">Bs. {candidateSummary.qr_collected.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 border-b border-slate-800 pb-1.5">
                      <span>Bono (+):</span>
                      <span className="font-mono font-bold text-emerald-300">Bs. {numericBonus.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 border-b border-slate-800 pb-1.5">
                      <span>Descuento (-):</span>
                      <span className="font-mono font-bold text-rose-400">Bs. {numericDiscount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-white font-bold pt-0.5">
                      <span>Saldo Neto Final (S):</span>
                      <span className="font-mono font-extrabold text-lg text-[#FDDE12]">Bs. {finalNetBalance.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Pre-Settlement Actions */}
                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isSubmittingSettlement || candidateSummary.total_rides === 0}
                    onClick={handleOpenConfirmCloseModal}
                    className="px-6 py-3 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-extrabold rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg disabled:opacity-40"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{preSettlementsEnabled ? 'Confirmar y Cerrar Liquidación' : 'Confirmar y Pagar Liquidación'}</span>
                  </button>
                </div>

                {/* Table of Candidate Rides */}
                <div className="bg-[#1E293B] rounded-2xl border border-[#334155] overflow-hidden shadow-xl">
                  <div className="p-4 bg-[#0F172A] border-b border-[#334155] font-bold text-xs text-white flex items-center justify-between">
                    <span>Carreras Elegibles hasta el Cutoff ({candidateSummary.rides.length})</span>
                    <span className="text-[10px] text-slate-400">Filtradas por is_settled = false</span>
                  </div>
                  {candidateSummary.rides.length === 0 ? (
                    <p className="p-8 text-center text-slate-500 text-xs">No hay carreras pendientes para liquidar a este motoquero.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#334155] bg-[#0F172A]/50 text-slate-400 font-semibold uppercase">
                            <th className="py-3 px-4">Código</th>
                            <th className="py-3 px-4">Solicitante / Empresa</th>
                            <th className="py-3 px-4">Origen → Destino</th>
                            <th className="py-3 px-4">Forma Pago</th>
                            <th className="py-3 px-4 text-right">Tarifa Bruta</th>
                            <th className="py-3 px-4 text-right">80% Motoquero</th>
                            <th className="py-3 px-4 text-right">20% MotoJAT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#334155] text-slate-300">
                          {candidateSummary.rides.map((r) => {
                            const fare = Number(r.total_fare);
                            const dShare = Number((fare * 0.8).toFixed(2));
                            const cShare = Number((fare * 0.2).toFixed(2));
                            return (
                              <tr key={r.id} className="hover:bg-[#334155]/30 transition-colors">
                                <td className="py-3 px-4 font-mono font-bold text-sky-400">{r.ride_code}</td>
                                <td className="py-3 px-4">
                                  <p className="font-semibold text-white">{r.requester_person}</p>
                                  <p className="text-[11px] text-indigo-300">{r.requester_company}</p>
                                </td>
                                <td className="py-3 px-4 text-slate-400 text-[11px]">
                                  <span className="line-clamp-1">{r.pickup_address} → {r.destination_address}</span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className="px-2 py-0.5 bg-slate-800 text-slate-200 rounded text-[11px] font-medium">
                                    {r.payment_method || 'Efectivo'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right font-mono font-bold text-white">
                                  Bs. {fare.toFixed(2)}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-emerald-400 font-bold">
                                  Bs. {dShare.toFixed(2)}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-purple-400">
                                  Bs. {cShare.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: HISTORIAL DE LIQUIDACIONES */}
        {activeTab === 'settlements' && (
          <div className="bg-[#1E293B] rounded-2xl border border-[#334155] overflow-hidden shadow-xl">
            <div className="p-5 bg-[#0F172A] border-b border-[#334155] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white font-heading">Historial de Liquidaciones Registradas</h3>
                <p className="text-xs text-slate-400">Trazabilidad de cierres financieros y estado de pagos en Supabase</p>
              </div>
            </div>

            {loadingData ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
                <span className="text-xs">Cargando historial de liquidaciones...</span>
              </div>
            ) : settlements.length === 0 ? (
              <p className="p-12 text-center text-slate-400 text-xs">No hay liquidaciones registradas en el sistema aún.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[800px]">
                  <thead>
                    <tr className="border-b border-[#334155] bg-[#0F172A]/50 text-slate-400 font-semibold uppercase">
                      <th className="py-3.5 px-4">Código / Motoquero</th>
                      <th className="py-3.5 px-4">Cutoff / Período</th>
                      <th className="py-3.5 px-4">Carreras</th>
                      <th className="py-3.5 px-4">Facturación (T)</th>
                      <th className="py-3.5 px-4">20% MotoJAT</th>
                      <th className="py-3.5 px-4">80% Payout</th>
                      <th className="py-3.5 px-4">Saldo Neto (S)</th>
                      <th className="py-3.5 px-4">Estado Cierre</th>
                      <th className="py-3.5 px-4">Estado Pago</th>
                      <th className="py-3.5 px-4">Operador</th>
                      <th className="py-3.5 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#334155] text-slate-300">
                    {settlements.map((st) => {
                      const stStatus = st.settlement_status || st.status;
                      const payStatus = st.payment_status || 'pending_payment';
                      const netBal = st.final_net_balance ?? st.driver_payout_amount;

                      return (
                        <tr key={st.id} className="hover:bg-[#334155]/30 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-white">
                            <span className="font-mono text-sky-400 text-[11px] block">{st.settlement_code || st.id.slice(0, 8)}</span>
                            Móvil #{st.driver?.movil_number} ({st.driver?.profile?.full_name || 'Motoquero'})
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                            {st.cutoff_at ? new Date(st.cutoff_at).toLocaleString('es-BO') : new Date(st.period_end).toLocaleDateString('es-BO')}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-200">{st.total_rides}</td>
                          <td className="py-3.5 px-4 font-mono font-bold text-white">Bs. {Number(st.gross_amount).toFixed(2)}</td>
                          <td className="py-3.5 px-4 font-mono text-purple-400">Bs. {Number(st.central_commission_amount).toFixed(2)}</td>
                          <td className="py-3.5 px-4 font-mono text-emerald-400 font-bold">Bs. {Number(st.driver_payout_amount).toFixed(2)}</td>
                          <td className="py-3.5 px-4 font-mono text-[#FDDE12] font-extrabold">Bs. {Number(netBal).toFixed(2)}</td>
                          
                          {/* Settlement Status */}
                          <td className="py-3.5 px-4">
                            {stStatus === 'closed' && (
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">CLOSED</span>
                            )}
                            {stStatus === 'draft' && (
                              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold">DRAFT</span>
                            )}
                            {stStatus === 'voided' && (
                              <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold">VOIDED</span>
                            )}
                          </td>

                          {/* Payment Status */}
                          <td className="py-3.5 px-4">
                            {payStatus === 'paid' ? (
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-bold">PAID</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold">PENDING</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                            {st.settled_by_profile?.full_name ? (
                              <span>{st.settled_by_profile.full_name} ({formatRoleName(st.settled_by_profile.role)})</span>
                            ) : (
                              'Sistema'
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenDetailModal(st)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-medium flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5 text-sky-400" />
                                <span>Detalle</span>
                              </button>

                              {stStatus === 'draft' && (
                                <button
                                  onClick={() => handleConfirmDraftToClosed(st.id)}
                                  title="Confirmar Borrador a Cerrado"
                                  className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[11px] font-bold"
                                >
                                  Confirmar
                                </button>
                              )}

                              {stStatus === 'closed' && payStatus === 'pending_payment' && (
                                <button
                                  onClick={() => handleOpenPaymentModal(st)}
                                  title="Registrar Pago"
                                  className="px-2 py-1 bg-[#FDDE12]/10 hover:bg-[#FDDE12]/20 text-[#FDDE12] border border-[#FDDE12]/30 rounded-lg text-[11px] font-bold flex items-center gap-1"
                                >
                                  <DollarSign className="w-3 h-3" />
                                  <span>Pagar</span>
                                </button>
                              )}

                              {stStatus === 'closed' && payStatus === 'pending_payment' && (
                                <button
                                  onClick={() => handleOpenVoidModal(st)}
                                  title="Anular Liquidación"
                                  className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              )}
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
        )}
      </main>

      {/* MODAL 1: CONFIRMACIÓN DE CIERRE DE LIQUIDACIÓN */}
      {isConfirmCloseModalOpen && candidateSummary && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Confirmar Cierre Definitivo de Liquidación
                  </h3>
                  <p className="text-xs text-slate-400">Las carreras quedarán bloqueadas de forma irreversible</p>
                </div>
              </div>
              <button
                onClick={() => setIsConfirmCloseModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex justify-between border-b border-[#334155] pb-2">
                <span className="text-slate-400">Total Carreras a Bloquear:</span>
                <span className="font-bold text-white font-mono">{candidateSummary.total_rides}</span>
              </div>
              <div className="flex justify-between border-b border-[#334155] pb-2">
                <span className="text-slate-400">Facturación Bruta (T):</span>
                <span className="font-mono font-bold text-white">Bs. {candidateSummary.gross_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-[#334155] pb-2">
                <span className="text-slate-400">Ganancia Base 80% (+):</span>
                <span className="font-mono text-emerald-400 font-bold">Bs. {candidateSummary.driver_base_share.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-[#334155] pb-2">
                <span className="text-slate-400">Efectivo Cobrado (-):</span>
                <span className="font-mono text-amber-400 font-bold">Bs. {candidateSummary.cash_collected.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-[#334155] pb-2">
                <span className="text-slate-400">QR Cobrado (-):</span>
                <span className="font-mono text-amber-300 font-bold">Bs. {candidateSummary.qr_collected.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-[#334155] pb-2">
                <span className="text-slate-400">Bono (+):</span>
                <span className="font-mono text-emerald-300 font-bold">Bs. {numericBonus.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-[#334155] pb-2">
                <span className="text-slate-400">Descuento (-):</span>
                <span className="font-mono text-rose-400 font-bold">Bs. {numericDiscount.toFixed(2)}</span>
              </div>
              {numericDiscount > 0 && (
                <div className="border-b border-[#334155] pb-2">
                  <span className="text-slate-400 block">Motivo de Descuento:</span>
                  <span className="text-rose-300 font-semibold italic">{discountReason}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 font-extrabold text-sm">
                <span className="text-white">Resultado Final:</span>
                <span className="text-[#FDDE12] font-mono">
                  {resultType === 'motojat_paga' && `MotoJAT Paga: Bs. ${resultAmount.toFixed(2)}`}
                  {resultType === 'motoquero_rinde' && `Motoquero Rinde: Bs. ${resultAmount.toFixed(2)}`}
                  {resultType === 'conciliado' && `Conciliado (Bs. 0.00)`}
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-[11px] flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">
                  {preSettlementsEnabled
                    ? `Al confirmar, las ${candidateSummary.total_rides} carreras seleccionadas quedarán cerradas. El pago podrá ser registrado posteriormente.`
                    : `Al confirmar, las ${candidateSummary.total_rides} carreras seleccionadas quedarán cerradas y el pago al motoquero por Bs. ${finalNetBalance.toFixed(2)} será registrado inmediatamente.`}
                </p>
                <p className="text-[10px] text-amber-200/80 mt-0.5">
                  Verifica los importes antes de confirmar. Esta operación es definitiva.
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmCloseModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isSubmittingSettlement}
                onClick={handleConfirmCloseSettlement}
                className="px-5 py-2 bg-[#FDDE12] hover:bg-[#e2c60e] text-[#0F172A] font-bold rounded-xl text-xs flex items-center gap-2 shadow-md"
              >
                {isSubmittingSettlement && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{preSettlementsEnabled ? 'Confirmar y Cerrar Liquidación' : 'Confirmar y Pagar Liquidación'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: REGISTRO DE PAGO */}
      {isPaymentModalOpen && selectedSettlementForPayment && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Registrar Pago de Liquidación
                  </h3>
                  <p className="text-xs text-slate-400">Móvil #{selectedSettlementForPayment.driver?.movil_number}</p>
                </div>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-4 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Facturación Bruta:</span>
                <span className="text-white font-bold">Bs. {Number(selectedSettlementForPayment.gross_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">80% Conductor:</span>
                <span className="text-emerald-400 font-bold">Bs. {Number(selectedSettlementForPayment.driver_payout_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#334155]">
                <span className="text-white font-bold">Saldo Neto Final:</span>
                <span className="text-[#FDDE12] font-bold text-sm">Bs. {Number(selectedSettlementForPayment.final_net_balance ?? selectedSettlementForPayment.driver_payout_amount).toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isSubmittingPayment}
                onClick={handleConfirmPayment}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md"
              >
                {isSubmittingPayment && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Confirmar Pago (Mark as Paid)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ANULACIÓN DE LIQUIDACIÓN */}
      {isVoidModalOpen && selectedSettlementForVoid && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl">
                  <Ban className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Anular Liquidación
                  </h3>
                  <p className="text-xs text-slate-400">Móvil #{selectedSettlementForVoid.driver?.movil_number}</p>
                </div>
              </div>
              <button
                onClick={() => setIsVoidModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs text-slate-300 font-semibold">
                Justificación Obligatoria para Anulación <span className="text-rose-400">*</span>:
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                className="w-full bg-[#0F172A] border border-[#334155] text-xs text-white rounded-xl p-3 focus:outline-none focus:border-rose-500"
                placeholder="Describa el motivo de la anulación (ej: Error en selección de cutoff o fecha de corte)..."
              />
              <p className="text-[11px] text-slate-400 italic">
                Al anular, las carreras volverán a is_settled = false para poder reliquidarlas en el futuro, conservando el histórico de este cierre anulado.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsVoidModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isSubmittingVoid || !voidReason.trim()}
                onClick={handleConfirmVoid}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md disabled:opacity-40"
              >
                {isSubmittingVoid && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Anular Liquidación</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DETALLE HISTÓRICO Y TRAZABILIDAD SNAPSHOT */}
      {isDetailModalOpen && selectedSettlementForDetail && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl w-full max-w-3xl p-6 shadow-2xl space-y-5 animate-scaleUp max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 rounded-xl">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">
                    Expediente Histórico de Liquidación
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Código: {selectedSettlementForDetail.settlement_code || selectedSettlementForDetail.id} | Móvil #{selectedSettlementForDetail.driver?.movil_number}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Header Snapshot Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-[#0F172A] p-4 rounded-xl border border-[#334155]">
              <div>
                <span className="text-slate-400 block text-[10px]">Facturación Bruta (T):</span>
                <span className="font-bold text-white font-mono text-sm">Bs. {Number(selectedSettlementForDetail.gross_amount).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">20% Central MotoJAT:</span>
                <span className="font-bold text-purple-400 font-mono text-sm">Bs. {Number(selectedSettlementForDetail.central_commission_amount).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">80% Conductor Payout:</span>
                <span className="font-bold text-emerald-400 font-mono text-sm">Bs. {Number(selectedSettlementForDetail.driver_payout_amount).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Saldo Neto Final:</span>
                <span className="font-extrabold text-[#FDDE12] font-mono text-sm">Bs. {Number(selectedSettlementForDetail.final_net_balance ?? selectedSettlementForDetail.driver_payout_amount).toFixed(2)}</span>
              </div>
            </div>

            {/* Snapshot Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-900/50 p-3 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[10px]">Estado Liquidación:</span>
                <span className="font-bold text-white uppercase">{selectedSettlementForDetail.settlement_status || selectedSettlementForDetail.status}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Estado de Pago:</span>
                <span className="font-bold text-emerald-400 uppercase">{selectedSettlementForDetail.payment_status || 'pending_payment'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Operador Responsable:</span>
                <span className="font-bold text-white">
                  {selectedSettlementForDetail.settled_by_profile?.full_name ? (
                    `${selectedSettlementForDetail.settled_by_profile.full_name} (${formatRoleName(selectedSettlementForDetail.settled_by_profile.role)})`
                  ) : (
                    'Sistema'
                  )}
                </span>
              </div>
            </div>

            {/* Adjustments Info */}
            {((selectedSettlementForDetail.bonus_amount || 0) > 0 || (selectedSettlementForDetail.discount_amount || 0) > 0) && (
              <div className="p-3 bg-[#0F172A] border border-[#334155] rounded-xl text-xs space-y-1">
                <span className="font-bold text-white">Ajustes Aplicados en este Cierre:</span>
                {(selectedSettlementForDetail.bonus_amount || 0) > 0 && (
                  <p className="text-emerald-400 font-mono">🟢 Bono: + Bs. {Number(selectedSettlementForDetail.bonus_amount).toFixed(2)}</p>
                )}
                {(selectedSettlementForDetail.discount_amount || 0) > 0 && (
                  <p className="text-rose-400 font-mono">
                    🔴 Descuento: - Bs. {Number(selectedSettlementForDetail.discount_amount).toFixed(2)}
                    {selectedSettlementForDetail.discount_reason && (
                      <span className="text-slate-300 block text-[11px] font-sans font-normal italic">Motivo: {selectedSettlementForDetail.discount_reason}</span>
                    )}
                  </p>
                )}
              </div>
            )}

            {/* Snapshot Table of Driver Settlement Items */}
            <div className="space-y-3">
              <h4 className="font-bold text-xs text-slate-200">
                Carreras Snapshot en driver_settlement_items ({detailItems.length})
              </h4>

              {loadingDetailItems ? (
                <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
                  <Loader2 className="w-5 h-5 animate-spin text-[#FDDE12]" />
                  <span>Cargando carreras desde driver_settlement_items...</span>
                </div>
              ) : detailItems.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No se registran items de liquidación snapshot.</p>
              ) : (
                <div className="overflow-x-auto border border-[#334155] rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#334155] bg-[#0F172A] text-slate-400 font-semibold uppercase">
                        <th className="py-2.5 px-3">Código</th>
                        <th className="py-2.5 px-3">Solicitante</th>
                        <th className="py-2.5 px-3">Origen → Destino</th>
                        <th className="py-2.5 px-3">Pago</th>
                        <th className="py-2.5 px-3 text-right">Tarifa Bruta</th>
                        <th className="py-2.5 px-3 text-right">80% Conductor</th>
                        <th className="py-2.5 px-3 text-right">20% Central</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#334155] bg-[#0F172A]/50 text-slate-300">
                      {detailItems.map((item) => (
                        <tr key={item.id} className={item.is_voided ? 'opacity-40 bg-rose-950/20' : ''}>
                          <td className="py-2.5 px-3 font-mono font-bold text-sky-400">{item.ride_code}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-white block">{item.requester_person || 'Cliente'}</span>
                            <span className="text-[10px] text-indigo-300">{item.requester_company}</span>
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-400">
                            <span className="line-clamp-1">{item.pickup_address} → {item.destination_address}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 bg-slate-800 text-slate-200 rounded text-[10px]">
                              {item.payment_method}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                            Bs. {Number(item.gross_fare).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-400 font-bold">
                            Bs. {Number(item.driver_share_amount).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-purple-400">
                            Bs. {Number(item.central_commission_amount).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#334155] flex justify-end">
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BAJA DE MOTOQUERO */}
      {selectedDriverForBaja && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#1E293B] border border-rose-800/60 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-base">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <span>Confirmar Baja de Motoquero</span>
              </div>
              <button
                onClick={() => setSelectedDriverForBaja(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                ¿Está seguro de dar de baja al motoquero <strong className="text-white">{selectedDriverForBaja.profile?.full_name || 'Motoquero'}</strong> (Móvil <strong className="text-[#FDDE12]">#{selectedDriverForBaja.movil_number}</strong>)?
              </p>
              <div className="p-3 bg-rose-950/40 border border-rose-800/40 rounded-xl space-y-1.5 text-[11px] text-rose-300">
                <p className="font-bold flex items-center gap-1.5">
                  <Ban className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  Efectos de la Baja en el Sistema:
                </p>
                <ul className="list-disc list-inside space-y-1 pl-1 text-slate-300">
                  <li>El motoquero pasará a estado <strong>BAJA (Inactivo)</strong> y no aparecerá disponible para despacho.</li>
                  <li>El <strong>Móvil #{selectedDriverForBaja.movil_number}</strong> quedará disponible para reutilización por un nuevo conductor.</li>
                  <li>Su historial de carreras, liquidaciones y comisiones <strong>permanecerá 100% conservado</strong>.</li>
                </ul>
              </div>

              {bajaErrorMsg && (
                <div className="p-3 bg-rose-950 border border-rose-800 text-rose-200 text-xs rounded-xl font-medium">
                  {bajaErrorMsg}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#334155]">
              <button
                type="button"
                onClick={() => setSelectedDriverForBaja(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deactivatingDriver}
                onClick={handleDeactivateDriverConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50"
              >
                {deactivatingDriver ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Procesando Baja...</span>
                  </>
                ) : (
                  <span>Confirmar Baja</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REACTIVACIÓN DE MOTOQUERO */}
      {selectedDriverForReactivation && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#1E293B] border border-emerald-800/60 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#334155]">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-base font-heading">
                <RotateCcw className="w-5 h-5 text-emerald-400" />
                <span>Confirmar Reactivación de Motoquero</span>
              </div>
              <button
                onClick={() => setSelectedDriverForReactivation(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                ¿Desea reactivar al motoquero <strong className="text-white">{selectedDriverForReactivation.profile?.full_name || 'Motoquero'}</strong> (Móvil histórico: <strong className="text-[#FDDE12]">#{selectedDriverForReactivation.movil_number}</strong>)?
              </p>
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/40 rounded-xl space-y-1.5 text-[11px] text-emerald-300">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  Proceso de Asignación de Móvil:
                </p>
                <p className="text-slate-300 leading-relaxed">
                  El motoquero será reactivado y podrá recibir un nuevo número de móvil. Si su número anterior continúa disponible, será recuperado. Si ya fue reutilizado, se asignará automáticamente el menor número disponible.
                </p>
              </div>

              {reactivationErrorMsg && (
                <div className="p-3 bg-rose-950 border border-rose-800 text-rose-200 text-xs rounded-xl font-medium">
                  {reactivationErrorMsg}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#334155]">
              <button
                type="button"
                onClick={() => setSelectedDriverForReactivation(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={reactivatingDriver}
                onClick={handleReactivateDriverConfirm}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50"
              >
                {reactivatingDriver ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Reactivando...</span>
                  </>
                ) : (
                  <span>Confirmar Reactivación</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
