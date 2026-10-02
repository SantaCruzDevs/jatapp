/**
 * IndexedDB local database wrapper for JATapp Offline Contingency Mode.
 * Stores offline rides, operation queue, and local read-only caches (drivers, customers, companies).
 * Supabase DB remains the single source of truth when online.
 */

export interface OfflineRide {
  offline_id: string; // e.g. off_ride_<uuid>
  ride_code: string; // e.g. JAT-OFF-123456
  customer_id?: string | null;
  company_id?: string | null;
  requester_company: string;
  requester_person: string;
  pickup_address: string;
  destination_address: string;
  initial_fare: number;
  wait_time_minutes: number;
  wait_time_cost: number;
  total_fare: number;
  status: 'pending' | 'assigned' | 'ontheway' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  driver_id?: string | null;
  payment_method: 'Efectivo' | 'QR' | 'Ticket';
  observations?: string | null;
  cargo_description?: string | null;
  created_at: string;
  updated_at: string;
  is_offline_only: boolean;
}

export type OfflineOperationType =
  | 'CREATE_RIDE'
  | 'ASSIGN_DRIVER'
  | 'UPDATE_STATUS'
  | 'COMPLETE_RIDE'
  | 'CANCEL_RIDE';

export interface OfflineOperation {
  operation_id: string; // e.g. op_<uuid>
  offline_ride_id: string;
  operation_type: OfflineOperationType;
  created_at: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'ERROR' | 'CONFLICT';
  retry_count: number;
  error_message?: string | null;
}

export interface DriverCacheItem {
  id: string;
  movil_number: number;
  full_name: string;
  phone: string | null;
  vehicle_plate: string;
  vehicle_type: string;
  status: string;
}

export interface CustomerCacheItem {
  id: string;
  full_name: string;
  phone: string;
  company_id?: string | null;
  company_name?: string | null;
}

export interface CompanyCacheItem {
  id: string;
  business_name: string;
  nit: string | null;
  status: string;
  uses_ticket_contract: boolean;
}

const DB_NAME = 'jatapp_offline_db';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB no está disponible en este entorno.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. offline_rides store
      if (!db.objectStoreNames.contains('offline_rides')) {
        const rideStore = db.createObjectStore('offline_rides', { keyPath: 'offline_id' });
        rideStore.createIndex('status', 'status', { unique: false });
        rideStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // 2. sync_queue store
      if (!db.objectStoreNames.contains('sync_queue')) {
        const queueStore = db.createObjectStore('sync_queue', { keyPath: 'operation_id' });
        queueStore.createIndex('offline_ride_id', 'offline_ride_id', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // 3. cache_drivers store
      if (!db.objectStoreNames.contains('cache_drivers')) {
        db.createObjectStore('cache_drivers', { keyPath: 'id' });
      }

      // 4. cache_customers store
      if (!db.objectStoreNames.contains('cache_customers')) {
        db.createObjectStore('cache_customers', { keyPath: 'id' });
      }

      // 5. cache_companies store
      if (!db.objectStoreNames.contains('cache_companies')) {
        db.createObjectStore('cache_companies', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves or updates an offline ride locally in IndexedDB.
 */
export async function saveOfflineRide(ride: OfflineRide): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_rides', 'readwrite');
    const store = tx.objectStore('offline_rides');
    const req = store.put(ride);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Gets all offline rides stored locally in IndexedDB.
 */
export async function getOfflineRides(): Promise<OfflineRide[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_rides', 'readonly');
    const store = tx.objectStore('offline_rides');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as OfflineRide[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Adds an operation to the persistent IndexedDB sync queue.
 */
export async function enqueueOfflineOperation(op: OfflineOperation): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    const req = store.put(op);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Gets all operations in the sync queue ordered chronologically.
 */
export async function getPendingOfflineOperations(): Promise<OfflineOperation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readonly');
    const store = tx.objectStore('sync_queue');
    const req = store.getAll();
    req.onsuccess = () => {
      const ops = (req.result as OfflineOperation[]).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      resolve(ops);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Updates status of an operation in sync queue.
 */
export async function updateOperationStatus(
  operationId: string,
  status: OfflineOperation['status'],
  errorMessage?: string | null
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    const getReq = store.get(operationId);

    getReq.onsuccess = () => {
      const item = getReq.result as OfflineOperation | undefined;
      if (!item) return resolve();
      item.status = status;
      if (status === 'ERROR' || status === 'CONFLICT') {
        item.retry_count = (item.retry_count || 0) + 1;
        item.error_message = errorMessage || null;
      }
      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Removes a synced operation from the IndexedDB queue.
 */
export async function removeOfflineOperation(operationId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    const req = store.delete(operationId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clears synced offline rides and operations.
 */
export async function clearSyncedOfflineData(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(['offline_rides', 'sync_queue'], 'readwrite');
  const opsStore = tx.objectStore('sync_queue');
  const ridesStore = tx.objectStore('offline_rides');

  const ops = await new Promise<OfflineOperation[]>((res) => {
    const req = opsStore.getAll();
    req.onsuccess = () => res(req.result as OfflineOperation[]);
  });

  const syncedOpIds = ops.filter((o) => o.status === 'SYNCED').map((o) => o.operation_id);
  syncedOpIds.forEach((id) => opsStore.delete(id));

  // If no remaining pending ops for a ride, remove from offline_rides
  const remainingOps = ops.filter((o) => o.status !== 'SYNCED');
  const activeRideIds = new Set(remainingOps.map((o) => o.offline_ride_id));

  const rides = await new Promise<OfflineRide[]>((res) => {
    const req = ridesStore.getAll();
    req.onsuccess = () => res(req.result as OfflineRide[]);
  });

  rides.forEach((r) => {
    if (!activeRideIds.has(r.offline_id)) {
      ridesStore.delete(r.offline_id);
    }
  });
}

/**
 * Cache Drivers locally for offline lookup.
 */
export async function setCachedDrivers(drivers: DriverCacheItem[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('cache_drivers', 'readwrite');
  const store = tx.objectStore('cache_drivers');
  store.clear();
  drivers.forEach((d) => store.put(d));
}

export async function getCachedDrivers(): Promise<DriverCacheItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache_drivers', 'readonly');
      const store = tx.objectStore('cache_drivers');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as DriverCacheItem[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/**
 * Cache Customers locally for offline lookup.
 */
export async function setCachedCustomers(customers: CustomerCacheItem[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('cache_customers', 'readwrite');
  const store = tx.objectStore('cache_customers');
  store.clear();
  customers.forEach((c) => store.put(c));
}

export async function getCachedCustomers(): Promise<CustomerCacheItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache_customers', 'readonly');
      const store = tx.objectStore('cache_customers');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as CustomerCacheItem[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/**
 * Cache Companies locally for offline lookup.
 */
export async function setCachedCompanies(companies: CompanyCacheItem[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('cache_companies', 'readwrite');
  const store = tx.objectStore('cache_companies');
  store.clear();
  companies.forEach((c) => store.put(c));
}

export async function getCachedCompanies(): Promise<CompanyCacheItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache_companies', 'readonly');
      const store = tx.objectStore('cache_companies');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as CompanyCacheItem[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}
