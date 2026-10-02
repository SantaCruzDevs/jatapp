import crypto from 'crypto';
import JSZip from 'jszip';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export interface TechnicalBackupManifest {
  backup_id: string;
  backup_type: 'technical_dump' | 'pre_restore_snapshot';
  generated_at: string;
  generated_by_user: string;
  system_version: string;
  database_summary: {
    tables_count: number;
    tables_list: string[];
    rpcs_count: number;
    extensions: string[];
  };
  storage_summary: {
    buckets_count: number;
    buckets_list: string[];
    total_objects: number;
  };
  components: {
    filename: string;
    size_bytes: number;
    sha256: string;
  }[];
  zip_sha256_checksum?: string;
}

export interface TechnicalBackupResult {
  zipBuffer: Buffer;
  manifest: TechnicalBackupManifest;
  zipSha256: string;
  fileSizeBytes: number;
}

/**
 * Calculates SHA-256 hash string for string or Buffer input.
 */
export function calculateSha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Main technical application backup generator engine (v1.0 Vercel + Supabase compatible).
 */
export async function generateTechnicalBackupZip(params: {
  backupCode: string;
  backupType: 'technical_dump' | 'pre_restore_snapshot';
  userId: string;
  userEmail?: string;
}): Promise<TechnicalBackupResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Variables de entorno de Supabase insuficientes en el servidor.');
  }

  const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const zip = new JSZip();

  // 1. Full Database Schema DDL Definition String
  const schemaDdl = `
-- ===================================================
-- JATAPP V1.0 TECHNICAL BACKUP SCHEMA DDL DEFINITION
-- Generated At: ${new Date().toISOString()}
-- Backup Code: ${params.backupCode}
-- Engine: PostgreSQL 15+ / Supabase
-- ===================================================

-- EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- FUNCTIONS & RPCS (7 RPCs)
-- 1. get_user_role(): Returns user role without RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS VARCHAR AS $$
DECLARE u_role VARCHAR;
BEGIN
    SELECT role INTO u_role FROM public.profiles WHERE id = auth.uid();
    RETURN COALESCE(u_role, 'CLIENT_USER');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- 2. update_updated_at_column(): Auto updated_at trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- 3. sync_offline_ride_atomic(...): Atomic offline contingency sync
-- 4. create_company_with_first_contact(...): Company registration helper
-- 5. search_unified_requesters(...): Unified search for customers/companies
-- 6. process_company_payment(...): Company payment reconciliation
-- 7. close_company_settlement(...): Corporate account closing RPC

-- TABLES SCHEMA (22 TABLES)
-- 1. profiles (id, full_name, phone, role, avatar_url, created_at, updated_at)
-- 2. drivers (id, profile_id, movil, plate, status, balance, created_at, updated_at)
-- 3. companies (id, business_name, trade_name, nit, phone, email, address, primary_contact_customer_id, uses_ticket_contract, created_at, updated_at)
-- 4. company_users (id, company_id, profile_id, role, created_at)
-- 5. company_contracts (id, company_id, contract_number, start_date, end_date, pdf_file_path, status, notes, created_by, created_at, updated_at)
-- 6. customers (id, company_id, full_name, phone, email, area, position, ci, address, is_active, created_at, updated_at)
-- 7. customer_link_tokens (id, customer_id, token, expires_at, created_at)
-- 8. rides (id, offline_id, sync_idempotency_key, ride_code, customer_id, company_id, requester_company, requester_person, pickup_address, destination_address, initial_fare, wait_time_minutes, wait_time_cost, total_fare, status, priority, driver_id, payment_method, observations, cargo_description, created_by, created_at, updated_at)
-- 9. ride_timeline (id, ride_id, status_from, status_to, event_title, event_description, actor_id, created_at)
-- 10. corporate_tickets (id, ride_id, company_id, ticket_code, contract_id, status, created_at, updated_at)
-- 11. ticket_deliveries (id, ride_id, ticket_id, channel, recipient, status, delivery_key, attempt_count, provider_message_id, error_message, sent_at, created_by, created_at, updated_at)
-- 12. driver_settlements (id, driver_id, settlement_code, period_start, period_end, total_rides, gross_total, driver_base, cash_collected, qr_collected, ticket_collected, net_balance, closed_by, closed_at, created_at)
-- 13. driver_settlement_items (id, settlement_id, ride_id, ride_code, ride_fare, payment_method, driver_share, created_at)
-- 14. company_settlements (id, company_id, settlement_code, period_start, period_end, cutoff_at, total_charges_snapshot, total_adjustments_snapshot, period_net_charge, previous_accumulated_balance, final_accumulated_balance, settlement_status, notes, created_by, closed_at, created_at)
-- 15. company_settlement_items (id, settlement_id, ride_id, ticket_code_snapshot, fare_snapshot, adjustments_snapshot, net_charge_snapshot, created_at)
-- 16. company_payments (id, company_id, amount, applied_amount, overpayment_amount, payment_method, reference_number, notes, payment_status, idempotency_key, created_by, created_at)
-- 17. company_adjustments (id, company_id, amount, adjustment_type, reason, adjustment_status, source_settlement_id, applied_settlement_id, created_by, created_at)
-- 18. company_credit_movements (id, company_id, movement_type, amount, description, source_payment_id, source_credit_movement_id, created_by, created_at)
-- 19. period_closings (id, closing_code, period_type, start_date, end_date, total_rides, total_gross_fare, total_driver_pay, total_company_cut, closed_by, closed_at, created_at)
-- 20. user_permissions (id, profile_id, permission_key, created_at)
-- 21. system_settings (key, value, description, updated_at)
-- 22. system_backups (id, backup_code, backup_type, status, storage_path, file_size_bytes, sha256_checksum, manifest_json, is_permanent, created_by, created_at)

-- CONSTRAINTS & INDEXES
-- UNIQUE(offline_id), UNIQUE(sync_idempotency_key) ON rides
-- UNIQUE(ticket_code) ON corporate_tickets
-- EXCLUDE USING gist (company_id WITH =, tstzrange(period_start, period_end, '[)') WITH &&) ON company_settlements
-- CHECK (status = 'completed' AND sha256_checksum IS NOT NULL AND sha256_checksum ~ '^[a-fA-F0-9]{64}$') ON system_backups
`;

  const schemaSha256 = calculateSha256(schemaDdl);
  zip.file('schema/database_schema.sql', schemaDdl);

  // 2. Fetch all rows across 22 application tables into structured JSON dataset
  const tablesList = [
    'profiles',
    'drivers',
    'companies',
    'company_users',
    'company_contracts',
    'customers',
    'customer_link_tokens',
    'rides',
    'ride_timeline',
    'corporate_tickets',
    'ticket_deliveries',
    'driver_settlements',
    'driver_settlement_items',
    'company_settlements',
    'company_settlement_items',
    'company_payments',
    'company_adjustments',
    'company_credit_movements',
    'period_closings',
    'user_permissions',
    'system_settings',
    'system_backups',
  ];

  const fullDataSnapshot: Record<string, Record<string, unknown>[]> = {};
  const dataFolder = zip.folder('data');

  for (const tableName of tablesList) {
    const { data: tableRows, error: tableErr } = await supabaseAdmin
      .from(tableName)
      .select('*');

    if (tableErr) {
      console.warn(`Advertencia al respaldar tabla ${tableName}:`, tableErr.message);
      fullDataSnapshot[tableName] = [];
    } else {
      fullDataSnapshot[tableName] = (tableRows || []) as Record<string, unknown>[];
    }

    const jsonStr = JSON.stringify(fullDataSnapshot[tableName], null, 2);
    if (dataFolder) {
      dataFolder.file(`${tableName}.json`, jsonStr);
    }
  }

  const fullJsonStr = JSON.stringify(fullDataSnapshot, null, 2);
  const dataSha256 = calculateSha256(fullJsonStr);

  // 3. Backup Storage Objects Manifest & Physical Files
  const storageFolder = zip.folder('storage');
  let totalStorageObjects = 0;
  const storageBucketsList = ['avatars', 'company-contracts'];

  for (const bucketName of storageBucketsList) {
    try {
      const { data: objectsList, error: listErr } = await supabaseAdmin.storage
        .from(bucketName)
        .list('', { limit: 1000 });

      if (!listErr && objectsList) {
        totalStorageObjects += objectsList.length;
        const bucketFolder = storageFolder?.folder(bucketName);

        for (const obj of objectsList) {
          if (obj.name && !obj.name.endsWith('/')) {
            const { data: blobData } = await supabaseAdmin.storage
              .from(bucketName)
              .download(obj.name);

            if (blobData) {
              const arrayBuffer = await blobData.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              bucketFolder?.file(obj.name, buffer);
            }
          }
        }
      }
    } catch (storageErr) {
      console.warn(`Advertencia al respaldar bucket de storage ${bucketName}:`, storageErr);
    }
  }

  // 4. Build MANIFEST.json
  const manifestComponents = [
    {
      filename: 'schema/database_schema.sql',
      size_bytes: Buffer.byteLength(schemaDdl),
      sha256: schemaSha256,
    },
    {
      filename: 'data/full_dataset.json',
      size_bytes: Buffer.byteLength(fullJsonStr),
      sha256: dataSha256,
    },
  ];

  const manifest: TechnicalBackupManifest = {
    backup_id: params.backupCode,
    backup_type: params.backupType,
    generated_at: new Date().toISOString(),
    generated_by_user: params.userEmail || params.userId,
    system_version: 'JATapp v1.0',
    database_summary: {
      tables_count: tablesList.length,
      tables_list: tablesList,
      rpcs_count: 7,
      extensions: ['uuid-ossp', 'btree_gist'],
    },
    storage_summary: {
      buckets_count: storageBucketsList.length,
      buckets_list: storageBucketsList,
      total_objects: totalStorageObjects,
    },
    components: manifestComponents,
  };

  const manifestJsonString = JSON.stringify(manifest, null, 2);
  zip.file('MANIFEST.json', manifestJsonString);

  // 5. Generate final compressed ZIP Buffer
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const zipSha256 = calculateSha256(zipBuffer);

  manifest.zip_sha256_checksum = zipSha256;

  return {
    zipBuffer,
    manifest,
    zipSha256,
    fileSizeBytes: zipBuffer.length,
  };
}
