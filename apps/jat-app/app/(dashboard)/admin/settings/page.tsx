'use client';

import React, { useState, useEffect } from 'react';
import Topbar from '@/components/layout/Topbar';
import { getSystemSettings, saveSystemSettings, TicketFormat } from '@/lib/services/system-settings';
import { createClient } from '@/lib/supabase/client';
import { UserRole } from '@/types/database.types';
import { 
  Settings, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Save,
  X,
  FileCheck2,
  FileCode2,
  Building2,
  ToggleLeft,
  ToggleRight,
  HelpCircle
} from 'lucide-react';

export default function SettingsAdminPage() {
  const [activeUserRole, setActiveUserRole] = useState<UserRole | null>(null);
  const [loadingRole, setLoadingRole] = useState<boolean>(true);
  const [ticketFormat, setTicketFormat] = useState<TicketFormat>('detailed');
  const [companyPortalEnabled, setCompanyPortalEnabled] = useState<boolean>(false);
  const [preSettlementsEnabled, setPreSettlementsEnabled] = useState<boolean>(false);
  const [loadingSetting, setLoadingSetting] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal State for Confirmation
  const [showPortalConfirmModal, setShowPortalConfirmModal] = useState<boolean>(false);
  const [pendingPortalState, setPendingPortalState] = useState<boolean | null>(null);

  // 1. Load active user role
  useEffect(() => {
    async function loadUserRole() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
          if (prof?.role) {
            setActiveUserRole(prof.role as UserRole);
          }
        }
      } catch (e) {
        console.error('Error loading active role:', e);
      } finally {
        setLoadingRole(false);
      }
    }
    loadUserRole();
  }, []);

  // 2. Load system settings
  useEffect(() => {
    async function loadSetting() {
      setLoadingSetting(true);
      try {
        const settings = await getSystemSettings();
        setTicketFormat(settings.ticketFormat);
        setCompanyPortalEnabled(settings.companyPortalEnabled);
        setPreSettlementsEnabled(settings.preSettlementsEnabled);
      } catch (e) {
        console.error('Error loading settings:', e);
      } finally {
        setLoadingSetting(false);
      }
    }
    loadSetting();
  }, []);

  const handleTogglePortalClick = (nextState: boolean) => {
    if (nextState === companyPortalEnabled) return;
    setPendingPortalState(nextState);
    setShowPortalConfirmModal(true);
  };

  const confirmPortalToggle = async () => {
    if (pendingPortalState === null) return;
    const targetVal = pendingPortalState;
    setShowPortalConfirmModal(false);
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await saveSystemSettings({ companyPortalEnabled: targetVal });
      if (res.success) {
        setCompanyPortalEnabled(targetVal);
        setSuccessMsg(
          targetVal
            ? 'Portal para Empresas ACTIVADO exitosamente.'
            : 'Portal para Empresas DESACTIVADO exitosamente.'
        );
      } else {
        setErrorMsg(res.error || 'Error al actualizar el estado del portal.');
      }
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al cambiar estado del portal.');
    } finally {
      setSaving(false);
      setPendingPortalState(null);
    }
  };

  const handleTogglePreSettlements = async (nextState: boolean) => {
    if (nextState === preSettlementsEnabled) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await saveSystemSettings({ preSettlementsEnabled: nextState });
      if (res.success) {
        setPreSettlementsEnabled(nextState);
        setSuccessMsg(
          nextState
            ? 'Pre-liquidaciones ACTIVADAS. Las liquidaciones requerirán cierre previo antes del pago.'
            : 'Pre-liquidaciones DESACTIVADAS. Las liquidaciones se cerrarán y pagarán en un solo paso atómico.'
        );
      } else {
        setErrorMsg(res.error || 'Error al actualizar el estado de pre-liquidaciones.');
      }
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error al cambiar estado de pre-liquidaciones.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await saveSystemSettings({
        ticketFormat,
        companyPortalEnabled,
      });
      if (res.success) {
        setSuccessMsg('Configuración guardada exitosamente.');
      } else {
        setErrorMsg(res.error || 'Error al guardar la configuración.');
      }
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error inesperado al guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingRole || loadingSetting) {
    return (
      <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
        <Topbar
          title="Configuraciones del Sistema"
          subtitle="Ajustes y parámetros globales de operación JATapp"
        />
        <div className="flex-1 flex items-center justify-center p-12 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#FDDE12]" />
          <span className="text-xs font-medium">Cargando módulo de configuraciones...</span>
        </div>
      </div>
    );
  }

  // Access Control: ONLY SUPERADMIN (Soporte)
  if (activeUserRole !== 'SUPERADMIN') {
    return (
      <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
        <Topbar
          title="Configuraciones del Sistema"
          subtitle="Ajustes y parámetros globales de operación JATapp"
        />
        <main className="p-8 max-w-2xl mx-auto w-full">
          <div className="bg-rose-950/80 border border-rose-800 text-rose-200 rounded-2xl p-6 shadow-xl space-y-3 text-center">
            <ShieldAlert className="w-12 h-12 mx-auto text-rose-400" />
            <h2 className="text-base font-bold font-heading">Acceso Restringido a Soporte</h2>
            <p className="text-xs text-slate-300">
              Esta sección de configuración global está reservada únicamente para el rol de <strong>Soporte</strong>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0F172A]">
      <Topbar
        title="Configuraciones del Sistema"
        subtitle="Gestión autoritativa de formatos y parámetros de la plataforma MotoJAT"
      />

      <main className="p-8 max-w-3xl space-y-6">
        {/* Banner Alert Messages */}
        {errorMsg && (
          <div className="p-4 bg-rose-950/80 border border-rose-800 text-rose-200 rounded-xl text-xs flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-emerald-950/80 border border-emerald-800 text-emerald-200 rounded-xl text-xs flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Feature Flag Card: Portal para Empresas */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-[#334155] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-xl">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold font-heading text-white flex items-center gap-2">
                  <span>Portal para Empresas</span>
                  <span className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full border ${
                    companyPortalEnabled
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-700/50 text-slate-400 border-slate-600'
                  }`}>
                    {companyPortalEnabled ? 'Activado' : 'Desactivado'}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Feature flag global que habilita o restringe el acceso de usuarios cliente externos</p>
              </div>
            </div>

            {/* Switch Toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleTogglePortalClick(!companyPortalEnabled)}
                disabled={saving}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-xs transition-all disabled:opacity-50 ${
                  companyPortalEnabled
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 hover:bg-emerald-600/30'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'
                }`}
              >
                {companyPortalEnabled ? (
                  <>
                    <ToggleRight className="w-5 h-5 text-emerald-400" />
                    <span>Activado</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-5 h-5 text-slate-500" />
                    <span>Desactivado</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="p-6 bg-[#0F172A]/40 space-y-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              Permite a las empresas clientes acceder a JATapp para consultar sus tickets corporativos, cuenta corriente, historial de carreras y reportes.
            </p>
            <div className="text-[11px] text-slate-400 bg-[#0F172A] p-3.5 rounded-xl border border-[#334155]/60 flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Nota de Operación Interna:</strong> Desactivar esta opción bloquea exclusivamente el acceso de usuarios externos con rol <code>CLIENT_USER</code> al portal. Las funciones administrativas de MotoJAT para empresas en <code>/admin/companies</code> continúan funcionando normalmente.
              </span>
            </div>
          </div>
        </div>

        {/* Feature Flag Card: Pre-liquidaciones Habilitadas */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-[#334155] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
                <Settings className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold font-heading text-white flex items-center gap-2">
                  <span>Pre-liquidaciones habilitadas</span>
                  <span className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full border ${
                    preSettlementsEnabled
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-slate-700/50 text-slate-400 border-slate-600'
                  }`}>
                    {preSettlementsEnabled ? 'Activado (2 etapas)' : 'Desactivado (1 paso)'}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Permite revisar y cerrar una liquidación antes de registrar el pago al motoquero.</p>
              </div>
            </div>

            {/* Switch Toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleTogglePreSettlements(!preSettlementsEnabled)}
                disabled={saving}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-xs transition-all disabled:opacity-50 ${
                  preSettlementsEnabled
                    ? 'bg-amber-600/20 border-amber-500 text-amber-300 hover:bg-amber-600/30'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'
                }`}
              >
                {preSettlementsEnabled ? (
                  <>
                    <ToggleRight className="w-5 h-5 text-amber-400" />
                    <span>Activado</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-5 h-5 text-slate-500" />
                    <span>Desactivado</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="p-6 bg-[#0F172A]/40 space-y-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>Modo Desactivado (Por defecto):</strong> Al liquidar a un motoquero, la transacción se ejecuta en un solo paso atómico (<em>Confirmar y Pagar Liquidación</em>), registrando el cierre y el pago de forma inmediata (<code>CLOSED + PAID</code>).
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>Modo Activado:</strong> Permite cerrar la liquidación en estado de pago pendiente (<code>CLOSED + PENDING</code>) y registrar el pago manualmente en una etapa posterior.
            </p>
          </div>
        </div>

        {/* Configuration Card: Formato de Ticket */}
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-[#334155] flex items-center gap-3">
            <div className="p-2.5 bg-[#FDDE12]/10 border border-[#FDDE12]/30 text-[#FDDE12] rounded-xl">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold font-heading text-white">Formato de Ticket Digital de Servicio</h2>
              <p className="text-xs text-slate-400">Seleccione la plantilla por defecto para la generación y emisión de comprobantes MotoJAT</p>
            </div>
          </div>

          <form onSubmit={handleSaveSettings} className="p-6 space-y-6">
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Selección de Plantilla
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Option 1: Detailed Ticket */}
                <label 
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-3 ${
                    ticketFormat === 'detailed'
                      ? 'bg-[#0F172A] border-[#FDDE12] shadow-lg'
                      : 'bg-[#0F172A]/50 border-[#334155] hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${ticketFormat === 'detailed' ? 'bg-[#FDDE12] text-[#0F172A]' : 'bg-[#1E293B] text-slate-400'}`}>
                        <FileCheck2 className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="font-bold text-sm text-white block">Ticket Detallado</span>
                        <span className="text-[10px] text-emerald-400 font-semibold uppercase">Formato Completo</span>
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="ticketFormat"
                      value="detailed"
                      checked={ticketFormat === 'detailed'}
                      onChange={() => setTicketFormat('detailed')}
                      className="mt-1 accent-[#FDDE12] w-4 h-4 cursor-pointer"
                    />
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Incluye plantilla moderna con desglose completo, conductor destacado, información comercial y <strong>trazabilidad / historial de eventos (Timeline)</strong>.
                  </p>
                </label>

                {/* Option 2: Simple Ticket */}
                <label 
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-3 ${
                    ticketFormat === 'simple'
                      ? 'bg-[#0F172A] border-[#FDDE12] shadow-lg'
                      : 'bg-[#0F172A]/50 border-[#334155] hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${ticketFormat === 'simple' ? 'bg-[#FDDE12] text-[#0F172A]' : 'bg-[#1E293B] text-slate-400'}`}>
                        <FileCode2 className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="font-bold text-sm text-white block">Ticket Simple</span>
                        <span className="text-[10px] text-amber-400 font-semibold uppercase">Formato Comprobante</span>
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="ticketFormat"
                      value="simple"
                      checked={ticketFormat === 'simple'}
                      onChange={() => setTicketFormat('simple')}
                      className="mt-1 accent-[#FDDE12] w-4 h-4 cursor-pointer"
                    />
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Presentación limpia estilo recibo de envío. Muestra la misma información comercial y económica del servicio, pero <strong>sin historial ni horas de trazabilidad</strong>.
                  </p>
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-[#334155] flex items-center justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-[#FDDE12] hover:bg-[#E5C800] text-[#0F172A] font-bold rounded-xl text-xs transition-all font-heading uppercase flex items-center gap-2 disabled:opacity-50 shadow-md"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Guardar Cambios</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Confirmation Modal for Feature Flag */}
      {showPortalConfirmModal && pendingPortalState !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-base font-bold font-heading text-white">
                {pendingPortalState ? 'Confirmar Activación del Portal' : 'Confirmar Desactivación del Portal'}
              </h3>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              {pendingPortalState
                ? '¿Está seguro de activar el Portal para Empresas? Los usuarios de empresas clientes podrán iniciar sesión y consultar su información corporativa.'
                : '¿Está seguro de desactivar el Portal para Empresas? Los usuarios clientes perderán acceso al portal hasta que vuelva a ser activado.'}
            </p>

            <div className="pt-3 border-t border-[#334155] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowPortalConfirmModal(false);
                  setPendingPortalState(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmPortalToggle}
                className={`px-4 py-2 rounded-xl text-xs font-bold font-heading uppercase shadow-md ${
                  pendingPortalState
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950'
                    : 'bg-rose-600 hover:bg-rose-700 text-white'
                }`}
              >
                {pendingPortalState ? 'Sí, Activar Portal' : 'Sí, Desactivar Portal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
