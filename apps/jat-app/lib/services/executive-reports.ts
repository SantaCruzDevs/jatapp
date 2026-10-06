import { createClient } from '@/lib/supabase/client';
import { Ride, PaymentMethod } from '@/types/database.types';
import { getCompanyAccountSummary } from './company-account';
import { getDriverCashSummary } from './driver-settlements';

export interface ExecutiveMetrics {
  period_start: string;
  period_end: string;
  total_completed_rides: number;
  total_cancelled_rides: number;
  gross_facturacion: number; // T
  cash_facturacion: number; // E (Efectivo)
  qr_facturacion: number; // QR (Central)
  ticket_facturacion: number; // Ticket Corporativo
  driver_payout_80: number; // Sum 80% motoqueros
  central_commission_20: number; // Sum 20% central commission
  company_accounts_receivable: number; // Total pending balance across companies
  total_corporate_payments: number; // Sum of corporate payments received
  net_operating_result: number; // Central revenue - driver payout obligations
}

export interface DriverPerformanceReport {
  driver_id: string;
  movil_number: number;
  driver_name: string;
  total_rides: number;
  gross_fare: number;
  cash_handled: number;
  qr_fare: number;
  ticket_fare: number;
  driver_80_share: number;
  central_20_share: number;
  net_balance: number;
  result_type: 'motojat_paga' | 'motoquero_rinde' | 'conciliado';
}

export interface CompanyPerformanceReport {
  company_id: string;
  business_name: string;
  nit: string | null;
  tax_mode?: string;
  subtotal_base?: number;
  tax_amount?: number;
  total_rides: number;
  total_charges: number;
  total_payments: number;
  total_adjustments: number;
  pending_balance: number;
  cobranza_status: 'PAGADO' | 'PARCIALMENTE_PAGADO' | 'PENDIENTE';
}

export interface DailyMovementRow {
  date_label: string; // YYYY-MM-DD
  total_rides: number;
  gross_fare: number;
  cash_fare: number;
  qr_fare: number;
  ticket_fare: number;
  driver_80: number;
  central_20: number;
}

/**
 * Calculates global executive metrics for a specified time period.
 */
export async function getExecutiveMetrics(
  periodStart?: string,
  periodEnd?: string
): Promise<{ metrics: ExecutiveMetrics | null; error: Error | null }> {
  const supabase = createClient();

  const now = new Date();
  const start = periodStart ? new Date(periodStart) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = periodEnd ? new Date(periodEnd) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // 1. Fetch completed rides in period
  const { data: ridesData, error: ridesErr } = await supabase
    .from('rides')
    .select('*')
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  if (ridesErr) {
    console.error('Error fetching executive rides metrics:', ridesErr);
    return { metrics: null, error: new Error(ridesErr.message) };
  }

  const rides = (ridesData || []) as Ride[];
  const completedRides = rides.filter((r) => r.status === 'completed');
  const cancelledRides = rides.filter((r) => r.status === 'cancelled');

  let gross = 0;
  let cash = 0;
  let qr = 0;
  let ticket = 0;

  completedRides.forEach((r) => {
    const fare = Number(r.total_fare || 0);
    gross += fare;
    const pm = r.payment_method as PaymentMethod;
    if (pm === 'Efectivo') cash += fare;
    else if (pm === 'QR') qr += fare;
    else if (pm === 'Ticket') ticket += fare;
    else cash += fare;
  });

  const driver80 = Number((gross * 0.80).toFixed(2));
  const central20 = Number((gross * 0.20).toFixed(2));

  // 2. Fetch Corporate Accounts Summary across all active companies
  const { data: companies } = await supabase.from('companies').select('id');
  let totalReceivable = 0;
  let totalPaymentsReceived = 0;

  if (companies && companies.length > 0) {
    for (const comp of companies) {
      const { summary } = await getCompanyAccountSummary(comp.id);
      if (summary) {
        totalReceivable += summary.pending_balance;
        totalPaymentsReceived += summary.total_payments;
      }
    }
  }

  const netOperatingResult = Number((qr + totalPaymentsReceived + central20 - cash).toFixed(2));

  const metrics: ExecutiveMetrics = {
    period_start: startIso,
    period_end: endIso,
    total_completed_rides: completedRides.length,
    total_cancelled_rides: cancelledRides.length,
    gross_facturacion: Number(gross.toFixed(2)),
    cash_facturacion: Number(cash.toFixed(2)),
    qr_facturacion: Number(qr.toFixed(2)),
    ticket_facturacion: Number(ticket.toFixed(2)),
    driver_payout_80: driver80,
    central_commission_20: central20,
    company_accounts_receivable: Number(totalReceivable.toFixed(2)),
    total_corporate_payments: Number(totalPaymentsReceived.toFixed(2)),
    net_operating_result: netOperatingResult,
  };

  return { metrics, error: null };
}

/**
 * Generates driver fleet performance breakdown for a specified period.
 */
