'use client';

import React, { useState } from 'react';
import { HardDrive, FileSpreadsheet, ShieldAlert, Play, Loader2, CheckCircle2, AlertCircle, Pin } from 'lucide-react';

interface ManualBackupFormProps {
  onSuccess: () => void;
}

export default function ManualBackupForm({ onSuccess }: ManualBackupFormProps) {
  const [backupType, setBackupType] = useState<'technical_dump' | 'export_gestion' | 'pre_restore_snapshot'>('technical_dump');
  const [startDate, setStartDate] = useState<string>(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isPermanent, setIsPermanent] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let endpoint = '/api/admin/backups/create';
      let payload: any = {
        backup_type: backupType,
        is_permanent: isPermanent,
      };

      if (backupType === 'export_gestion') {
        endpoint = '/api/admin/exports/gestion';
        payload = {
          start_date: startDate,
          end_date: endDate,
          is_permanent: isPermanent,
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al solicitar el backup.');
      }

      setSuccessMsg(`Generación completada exitosamente. Código: ${data.backupCode}`);
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#1E293B] border border-slate-700 rounded-xl p-6 shadow-xl max-w-3xl">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Play className="w-5 h-5 text-emerald-400" />
          Generación Manual de Backups & Exportaciones
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Seleccione el tipo de backup que desea generar. El proceso se ejecutará de forma server-side y quedará auditado en la bitácora con hash SHA-256 de verificación.
        </p>
      </div>

      {errorMsg && (
        <div className="mb-5 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-5 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Selector de Tipo */}
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            1. Tipo de Respaldo
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Option 1: Technical Dump */}
            <div
              onClick={() => setBackupType('technical_dump')}
              className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                backupType === 'technical_dump'
                  ? 'bg-emerald-500/10 border-emerald-500 text-white'
                  : 'bg-[#0F172A] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <HardDrive className={`w-5 h-5 ${backupType === 'technical_dump' ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className="text-[10px] uppercase font-bold text-slate-500">Técnico</span>
                </div>
                <h4 className="text-xs font-bold mb-1">Backup Técnico Full</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  DDL completo (22 tablas, RPCs), dataset JSON y archivos físicos (Avatars, Contratos).
                </p>
              </div>
            </div>

            {/* Option 2: Export Gestion */}
            <div
              onClick={() => setBackupType('export_gestion')}
              className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                backupType === 'export_gestion'
                  ? 'bg-emerald-500/10 border-emerald-500 text-white'
                  : 'bg-[#0F172A] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <FileSpreadsheet className={`w-5 h-5 ${backupType === 'export_gestion' ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className="text-[10px] uppercase font-bold text-slate-500">Gestión CSV</span>
                </div>
                <h4 className="text-xs font-bold mb-1">Exportación Histórica</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  ZIP con 15 CSVs administrativos filtrados por rango relacional de fechas + MANIFEST.json.
                </p>
              </div>
            </div>

            {/* Option 3: Pre-Restore Snapshot */}
            <div
              onClick={() => setBackupType('pre_restore_snapshot')}
              className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                backupType === 'pre_restore_snapshot'
                  ? 'bg-emerald-500/10 border-emerald-500 text-white'
                  : 'bg-[#0F172A] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <ShieldAlert className={`w-5 h-5 ${backupType === 'pre_restore_snapshot' ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span className="text-[10px] uppercase font-bold text-slate-500">Snapshot</span>
                </div>
                <h4 className="text-xs font-bold mb-1">Snapshot Pre-Restore</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Backup de seguridad preventivo antes de aplicar intervenciones o cambios en BD.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Dates for Export Gestion */}
        {backupType === 'export_gestion' && (
          <div className="bg-[#0F172A] p-4 rounded-xl border border-slate-800 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
              Rango de Fechas para Exportación de Gestión
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Fecha Inicio (Desde)</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-[#1E293B] border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Fecha Fin (Hasta)</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-[#1E293B] border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Retención Permanente Checkbox */}
        <div className="flex items-center gap-3 bg-[#0F172A] p-3 rounded-lg border border-slate-800">
          <input
            type="checkbox"
            id="is_permanent"
            checked={isPermanent}
            onChange={(e) => setIsPermanent(e.target.checked)}
            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
          />
          <label htmlFor="is_permanent" className="text-xs text-slate-300 cursor-pointer flex items-center gap-1.5">
            <Pin className="w-3.5 h-3.5 text-indigo-400" />
            <span>Marcar como retención permanente (Exento de eliminación por política de caducidad)</span>
          </label>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg transition disabled:opacity-50 shadow-lg shadow-emerald-950/40"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Procesando backup server-side...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Iniciar Generación de Backup
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
