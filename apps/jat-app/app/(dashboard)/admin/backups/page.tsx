'use client';

import React, { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import { History, Play, Settings, ShieldAlert } from 'lucide-react';
import BackupsHistoryTable from '@/components/admin/backups/BackupsHistoryTable';
import ManualBackupForm from '@/components/admin/backups/ManualBackupForm';
import BackupSettingsTab from '@/components/admin/backups/BackupSettingsTab';
import ManifestModal from '@/components/admin/backups/ManifestModal';

export default function BackupsAdminPage() {
  const [activeTab, setActiveTab] = useState<'history' | 'generate' | 'settings'>('history');
  const [backups, setBackups] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>('CLIENT_USER');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Manifest Modal State
  const [selectedManifest, setSelectedManifest] = useState<{
    isOpen: boolean;
    backupCode: string;
    manifest: any;
    sha256Checksum?: string | null;
  }>({
    isOpen: false,
    backupCode: '',
    manifest: null,
  });

  const fetchBackups = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/backups?limit=100');
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No fue posible cargar el historial de backups.');
      }

      setBackups(data.backups || []);
      setUserRole(data.userRole || 'CLIENT_USER');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleOpenManifest = (backup: any) => {
    setSelectedManifest({
      isOpen: true,
      backupCode: backup.backup_code,
      manifest: backup.manifest_json,
      sha256Checksum: backup.sha256_checksum,
    });
  };

  const handleTogglePermanent = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch('/api/admin/backups/toggle-permanent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_permanent: !currentStatus }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al actualizar retención permanente.');
      }

      fetchBackups();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDownload = async (id: string, backupCode: string) => {
    try {
      const res = await fetch(`/api/admin/backups/download?id=${id}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.signedUrl) {
        throw new Error(data.error || 'Error al obtener la URL de descarga.');
      }

      // Trigger file download
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = `JATapp_${backupCode}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Error en descarga: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0F172A] text-slate-100 min-h-screen">
      <Topbar title="Gestión Administrativa de Backups" subtitle="Bitácora de respaldos técnicos, exportaciones históricas y scheduler" />

      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 pb-3">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'history'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                : 'bg-[#1E293B] text-slate-300 hover:bg-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            Historial & Bitácora ({backups.length})
          </button>

          <button
            onClick={() => setActiveTab('generate')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'generate'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                : 'bg-[#1E293B] text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Play className="w-4 h-4" />
            Generación Manual
          </button>

          {userRole === 'SUPERADMIN' && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'settings'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                  : 'bg-[#1E293B] text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
              Configuración Scheduler & Retención
            </button>
          )}
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tab 1: History Table */}
        {activeTab === 'history' && (
          <BackupsHistoryTable
            backups={backups}
            userRole={userRole}
            loading={loading}
            onRefresh={fetchBackups}
            onOpenManifest={handleOpenManifest}
            onTogglePermanent={handleTogglePermanent}
            onDownload={handleDownload}
          />
        )}

        {/* Tab 2: Manual Backup Form */}
        {activeTab === 'generate' && (
          <ManualBackupForm
            onSuccess={() => {
              fetchBackups();
              setActiveTab('history');
            }}
          />
        )}

        {/* Tab 3: Settings Tab */}
        {activeTab === 'settings' && <BackupSettingsTab userRole={userRole} />}
      </main>

      {/* Manifest Detail Modal */}
      <ManifestModal
        isOpen={selectedManifest.isOpen}
        onClose={() => setSelectedManifest({ ...selectedManifest, isOpen: false })}
        backupCode={selectedManifest.backupCode}
        manifest={selectedManifest.manifest}
        sha256Checksum={selectedManifest.sha256Checksum}
      />
    </div>
  );
}