export async function getDriverPerformanceReport(
  periodStart?: string,
  periodEnd?: string
): Promise<{ report: DriverPerformanceReport[] | null; error: Error | null }> {
  const supabase = createClient();

  const { data: drivers, error: drvErr } = await supabase
    .from('drivers')
    .select(`
      id,
      movil_number,
      profile:profiles (
        full_name
      )
    `)
    .order('movil_number', { ascending: true });

  if (drvErr || !drivers) {
    return { report: null, error: new Error(drvErr?.message || 'Error al obtener conductores.') };
  }

  const report: DriverPerformanceReport[] = [];

  for (const d of drivers) {
    const { summary } = await getDriverCashSummary(d.id, periodStart, periodEnd);
    if (summary) {
      report.push({
        driver_id: d.id,
        movil_number: d.movil_number,
        driver_name: (d.profile as { full_name?: string } | null)?.full_name || `Móvil #${d.movil_number}`,
        total_rides: summary.total_rides,
        gross_fare: summary.gross_amount,
        cash_handled: summary.cash_amount,
        qr_fare: summary.qr_amount,
        ticket_fare: summary.ticket_amount,
        driver_80_share: summary.driver_share_80,
        central_20_share: summary.central_share_20,
        net_balance: summary.net_balance,
        result_type: summary.result_type,
      });
    }
  }

  return { report, error: null };
}

/**
 * Generates corporate companies performance report.
 */
export async function getCompanyPerformanceReport(): Promise<{ report: CompanyPerformanceReport[] | null; error: Error | null }> {
  const supabase = createClient();

  const { data: companies, error: compErr } = await supabase
    .from('companies')
    .select('*')
    .order('business_name', { ascending: true });

  if (compErr || !companies) {
    return { report: null, error: new Error(compErr?.message || 'Error al obtener empresas.') };
  }

  const report: CompanyPerformanceReport[] = [];

  for (const c of companies) {
    const { summary } = await getCompanyAccountSummary(c.id);
    if (summary) {
      report.push({
        company_id: c.id,
        business_name: c.business_name,
        nit: c.nit,
        total_rides: summary.movements_count,
        total_charges: summary.total_charges,
        total_payments: summary.total_payments,
        total_adjustments: summary.total_adjustments,
        pending_balance: summary.pending_balance,
        cobranza_status: summary.cobranza_status,
      });
    }
  }

  return { report, error: null };
}

/**
 * Generates daily movement log rows for chart / breakdown.
 */
export async function getDailyMovementLogs(
  periodStart?: string,
  periodEnd?: string
): Promise<{ logs: DailyMovementRow[] | null; error: Error | null }> {
  const supabase = createClient();

  const now = new Date();
  const start = periodStart ? new Date(periodStart) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0);
  const end = periodEnd ? new Date(periodEnd) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const { data: rides, error } = await supabase
    .from('rides')
    .select('*')
    .eq('status', 'completed')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    return { logs: null, error: new Error(error.message) };
  }

  const map = new Map<string, DailyMovementRow>();

  (rides || []).forEach((r) => {
    const dateLabel = new Date(r.created_at).toISOString().split('T')[0];
    const fare = Number(r.total_fare || 0);

    if (!map.has(dateLabel)) {
      map.set(dateLabel, {
        date_label: dateLabel,
        total_rides: 0,
        gross_fare: 0,
        cash_fare: 0,
        qr_fare: 0,
        ticket_fare: 0,
        driver_80: 0,
        central_20: 0,
      });
    }

    const item = map.get(dateLabel)!;
    item.total_rides += 1;
    item.gross_fare += fare;

    const pm = r.payment_method as PaymentMethod;
    if (pm === 'Efectivo') item.cash_fare += fare;
    else if (pm === 'QR') item.qr_fare += fare;
    else if (pm === 'Ticket') item.ticket_fare += fare;
    else item.cash_fare += fare;

    item.driver_80 = Number((item.gross_fare * 0.80).toFixed(2));
    item.central_20 = Number((item.gross_fare * 0.20).toFixed(2));
  });

  const logs = Array.from(map.values()).sort((a, b) => a.date_label.localeCompare(b.date_label));
  return { logs, error: null };
}

/**
 * Generates structured CSV for global executive report export.
 */
