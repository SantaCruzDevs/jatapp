import crypto from 'crypto';
import JSZip from 'jszip';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export interface ExportManifestFile {
  filename: string;
  record_count: number;
  sha256: string;
}

export interface ExportManifest {
  backup_id: string;
  generated_at: string;
  generated_by_user: string;
  requested_period: {
    start_date: string;
    end_date: string;
  };
  system_version: string;
  files: ExportManifestFile[];
  zip_sha256_checksum?: string;
}

export interface ExportResult {
  zipBuffer: Buffer;
  manifest: ExportManifest;
  zipSha256: string;
  totalRecords: number;
}

/**
 * Converts an array of objects into RFC 4180 compliant CSV string with UTF-8 BOM.
 */
export function convertToCsv(records: Record<string, unknown>[]): string {
  if (!records || records.length === 0) {
    return '\uFEFF';
  }

  const headers = Object.keys(records[0]);
  const csvRows: string[] = [];

  // Header row
  csvRows.push(headers.map(escapeCsvValue).join(','));

  // Data rows
  for (const record of records) {
    const row = headers.map((header) => escapeCsvValue(record[header]));
    csvRows.push(row.join(','));
  }

  // Prepend UTF-8 BOM for Excel compatibility
  return '\uFEFF' + csvRows.join('\r\n');
}

function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }

  let str: string;
  if (typeof val === 'object') {
    str = JSON.stringify(val);
  } else {
    str = String(val);
  }

  // Escape quotes and enclose in quotes if contains special characters
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Calculates SHA-256 hash string for string or Buffer input.
 */
export function calculateSha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Paginated query runner to fetch all rows beyond Supabase 1000 default row cap.
 */
async function fetchAllRows(
  fetchBatch: (from: number, to: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>
): Promise<Record<string, unknown>[]> {
  const BATCH_SIZE = 1000;
  let from = 0;
  let allRows: Record<string, unknown>[] = [];
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await fetchBatch(from, from + BATCH_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allRows = allRows.concat(data);
      if (data.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        from += BATCH_SIZE;
      }
    }
  }
  return allRows;
}

/**
 * Main export service engine for coherent management exports (v1.0 Vercel + Supabase compatible).
 */
