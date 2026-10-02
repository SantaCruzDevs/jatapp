/**
 * Real Connection Status Monitor for JATapp.
 * Combines navigator.onLine, network events, and real HTTP health check against Supabase backend.
 * Distinguishes "device connected to local network" vs "can reach Supabase backend".
 */

export interface ConnectionState {
  isOnline: boolean;
  isBackendReachable: boolean;
  isContingencyMode: boolean;
  lastCheckedAt: string;
}

let connectionState: ConnectionState = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isBackendReachable: true,
  isContingencyMode: false,
  lastCheckedAt: new Date().toISOString(),
};

const listeners = new Set<(state: ConnectionState) => void>();

export function subscribeConnectionStatus(callback: (state: ConnectionState) => void): () => void {
  listeners.add(callback);
  // Send initial state
  callback(connectionState);
  return () => {
    listeners.delete(callback);
  };
}

function notifyListeners() {
  listeners.forEach((cb) => cb({ ...connectionState }));
}

/**
 * Executes a real HTTP ping to check if Supabase backend is reachable.
 */
export async function checkRealBackendHealth(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    updateState(false, false);
    return false;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    updateState(true, true);
    return true;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const reachable = res.ok || res.status === 401 || res.status === 404 || res.status === 200;
    updateState(true, reachable);
    return reachable;
  } catch {
    updateState(true, false);
    return false;
  }
}

function updateState(online: boolean, backendReachable: boolean) {
  const isContingencyMode = !online || !backendReachable;
  const changed =
    connectionState.isOnline !== online ||
    connectionState.isBackendReachable !== backendReachable ||
    connectionState.isContingencyMode !== isContingencyMode;

  connectionState = {
    isOnline: online,
    isBackendReachable: backendReachable,
    isContingencyMode,
    lastCheckedAt: new Date().toISOString(),
  };

  if (changed) {
    notifyListeners();
  }
}

// Global window event bindings
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    checkRealBackendHealth();
  });

  window.addEventListener('offline', () => {
    updateState(false, false);
  });

  // Regular 15s health check ticker
  setInterval(() => {
    checkRealBackendHealth();
  }, 15000);
}
