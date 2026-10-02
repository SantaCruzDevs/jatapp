import { createClient } from '@/lib/supabase/client';
import { Company } from '@/types/database.types';

export type MovementType = 'CARGO' | 'PAGO' | 'AJUSTE';

export interface CompanyMovement {
  id: string;
  date: string;
  type: MovementType;
  ticket_code: string;
  ride_code?: string | null;
  requester_person?: string | null;
  destination_address?: string | null;
  driver_movil?: number | null;
  amount: number; // positive for CARGO/PAGO, signed for AJUSTE
  payment_method?: string | null;
  reference_number?: string | null;
  notes?: string | null;
  registered_by_name?: string | null;
}

export interface CompanyAccountSummary {
  company: Company;
  total_charges: number; // Sum of completed Ticket rides
  total_payments: number; // Sum of payments
  total_adjustments: number; // Sum of signed adjustments
  pending_balance: number; // Cargos - Pagos + Ajustes
  cobranza_status: 'PAGADO' | 'PARCIALMENTE_PAGADO' | 'PENDIENTE';
  last_payment_date?: string | null;
  movements_count: number;
}

/**
 * Calculates corporate current account summary for a company directly from PostgreSQL.
 */
export async function getCompanyAccountSummary(
  companyId: string,
  startDate?: string,
  endDate?: string
): Promise<{ summary: CompanyAccountSummary | null; error: Error | null }> {
  const supabase = createClient();

  // 1. Fetch Company details
  const { data: company, error: compErr } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (compErr || !company) {
    return { summary: null, error: new Error('Empresa no encontrada.') };
  }

  // 2. Fetch all COMPLETED rides with payment_method = Ticket for this company
  let query = supabase
    .from('rides')
    .select(`
      id,
      ride_code,
      total_fare,
      status,
      payment_method,
      created_at
    `)
    .eq('company_id', companyId)
    .eq('status', 'completed')
    .eq('payment_method', 'Ticket');

  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data: ridesData, error: ridesErr } = await query;
  if (ridesErr) {
    console.error('Error fetching company rides for charges:', ridesErr);
    return { summary: null, error: new Error(ridesErr.message) };
  }

  let totalCharges = 0;
  (ridesData || []).forEach((r) => {
    totalCharges += Number(r.total_fare || 0);
  });

  // 3. Sum registered payments directly from PostgreSQL company_payments table
  let paymentsQuery = supabase
    .from('company_payments')
    .select('*')
    .eq('company_id', companyId);

  if (startDate) paymentsQuery = paymentsQuery.gte('payment_date', startDate);
  if (endDate) paymentsQuery = paymentsQuery.lte('payment_date', endDate);

  const { data: dbPayments, error: paymentsErr } = await paymentsQuery;
  if (paymentsErr) {
    console.error('Error fetching company_payments from PostgreSQL:', paymentsErr);
    return { summary: null, error: new Error(`Error al consultar pagos: ${paymentsErr.message}`) };
  }

  // Exclude voided payments if status exists
  const validPayments = (dbPayments || []).filter(
    (p: { payment_status?: string }) => !p.payment_status || p.payment_status !== 'voided'
  );

  let totalPayments = 0;
  let lastPaymentDate: string | null = null;

  validPayments.forEach((p: { amount: number; payment_date: string }) => {
    totalPayments += Number(p.amount || 0);
    if (!lastPaymentDate || p.payment_date > lastPaymentDate) {
      lastPaymentDate = p.payment_date;
    }
  });

  // 4. Sum registered adjustments directly from PostgreSQL company_adjustments table
  let adjustmentsQuery = supabase
    .from('company_adjustments')
    .select('*')
    .eq('company_id', companyId);

  if (startDate) adjustmentsQuery = adjustmentsQuery.gte('created_at', startDate);
  if (endDate) adjustmentsQuery = adjustmentsQuery.lte('created_at', endDate);

  const { data: dbAdjustments, error: adjustmentsErr } = await adjustmentsQuery;
  if (adjustmentsErr) {
    console.error('Error fetching company_adjustments from PostgreSQL:', adjustmentsErr);
    return { summary: null, error: new Error(`Error al consultar ajustes: ${adjustmentsErr.message}`) };
  }

  // Exclude voided adjustments if status exists
  const validAdjustments = (dbAdjustments || []).filter(
    (a: { adjustment_status?: string }) => !a.adjustment_status || a.adjustment_status !== 'voided'
  );

  let totalAdjustments = 0;
  validAdjustments.forEach((a: { amount: number; adjustment_type?: string }) => {
    if (a.adjustment_type === 'charge_increase') {
      totalAdjustments += Math.abs(Number(a.amount || 0));
    } else if (a.adjustment_type === 'credit_discount') {
      totalAdjustments -= Math.abs(Number(a.amount || 0));
    } else {
      totalAdjustments += Number(a.amount || 0);
    }
  });

  // 5. Formula: SALDO = CARGOS - PAGOS + AJUSTES
  const pendingBalance = Number((totalCharges - totalPayments + totalAdjustments).toFixed(2));

  let cobranzaStatus: 'PAGADO' | 'PARCIALMENTE_PAGADO' | 'PENDIENTE' = 'PENDIENTE';
  if (pendingBalance <= 0.009) {
    cobranzaStatus = 'PAGADO';
  } else if (totalPayments > 0) {
    cobranzaStatus = 'PARCIALMENTE_PAGADO';
  }

  const summary: CompanyAccountSummary = {
    company: company as Company,
    total_charges: Number(totalCharges.toFixed(2)),
    total_payments: Number(totalPayments.toFixed(2)),
    total_adjustments: Number(totalAdjustments.toFixed(2)),
    pending_balance: pendingBalance,
    cobranza_status: cobranzaStatus,
    last_payment_date: lastPaymentDate,
    movements_count: (ridesData?.length || 0) + validPayments.length + validAdjustments.length,
  };

  return { summary, error: null };
}