export async function generateGestionExportZip(params: {
  startDate: string; // ISO string or YYYY-MM-DD
  endDate: string; // ISO string or YYYY-MM-DD
  userId: string;
  userEmail?: string;
  backupCode: string;
}): Promise<ExportResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Variables de entorno de Supabase insuficientes en el servidor.');
  }

  const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const startIso = new Date(params.startDate).toISOString();
  const endIso = new Date(params.endDate).toISOString();

  // 1. Fetch rides in interval [startIso, endIso) with pagination
  const rides = await fetchAllRows(async (from, to) => {
    const res = await supabaseAdmin
      .from('rides')
      .select('*')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(from, to);
    return res as unknown as { data: Record<string, unknown>[] | null; error: { message: string } | null };
  });

  const rideIds = rides.map((r) => r.id as string);

  // 2. Fetch ride_timeline for included rides
  let rideTimeline: Record<string, unknown>[] = [];
  if (rideIds.length > 0) {
    const { data: timelineData } = await supabaseAdmin
      .from('ride_timeline')
      .select('*')
      .in('ride_id', rideIds)
      .order('created_at', { ascending: true });
    rideTimeline = (timelineData || []) as Record<string, unknown>[];
  }

  // 3. Fetch corporate_tickets for included rides
  let corporateTickets: Record<string, unknown>[] = [];
  if (rideIds.length > 0) {
    const { data: ticketsData } = await supabaseAdmin
      .from('corporate_tickets')
      .select('*')
      .in('ride_id', rideIds)
      .order('created_at', { ascending: true });
    corporateTickets = (ticketsData || []) as Record<string, unknown>[];
  }

  // 4. Fetch ticket_deliveries for included rides
  let ticketDeliveries: Record<string, unknown>[] = [];
  if (rideIds.length > 0) {
    const { data: deliveriesData } = await supabaseAdmin
      .from('ticket_deliveries')
      .select('*')
      .in('ride_id', rideIds)
      .order('created_at', { ascending: true });
    ticketDeliveries = (deliveriesData || []) as Record<string, unknown>[];
  }

  // 5. Fetch driver_settlements in range
  const { data: driverSettlementsData } = await supabaseAdmin
    .from('driver_settlements')
    .select('*')
    .gte('closed_at', startIso)
    .lt('closed_at', endIso)
    .order('closed_at', { ascending: true });
  const driverSettlements = (driverSettlementsData || []) as Record<string, unknown>[];
  const driverSettlementIds = driverSettlements.map((ds) => ds.id as string);

  // 6. Fetch driver_settlement_items for included settlements
  let driverSettlementItems: Record<string, unknown>[] = [];
  if (driverSettlementIds.length > 0) {
    const { data: dsItemsData } = await supabaseAdmin
      .from('driver_settlement_items')
      .select('*')
      .in('settlement_id', driverSettlementIds);
    driverSettlementItems = (dsItemsData || []) as Record<string, unknown>[];
  }

  // 7. Fetch company_settlements in range
  const { data: companySettlementsData } = await supabaseAdmin
    .from('company_settlements')
    .select('*')
    .gte('closed_at', startIso)
    .lt('closed_at', endIso)
    .order('closed_at', { ascending: true });
  const companySettlements = (companySettlementsData || []) as Record<string, unknown>[];
  const companySettlementIds = companySettlements.map((cs) => cs.id as string);

  // 8. Fetch company_settlement_items for included settlements
  let companySettlementItems: Record<string, unknown>[] = [];
  if (companySettlementIds.length > 0) {
    const { data: csItemsData } = await supabaseAdmin
      .from('company_settlement_items')
      .select('*')
      .in('settlement_id', companySettlementIds);
    companySettlementItems = (csItemsData || []) as Record<string, unknown>[];
  }

  // 9. Fetch company_payments in range
  const { data: companyPaymentsData } = await supabaseAdmin
    .from('company_payments')
    .select('*')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true });
  const companyPayments = (companyPaymentsData || []) as Record<string, unknown>[];

  // 10. Fetch company_adjustments in range
  const { data: companyAdjustmentsData } = await supabaseAdmin
    .from('company_adjustments')
    .select('*')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true });
  const companyAdjustments = (companyAdjustmentsData || []) as Record<string, unknown>[];

  // 11. Fetch company_credit_movements in range
  const { data: creditMovementsData } = await supabaseAdmin
    .from('company_credit_movements')
    .select('*')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true });
  const companyCreditMovements = (creditMovementsData || []) as Record<string, unknown>[];

  // 12. Fetch period_closings in range
  const { data: closingsData } = await supabaseAdmin
    .from('period_closings')
    .select('*')
    .gte('closed_at', startIso)
    .lt('closed_at', endIso)
    .order('closed_at', { ascending: true });
  const periodClosings = (closingsData || []) as Record<string, unknown>[];

  // 13. Collect companies referenced by rides, company_settlements, payments, adjustments, credit_movements
  const companyIdSet = new Set<string>();
  rides.forEach((r) => r.company_id && companyIdSet.add(r.company_id as string));
  companySettlements.forEach((cs) => cs.company_id && companyIdSet.add(cs.company_id as string));
  companyPayments.forEach((cp) => cp.company_id && companyIdSet.add(cp.company_id as string));
  companyAdjustments.forEach((ca) => ca.company_id && companyIdSet.add(ca.company_id as string));
  companyCreditMovements.forEach((cm) => cm.company_id && companyIdSet.add(cm.company_id as string));

  let companies: Record<string, unknown>[] = [];
  if (companyIdSet.size > 0) {
    const { data: compData } = await supabaseAdmin
      .from('companies')
      .select('*')
      .in('id', Array.from(companyIdSet));
    companies = (compData || []) as Record<string, unknown>[];
  }

  // 14. Collect customers referenced by rides or companies
  const customerIdSet = new Set<string>();
  rides.forEach((r) => r.customer_id && customerIdSet.add(r.customer_id as string));
  companies.forEach((c) => c.primary_contact_customer_id && customerIdSet.add(c.primary_contact_customer_id as string));

  let customers: Record<string, unknown>[] = [];
  if (customerIdSet.size > 0) {
    const { data: custData } = await supabaseAdmin
      .from('customers')
      .select('*')
      .in('id', Array.from(customerIdSet));
    customers = (custData || []) as Record<string, unknown>[];
  }

  // 15. Collect drivers referenced by rides or driver_settlements
  const driverIdSet = new Set<string>();
  rides.forEach((r) => r.driver_id && driverIdSet.add(r.driver_id as string));
  driverSettlements.forEach((ds) => ds.driver_id && driverIdSet.add(ds.driver_id as string));

  let drivers: Record<string, unknown>[] = [];
  if (driverIdSet.size > 0) {
    const { data: drvData } = await supabaseAdmin
      .from('drivers')
      .select('*')
      .in('id', Array.from(driverIdSet));
    drivers = (drvData || []) as Record<string, unknown>[];
  }

  // Build the 15 core CSV files
  const tablesMap: { [filename: string]: Record<string, unknown>[] } = {
    'rides.csv': rides,
    'ride_timeline.csv': rideTimeline,
    'corporate_tickets.csv': corporateTickets,
    'ticket_deliveries.csv': ticketDeliveries,
    'driver_settlements.csv': driverSettlements,
    'driver_settlement_items.csv': driverSettlementItems,
    'company_settlements.csv': companySettlements,
    'company_settlement_items.csv': companySettlementItems,
    'company_payments.csv': companyPayments,
    'company_adjustments.csv': companyAdjustments,
    'company_credit_movements.csv': companyCreditMovements,
    'period_closings.csv': periodClosings,
    'companies.csv': companies,
    'customers.csv': customers,
    'drivers.csv': drivers,
  };

  const zip = new JSZip();
  const manifestFiles: ExportManifestFile[] = [];
  let totalRecords = 0;

  for (const [filename, records] of Object.entries(tablesMap)) {
    const csvContent = convertToCsv(records);
    const sha256 = calculateSha256(csvContent);
    const recordCount = records.length;
    totalRecords += recordCount;

    zip.file(filename, csvContent);
    manifestFiles.push({
      filename,
      record_count: recordCount,
      sha256,
    });
  }

  const manifest: ExportManifest = {
    backup_id: params.backupCode,
    generated_at: new Date().toISOString(),
    generated_by_user: params.userEmail || params.userId,
    requested_period: {
      start_date: params.startDate,
      end_date: params.endDate,
    },
    system_version: 'JATapp v1.0',
    files: manifestFiles,
  };

  const manifestJsonString = JSON.stringify(manifest, null, 2);
  zip.file('MANIFEST.json', manifestJsonString);

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const zipSha256 = calculateSha256(zipBuffer);

  manifest.zip_sha256_checksum = zipSha256;

  return {
    zipBuffer,
    manifest,
    zipSha256,
    totalRecords,
  };
}
