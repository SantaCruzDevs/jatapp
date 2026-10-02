'use client';

import React, { useState } from 'react';
import { 
  Download, 
  FileCode, 
  ShieldCheck, 
  Pin, 
  PinOff, 
  Copy, 
  Check, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  HardDrive,
  FileSpreadsheet,
  RefreshCw
} from 'lucide-react';

interface BackupItem {
  id: string;
  backup_code: string;
  backup_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  storage_path?: string | null;
  file_size_bytes?: number | null;
  sha256_checksum?: string | null;
  manifest_json?: any;
  is_permanent: boolean;
  created_at: string;
  profiles?: {
    email?: string;
    full_name?: string;
    role?: string;
  } | null;
}

interface BackupsHistoryTableProps {
  backups: BackupItem[];
  userRole: string;
  loading: boolean;
  onRefresh: () => void;
  onOpenManifest: (backup: BackupItem) => void;
  onTogglePermanent: (id: string, currentStatus: boolean) => Promise<void>;
  onDownload: (id: string, backupCode: string) => Promise<void>;
}

export default function BackupsHistoryTable({
  backups,
  userRole,
  loading,
  onRefresh,
  onOpenManifest,
  onTogglePermanent,
  onDownload,
}: BackupsHistoryTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const handleCopyHash = (id: string, hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadClick = async (id: string, code: string) => {
    setDownloadingId(id);
    try {
      await onDownload(id, code);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleToggleClick = async (id: string, current: boolean) => {
    setTogglingId(id);
    try {
      await onTogglePermanent(id, current);
    } finally {
      setTogglingId(null);
    }
  };

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('es-BO', {
        timeZone: 'America/La_Paz',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const filteredBackups = backups.filter((b) => {
    if (filterType !== 'all' && b.backup_type !== filterType) return false;
    if (filterStatus !== 'all' && b.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header Filters & Refresh */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#1E293B] p-4 rounded-xl border border-slate-700">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Tipo</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-[#0F172A] border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">Todos los tipos</option>
              <option value="technical_dump">Técnico (Full DDL + JSON)</option>
              <option value="export_gestion">Exportación CSV/ZIP</option>
              <option value="administrative_export">Exportación Histórica</option>
              <option value="pre_restore_snapshot">Pre-Restore Snapshot</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Estado</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-[#0F172A] border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">Todos los estados</option>
              <option value="completed">🟢 Completados</option>
              <option value="running">🟡 Ejecutando</option>
              <option value="failed">🔴 Fallidos</option>
              <option value="pending">⚪ Pendientes</option>
            </select>
          </div>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar Bitácora
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#1E293B] border border-slate-700 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0F172A] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700">
              <tr>
                <th className="px-4 py-3">Tipo / Código</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha (BO)</th>
                <th className="px-4 py-3">Creador</th>
                <th className="px-4 py-3">Tamaño</th>
                <th className="px-4 py-3">Checksum SHA-256</th>
                <th className="px-4 py-3">Retención</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading && backups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                      <span>Cargando historial de backups...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredBackups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    No se encontraron registros de backup con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredBackups.map((b) => {
                  const isTech = b.backup_type === 'technical_dump' || b.backup_type === 'pre_restore_snapshot';
                  return (
                    <tr key={b.id} className="hover:bg-slate-800/50 transition">
                      {/* Code & Type */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-1.5 rounded-md ${
                              isTech ? 'bg-indigo-500/10 text-indigo-400' : 'bg-emerald-500/10 text-emerald-400'
                            }`}
                          >
                            {isTech ? <HardDrive className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4" />}
                          </div>
                          <div>
                            <span className="font-mono font-bold text-slate-100 block">{b.backup_code}</span>
                            <span className="text-[10px] text-slate-400">
                              {b.backup_type === 'technical_dump'
                                ? 'Técnico DDL'
                                : b.backup_type === 'pre_restore_snapshot'
                                ? 'Snapshot Pre-Restore'
                                : 'Exportación CSV'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {b.status === 'completed' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Completado
                          </span>
                        )}
                        {b.status === 'running' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" /> Ejecutando
                          </span>
                        )}
                        {b.status === 'failed' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <AlertCircle className="w-3 h-3" /> Fallido
                          </span>
                        )}
                        {b.status === 'pending' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-700/50 text-slate-400 border border-slate-600">
                            <Clock className="w-3 h-3" /> Pendiente
                          </span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-slate-300 font-mono text-[11px]">
                        {formatDate(b.created_at)}
                      </td>

                      {/* Creator */}
                      <td className="px-4 py-3">
                        <span className="text-slate-200 block truncate max-w-[140px]">
                          {b.profiles?.full_name || b.profiles?.email || 'Sistema / Cron'}
                        </span>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {b.profiles?.role || 'SYSTEM'}
                        </span>
                      </td>

                      {/* Size */}
                      <td className="px-4 py-3 font-mono text-slate-300">
                        {formatSize(b.file_size_bytes)}
                      </td>

                      {/* SHA-256 Checksum */}
                      <td className="px-4 py-3">
                        {b.sha256_checksum ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-emerald-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                              {b.sha256_checksum.substring(0, 8)}...{b.sha256_checksum.substring(56)}
                            </span>
                            <button
                              onClick={() => handleCopyHash(b.id, b.sha256_checksum!)}
                              title="Copiar Hash SHA-256 completo"
                              className="text-slate-400 hover:text-white p-1 rounded transition"
                            >
                              {copiedId === b.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-mono">—</span>
                        )}
                      </td>

                      {/* Retention */}
                      <td className="px-4 py-3">
                        {b.is_permanent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <Pin className="w-3 h-3" /> Permanente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-normal bg-slate-800 text-slate-400">
                            Automático
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Manifest Button */}
                          {b.manifest_json && (
                            <button
                              onClick={() => onOpenManifest(b)}
                              title="Ver Detalle del Manifiesto"
                              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition"
                            >
                              <FileCode className="w-4 h-4 text-cyan-400" />
                            </button>
                          )}

                          {/* Toggle Permanent Button (SUPERADMIN only) */}
                          {userRole === 'SUPERADMIN' && (
                            <button
                              onClick={() => handleToggleClick(b.id, b.is_permanent)}
                              disabled={togglingId === b.id}
                              title={b.is_permanent ? 'Quitar Retención Permanente' : 'Marcar como Retención Permanente'}
                              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition disabled:opacity-50"
                            >
                              {togglingId === b.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                              ) : b.is_permanent ? (
                                <PinOff className="w-4 h-4 text-indigo-400" />
                              ) : (
                                <Pin className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                          )}

                          {/* Download Signed URL Button */}
                          {b.status === 'completed' && b.storage_path && (
                            <button
                              onClick={() => handleDownloadClick(b.id, b.backup_code)}
                              disabled={downloadingId === b.id}
                              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[11px] font-medium transition disabled:opacity-50 shadow-sm"
                            >
                              {downloadingId === b.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                              ZIP
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