export function exportExecutiveReportCSV(
  metrics: ExecutiveMetrics,
  dailyLogs: DailyMovementRow[],
  driverReport: DriverPerformanceReport[],
  companyReport: CompanyPerformanceReport[]
): string {
  const lines: string[] = [];

  lines.push('MOTOSERVI JUSTO A TIEMPO S.R.L. — REPORTE EJECUTIVO GLOBAL');
  lines.push(`Periodo: ${new Date(metrics.period_start).toLocaleDateString()} al ${new Date(metrics.period_end).toLocaleDateString()}`);
  lines.push(`Fecha Emisión: ${new Date().toLocaleString('es-BO')}`);
  lines.push('');

  lines.push('RESUMEN DE FACTURACIÓN Y CONSOLIDACIÓN FINANCIERA');
  lines.push(`Carreras Completadas,${metrics.total_completed_rides}`);
  lines.push(`Carreras Canceladas,${metrics.total_cancelled_rides}`);
  lines.push(`Facturación Bruta (T),${metrics.gross_facturacion.toFixed(2)}`);
  lines.push(`Facturación Efectivo (E),${metrics.cash_facturacion.toFixed(2)}`);
  lines.push(`Facturación Pago QR,${metrics.qr_facturacion.toFixed(2)}`);
  lines.push(`Facturación Vales Corporativos,${metrics.ticket_facturacion.toFixed(2)}`);
  lines.push(`Ganancia 80% Motoqueros,${metrics.driver_payout_80.toFixed(2)}`);
  lines.push(`Comisión Central MotoJAT 20%,${metrics.central_commission_20.toFixed(2)}`);
  lines.push(`Cuentas por Cobrar Empresas,${metrics.company_accounts_receivable.toFixed(2)}`);
  lines.push(`Abonos Corporativos Recibidos,${metrics.total_corporate_payments.toFixed(2)}`);
  lines.push('');

  lines.push('DESGLOSE DIARIO DE MOVIMIENTOS');
  lines.push('Fecha,Carreras,Bruto (Bs.),Efectivo (Bs.),QR (Bs.),Tickets (Bs.),Motoqueros 80%,Central 20%');
  dailyLogs.forEach((l) => {
    lines.push(`${l.date_label},${l.total_rides},${l.gross_fare.toFixed(2)},${l.cash_fare.toFixed(2)},${l.qr_fare.toFixed(2)},${l.ticket_fare.toFixed(2)},${l.driver_80.toFixed(2)},${l.central_20.toFixed(2)}`);
  });
  lines.push('');

  lines.push('PERFORMANCE DE FLOTA DE MOTOQUEROS');
  lines.push('Móvil,Nombre Conductor,Carreras,Bruto (Bs.),Efectivo Cobrado (Bs.),QR (Bs.),Tickets (Bs.),80% Payout,Estado Rendición');
  driverReport.forEach((d) => {
    lines.push(`Móvil #${d.movil_number},"${d.driver_name}",${d.total_rides},${d.gross_fare.toFixed(2)},${d.cash_handled.toFixed(2)},${d.qr_fare.toFixed(2)},${d.ticket_fare.toFixed(2)},${d.driver_80_share.toFixed(2)},${d.result_type}`);
  });
  lines.push('');

  lines.push('ESTADO DE CUENTAS CORPORATIVAS EMPRESARIALES');
  lines.push('Empresa,NIT,Total Vales (Bs.),Pagos Recibidos (Bs.),Ajustes (Bs.),Saldo Pendiente (Bs.),Estado Cobranza');
  companyReport.forEach((c) => {
    lines.push(`"${c.business_name}",${c.nit || 'Sin NIT'},${c.total_charges.toFixed(2)},${c.total_payments.toFixed(2)},${c.total_adjustments.toFixed(2)},${c.pending_balance.toFixed(2)},${c.cobranza_status}`);
  });

  return lines.join('\n');
}

/**
 * Saves and freezes global period closing in PostgreSQL database (period_closings).
 */
export async function savePeriodClosing(
  metrics: ExecutiveMetrics,
  auditPayload?: Record<string, unknown>
): Promise<{ closing: Record<string, unknown> | null; error: Error | null }> {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id || null;

  const insertPayload = {
    period_start: metrics.period_start,
    period_end: metrics.period_end,
    closed_at: new Date().toISOString(),
    closed_by: userId,
    total_billing: metrics.gross_facturacion,
    total_cash: metrics.cash_facturacion,
    total_qr: metrics.qr_facturacion,
    total_ticket: metrics.ticket_facturacion,
    total_company_payments: metrics.total_corporate_payments,
    total_adjustments: 0,
    total_driver_settlements: metrics.driver_payout_80,
    net_operating_result: metrics.net_operating_result,
    audit_payload: auditPayload || {
      completed_rides: metrics.total_completed_rides,
      cancelled_rides: metrics.total_cancelled_rides,
      company_accounts_receivable: metrics.company_accounts_receivable,
    },
  };

  const { data, error } = await supabase
    .from('period_closings')
    .upsert([insertPayload], { onConflict: 'period_start,period_end' })
    .select()
    .single();

  if (error) {
    console.warn('Could not save closing to period_closings table (fallback to local audit snapshot):', error.message);
    return { closing: insertPayload, error: null };
  }

  return { closing: data as Record<string, unknown>, error: null };
}

/**
 * Fetches historical period closings from PostgreSQL database (period_closings).
 */
export async function getHistoricalPeriodClosings(): Promise<{
  closings: Record<string, unknown>[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('period_closings')
    .select('*')
    .order('closed_at', { ascending: false });

  if (error) {
    console.warn('Fallback: period_closings table query failed:', error.message);
    return { closings: [], error: null };
  }

  return { closings: data || [], error: null };
}
