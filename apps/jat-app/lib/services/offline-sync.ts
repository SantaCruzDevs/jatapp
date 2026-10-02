import { createClient } from '@/lib/supabase/client';
import {
  getPendingOfflineOperations,
  getOfflineRides,
  updateOperationStatus,
  clearSyncedOfflineData,
  OfflineOperation,
  OfflineRide,
} from '@/lib/offline/db';
import { checkRealBackendHealth } from '@/lib/offline/status';

export interface SyncProgressResult {
  total: number;
  synced: number;
  failed: number;
  conflicts: number;
  errors: string[];
}

let isSyncingActive = false;

/**
 * Triggers atomic synchronization of all pending offline operations from IndexedDB to PostgreSQL.
 * Safe for concurrent invocation (guarded by isSyncingActive flag).
 */
export async function syncOfflineOperations(): Promise<SyncProgressResult> {
  if (isSyncingActive) {
    return { total: 0, synced: 0, failed: 0, conflicts: 0, errors: [] };
  }

  isSyncingActive = true;

  const result: SyncProgressResult = {
    total: 0,
    synced: 0,
    failed: 0,
    conflicts: 0,
    errors: [],
  };

  try {
    const isBackendAvailable = await checkRealBackendHealth();
    if (!isBackendAvailable) {
      isSyncingActive = false;
      return result;
    }

    const pendingOps = await getPendingOfflineOperations();
    const offlineRides = await getOfflineRides();
    const rideMap = new Map<string, OfflineRide>(offlineRides.map((r) => [r.offline_id, r]));

    const unSyncedOps = pendingOps.filter(
      (op) => op.status === 'PENDING' || op.status === 'ERROR' || op.status === 'SYNCING'
    );

    result.total = unSyncedOps.length;
    if (unSyncedOps.length === 0) {
      await clearSyncedOfflineData();
      isSyncingActive = false;
      return result;
    }

    const supabase = createClient();

    // Group operations by offline_ride_id to sync each consolidated ride state atomically
    const opsByRide = new Map<string, OfflineOperation[]>();
    unSyncedOps.forEach((op) => {
      const list = opsByRide.get(op.offline_ride_id) || [];
      list.push(op);
      opsByRide.set(op.offline_ride_id, list);
    });

    for (const [offlineRideId, ops] of opsByRide.entries()) {
      const ride = rideMap.get(offlineRideId);
      if (!ride) continue;

      // Mark ops as SYNCING
      for (const op of ops) {
        await updateOperationStatus(op.operation_id, 'SYNCING');
      }

      const idempotencyKey = `sync_${ride.offline_id}_${ride.updated_at}`;

      try {
        const { data: rideId, error: rpcErr } = await supabase.rpc('sync_offline_ride_atomic', {
          p_offline_id: ride.offline_id,
          p_ride_code: ride.ride_code,
          p_customer_id: ride.customer_id || null,
          p_company_id: ride.company_id || null,
          p_requester_person: ride.requester_person,
          p_requester_company: ride.requester_company,
          p_pickup_address: ride.pickup_address,
          p_destination_address: ride.destination_address,
          p_initial_fare: ride.initial_fare,
          p_wait_time_minutes: ride.wait_time_minutes,
          p_wait_time_cost: ride.wait_time_cost,
          p_total_fare: ride.total_fare,
          p_status: ride.status,
          p_priority: ride.priority,
          p_driver_id: ride.driver_id || null,
          p_payment_method: ride.payment_method,
          p_observations: ride.observations || null,
          p_cargo_description: ride.cargo_description || null,
          p_created_at: ride.created_at,
          p_updated_at: ride.updated_at,
          p_idempotency_key: idempotencyKey,
        });

        if (rpcErr) {
          console.error(`Error syncing offline ride ${ride.ride_code}:`, rpcErr);
          result.failed += ops.length;
          result.errors.push(`Carrera ${ride.ride_code}: ${rpcErr.message}`);

          for (const op of ops) {
            await updateOperationStatus(op.operation_id, 'ERROR', rpcErr.message);
          }
        } else {
          // Success: Mark ops as SYNCED
          result.synced += ops.length;
          for (const op of ops) {
            await updateOperationStatus(op.operation_id, 'SYNCED');
          }
        }
      } catch (err: unknown) {
        const message = (err as Error).message || 'Error de red en sincronización';
        result.failed += ops.length;
        result.errors.push(`Carrera ${ride.ride_code}: ${message}`);

        for (const op of ops) {
          await updateOperationStatus(op.operation_id, 'ERROR', message);
        }
      }
    }

    await clearSyncedOfflineData();
  } catch (globalErr: unknown) {
    console.error('Global error in syncOfflineOperations:', globalErr);
  } finally {
    isSyncingActive = false;
  }

  return result;
}