/**
 * Retrieves chronological movements (CARGOS, PAGOS, AJUSTES) for a company directly from PostgreSQL.
 */
export async function getCompanyAccountMovements(
  companyId: string,
  startDate?: string,
  endDate?: string
): Promise<{ movements: CompanyMovement[] | null; error: Error | null }> {
  const supabase = createClient();

  // 1. Query Charges from Rides + Corporate Tickets
  let query = supabase
    .from('rides')
    .select(`
      id,
      ride_code,
      requester_person,
      destination_address,
      total_fare,
      payment_method,
      created_at,
      driver:drivers (
        movil_number
      )
    `)
    .eq('company_id', companyId)
    .eq('status', 'completed')
    .eq('payment_method', 'Ticket')
    .order('created_at', { ascending: true });

  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data: ridesData, error: ridesErr } = await query;
  if (ridesErr) {
    return { movements: null, error: new Error(ridesErr.message) };
  }

  // Query corporate tickets for ticket codes
  const { data: corpTickets } = await supabase
    .from('corporate_tickets')
    .select('*');

  const corpMap = new Map<string, string>();
  if (corpTickets) {
    corpTickets.forEach((ct) => corpMap.set(ct.ride_id, ct.ticket_code));
  }

  const movements: CompanyMovement[] = [];

  // Map Charges
  (ridesData || []).forEach((r) => {
    const tCode = corpMap.get(r.id) || `TK-${r.ride_code}`;
    movements.push({
      id: r.id,
      date: r.created_at,
      type: 'CARGO',
      ticket_code: tCode,
      ride_code: r.ride_code,
      requester_person: r.requester_person,
      destination_address: r.destination_address,
      driver_movil: (Array.isArray(r.driver) ? r.driver[0]?.movil_number : (r.driver as { movil_number?: number } | null)?.movil_number) || null,
      amount: Number(r.total_fare),
      payment_method: 'Ticket',
      notes: `Cargo corporativo por carrera ${r.ride_code}`,
    });
  });

  // 2. Map Payments directly from PostgreSQL company_payments table
  let paymentsQuery = supabase
    .from('company_payments')
    .select('*')
    .eq('company_id', companyId);

  if (startDate) paymentsQuery = paymentsQuery.gte('payment_date', startDate);
  if (endDate) paymentsQuery = paymentsQuery.lte('payment_date', endDate);

  const { data: dbPayments, error: paymentsErr } = await paymentsQuery;
  if (paymentsErr) {
    return { movements: null, error: new Error(`Error al consultar pagos: ${paymentsErr.message}`) };
  }

  const validPayments = (dbPayments || []).filter(
    (p: { payment_status?: string }) => !p.payment_status || p.payment_status !== 'voided'
  );

  validPayments.forEach((p: { id: string; payment_date: string; amount: number; payment_method: string; reference_number?: string | null; notes?: string | null; registered_by?: string | null }) => {
    movements.push({
      id: p.id,
      date: p.payment_date,
      type: 'PAGO',
      ticket_code: `PAGO-${p.id.slice(0, 6).toUpperCase()}`,
      amount: Number(p.amount),
      payment_method: p.payment_method,
      reference_number: p.reference_number || null,
      notes: p.notes || 'Abono recibido a cuenta corriente',
      registered_by_name: p.registered_by || 'Administración',
    });
  });

  // 3. Map Adjustments directly from PostgreSQL company_adjustments table
  let adjustmentsQuery = supabase
    .from('company_adjustments')
    .select('*')
    .eq('company_id', companyId);

  if (startDate) adjustmentsQuery = adjustmentsQuery.gte('created_at', startDate);
  if (endDate) adjustmentsQuery = adjustmentsQuery.lte('created_at', endDate);

  const { data: dbAdjustments, error: adjustmentsErr } = await adjustmentsQuery;
  if (adjustmentsErr) {
    return { movements: null, error: new Error(`Error al consultar ajustes: ${adjustmentsErr.message}`) };
  }

  const validAdjustments = (dbAdjustments || []).filter(
    (a: { adjustment_status?: string }) => !a.adjustment_status || a.adjustment_status !== 'voided'
  );

  validAdjustments.forEach((a: { id: string; created_at: string; amount: number; adjustment_type?: string; reason: string; approved_by?: string | null }) => {
    let amt = Number(a.amount);
    if (a.adjustment_type === 'credit_discount') {
      amt = -Math.abs(amt);
    } else if (a.adjustment_type === 'charge_increase') {
      amt = Math.abs(amt);
    }

    movements.push({
      id: a.id,
      date: a.created_at,
      type: 'AJUSTE',
      ticket_code: `AJ-NC-${a.id.slice(0, 6).toUpperCase()}`,
      amount: amt,
      notes: a.reason,
      registered_by_name: a.approved_by || 'SUPERADMIN',
    });
  });

  // Sort chronologically ascending
  movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return { movements, error: null };
}

