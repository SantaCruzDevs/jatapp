'use client';

import React, { useState, useEffect } from 'react';
import { subscribeConnectionStatus, ConnectionState } from '@/lib/offline/status';
import { getPendingOfflineOperations, OfflineOperation } from '@/lib/offline/db';
import { syncOfflineOperations } from '@/lib/services/offline-sync';
import { WifiOff, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function OfflineBanner() {
  const [connState, setConnState] = useState<ConnectionState>({
    isOnline: true,
    isBackendReachable: true,
    isContingencyMode: false,
    lastCheckedAt: new Date().toISOString(),
  });

  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncNotification, setSyncNotification] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeConnectionStatus((state) => {
      setConnState(state);
      if (!state.isContingencyMode) {
        // Auto-trigger sync when connection is restored
        handleTriggerSync();
      }
    });

    const checkPending = async () => {
      try {
        const ops = await getPendingOfflineOperations();
        const pending = ops.filter((o) => o.status !== 'SYNCED');
        setPendingCount(pending.length);
      } catch {
        setPendingCount(0);
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 4000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const handleTriggerSync = async () => {
    try {
      const ops = await getPendingOfflineOperations();
      const unSynced = ops.filter((o) => o.status !== 'SYNCED');
      if (unSynced.length === 0) return;

      setIsSyncing(true);
      setSyncNotification(`Sincronizando ${unSynced.length} operaciones almacenadas en contingencia...`);

      const res = await syncOfflineOperations();

      setIsSyncing(false);
      if (res.synced > 0) {
        setSyncNotification(`✓ ${res.synced} operaciones sincronizadas correctamente en Supabase.`);
        setTimeout(() => setSyncNotification(null), 5000);
      } else if (res.failed > 0) {
        setSyncNotification(`⚠ Error al sincronizar ${res.failed} operaciones. Reintentando...`);
        setTimeout(() => setSyncNotification(null), 5000);
      } else {
        setSyncNotification(null);
      }
    } catch {
      setIsSyncing(false);
      setSyncNotification(null);
    }
  };

  if (syncNotification) {
    return (
      <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between shadow-md font-mono z-50">
        <div className="flex items-center gap-2">
          {isSyncing ? (
            <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-slate-950" />
          )}
          <span>{syncNotification}</span>
        </div>
        {!isSyncing && (
          <button
            onClick={() => setSyncNotification(null)}
            className="text-slate-950 hover:text-white text-xs underline"
          >
            Cerrar
          </button>
        )}
      </div>
    );
  }

  if (!connState.isContingencyMode) {
    return null; // Discrete when online
  }

  return (
    <div className="bg-rose-600 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between shadow-lg font-mono z-50 border-b-2 border-rose-400 animate-pulse">
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 flex-shrink-0 animate-bounce" />
        <span>🔴 MODO DE CONTINGENCIA OPERATIVA OFFLINE — SIN CONEXIÓN A INTERNET</span>
        {pendingCount > 0 && (
          <span className="ml-2 px-2 py-0.5 bg-rose-950 text-rose-200 border border-rose-400/50 rounded-full font-extrabold text-[11px]">
            {pendingCount} {pendingCount === 1 ? 'operación pendiente' : 'operaciones pendientes'} localmente
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[10px] text-rose-200 hidden sm:inline">
          Operación local en IndexedDB • Motoqueros vía teléfono/radio
        </span>
        <button
          onClick={handleTriggerSync}
          disabled={isSyncing}
          className="px-2.5 py-1 bg-white hover:bg-slate-100 text-rose-900 rounded font-bold text-[11px] flex items-center gap-1 shadow transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>Reintentar Sync</span>
        </button>
      </div>
    </div>
  );
}
