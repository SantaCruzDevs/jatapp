'use client';

import React, { useEffect, useState } from 'react';
import { Settings, Save, Loader2, CheckCircle2, AlertCircle, ShieldAlert, Clock, Calendar, Lock } from 'lucide-react';

interface BackupSettingsTabProps {
  userRole: string;
}

export default function BackupSettingsTab({ userRole }: BackupSettingsTabProps) {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [frequency, setFrequency] = useState<string>('daily');
  const [retentionDays, setRetentionDays] = useState<string>('30');
  const [allowAdminBackup, setAllowAdminBackup] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isSuperAdmin = userRole === 'SUPERADMIN';

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/backups/settings');
      const data = await res.json();

      if (data.success && data.settings) {
        setEnabled(data.settings.BACKUP_SCHEDULER_ENABLED === 'true');
        setFrequency(data.settings.BACKUP_SCHEDULER_FREQUENCY || 'daily');
        setRetentionDays(data.settings.BACKUP_RETENTION_DAYS || '30');
        setAllowAdminBackup(data.settings.ALLOW_ADMIN_BACKUP === 'true');
      }
    } catch (err) {
      console.error('Error loading backup settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;

    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/backups/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          BACKUP_SCHEDULER_ENABLED: enabled ? 'true' : 'false',
          BACKUP_SCHEDULER_FREQUENCY: frequency,
          BACKUP_RETENTION_DAYS: retentionDays,
          ALLOW_ADMIN_BACKUP: allowAdminBackup ? 'true' : 'false',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al guardar la configuración.');
      }

      setSuccessMsg('Configuración guardada exitosamente.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#1E293B] border border-slate-700 rounded-xl p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
        <span>Cargando parámetros de configuración...</span>
      </div>
    );
  }

  return (
    <div className="bg-[#1E293B] border border-slate-700 rounded-xl p-6 shadow-xl max-w-3xl space-y-6">
      <div className="flex items-start justify-between border-b border-slate-700 pb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" />
            Configuración del Scheduler Automático & Políticas de Retención
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Administre la frecuencia del Cron de Vercel y la caducidad de retención de archivos de respaldo en Storage.
          </p>
        </div>
        {!isSuperAdmin && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold rounded-lg shrink-0">
            <Lock className="w-3.5 h-3.5" /> Modo Lectura (Solo Soporte)
          </span>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* 1. Scheduler Toggle */}
        <div className="bg-[#0F172A] p-4 rounded-xl border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Scheduler Automático de Backups (Vercel Cron)
            </h4>
            <p className="text-[11px] text-slate-400">
              Activa o desactiva la ejecución periódica automatizada en la ruta `/api/cron/backup`.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              disabled={!isSuperAdmin}
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        {/* 2. Frequency & Retention Days */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[#0F172A] p-4 rounded-xl border border-slate-800 space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Frecuencia de Ejecución
            </label>
            <select
              disabled={!isSuperAdmin}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full bg-[#1E293B] border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              <option value="daily">Diario (Todos los días a las 02:00 AM)</option>
              <option value="weekly">Semanal (Cada domingo)</option>
              <option value="monthly">Mensual (El primer día de cada mes)</option>
            </select>
          </div>

          <div className="bg-[#0F172A] p-4 rounded-xl border border-slate-800 space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Días de Retención Automática
            </label>
            <select
              disabled={!isSuperAdmin}
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              className="w-full bg-[#1E293B] border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              <option value="30">30 Días (Recomendado)</option>
              <option value="60">60 Días</option>
              <option value="90">90 Días</option>
              <option value="180">180 Días</option>
            </select>
          </div>
        </div>

        {/* 3. Permiso de Backup para Rol ADMIN */}
        <div className="bg-[#0F172A] p-4 rounded-xl border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              Permitir Generación de Backups a Rol Administrador (`ALLOW_ADMIN_BACKUP`)
            </h4>
            <p className="text-[11px] text-slate-400">
              Si está deshabilitado, únicamente el rol Soporte puede consultar y generar backups.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              disabled={!isSuperAdmin}
              checked={allowAdminBackup}
              onChange={(e) => setAllowAdminBackup(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        {/* Submit Button */}
        {isSuperAdmin && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg transition disabled:opacity-50 shadow-lg shadow-emerald-950/40"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando cambios...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Guardar Configuración
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