/**
 * Registers a corporate payment for a company into PostgreSQL Supabase DB atomically using RPC register_company_payment_atomic.
 */
export async function registerCompanyPayment(params: {
  company_id: string;
  amount: number;
  payment_date?: string;
  payment_method: string;
  reference_number?: string | null;
  notes?: string | null;
  idempotency_key?: string | null;
}): Promise<{ data?: { id: string } | null; error: Error | null }> {
  if (params.amount <= 0) {
    return { data: null, error: new Error('El importe del pago debe ser un número positivo mayor a 0.') };
  }

  const supabase = createClient();
  const idempotencyKey =
    params.idempotency_key ||
    `pay_${params.company_id}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const { data, error } = await supabase.rpc('register_company_payment_atomic', {
    p_company_id: params.company_id,
    p_amount: params.amount,
    p_payment_method: params.payment_method,
    p_idempotency_key: idempotencyKey,
    p_reference_number: params.reference_number || null,
    p_notes: params.notes || null,
  });

  if (error) {
    console.error('Error executing register_company_payment_atomic RPC in PostgreSQL:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data: { id: data as string }, error: null };
}

/**
 * Registers a financial adjustment for a company into PostgreSQL Supabase DB.
 */
export async function registerCompanyAdjustment(params: {
  company_id: string;
  amount: number;
  reason: string;
  adjustment_type?: 'charge_increase' | 'credit_discount';
}): Promise<{ data?: { id: string } | null; error: Error | null }> {
  if (!params.reason || params.reason.trim() === '') {
    return { data: null, error: new Error('Debe especificar un motivo válido para registrar un ajuste.') };
  }

  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id || null;

  const adjType =
    params.adjustment_type || (params.amount < 0 ? 'credit_discount' : 'charge_increase');

  const insertPayload = {
    company_id: params.company_id,
    amount: params.amount, // signed amount
    reason: params.reason.trim(),
    approved_by: userId,
    adjustment_type: adjType,
    adjustment_status: 'pending',
  };

  const { data: dbResult, error: dbErr } = await supabase
    .from('company_adjustments')
    .insert([insertPayload])
    .select('id')
    .single();

  if (dbErr) {
    console.error('Error inserting company adjustment into PostgreSQL:', dbErr);
    return { data: null, error: new Error(dbErr.message) };
  }

  return { data: { id: dbResult?.id as string }, error: null };
}

/**
 * Generates structured CSV for Excel export.
 */
export function exportAccountStatementCSV(
  company: Company,
  movements: CompanyMovement[],
  summary: CompanyAccountSummary
): string {
  const headers = [
    'Fecha',
    'Tipo Movimiento',
    'Código Comprobante',
    'Código Carrera',
    'Solicitante',
    'Destino',
    'Móvil Motoquero',
    'Importe (Bs.)',
    'Método Pago',
    'Referencia',
    'Observaciones',
  ];

  const rows = movements.map((m) => [
    new Date(m.date).toLocaleString('es-BO'),
    m.type,
    m.ticket_code,
    m.ride_code || '—',
    m.requester_person || '—',
    m.destination_address || '—',
    m.driver_movil ? `Móvil #${m.driver_movil}` : '—',
    m.amount.toFixed(2),
    m.payment_method || '—',
    m.reference_number || '—',
    `"${(m.notes || '').replace(/"/g, '""')}"`,
  ]);

  const summaryRows = [
    [],
    ['RESUMEN DE CUENTA CORRIENTE'],
    ['Empresa', `"${company.business_name}"`],
    ['NIT', company.nit || 'Sin NIT'],
    ['Total Cargos', summary.total_charges.toFixed(2)],
    ['Total Pagos', summary.total_payments.toFixed(2)],
    ['Total Ajustes', summary.total_adjustments.toFixed(2)],
    ['SALDO PENDIENTE', summary.pending_balance.toFixed(2)],
    ['Estado Cobranza', summary.cobranza_status],
  ];

  const allLines = [
    headers.join(','),
    ...rows.map((r) => r.join(',')),
    ...summaryRows.map((sr) => sr.join(',')),
  ];

  return allLines.join('\n');
}
