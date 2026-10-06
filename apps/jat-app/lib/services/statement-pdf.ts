import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createClient } from '@/lib/supabase/client';
import { calculateTaxSurcharge } from './company-account';
import { CompanyTaxMode } from '@/types/database.types';

export interface StatementTicketItem {
  ride_id: string;
  ticket_code: string;
  ride_code: string;
  date_formatted: string;
  requester_person: string;
  origin: string;
  destination: string;
  route: string;
  movil_number: string;
  total_fare: number;
  amount_applied: number;
  pending_amount: number;
}

export interface StatementSummaryData {
  total_pending_tickets: number;
  subtotal_base: number;
  tax_mode: string;
  tax_rate_label: string;
  tax_amount: number;
  total_charges: number;
  total_applied: number;
  total_pending: number;
  overpayment_credit: number;
}

export interface StatementCompanyData {
  id: string;
  business_name: string;
  nit: string;
  email?: string | null;
}

export interface CorporateStatementPayload {
  company: StatementCompanyData;
  summary: StatementSummaryData;
  tickets: StatementTicketItem[];
  period_label: string;
  generation_date: string;
}

/**
 * Fetches pending tickets and calculates financial summary for a company statement.
 */
export async function getPendingStatementData(
  companyId: string,
  periodFilter: 'all_pending' | 'current_month' | 'last_month' | 'custom' = 'all_pending',
  customStart?: string,
  customEnd?: string
): Promise<{ payload: CorporateStatementPayload | null; error: Error | null }> {
  try {
    const supabase = createClient();

    // 1. Fetch company details
    const { data: company, error: compErr } = await supabase
      .from('companies')
      .select('id, business_name, nit, tax_mode')
      .eq('id', companyId)
      .single();

    if (compErr || !company) {
      return { payload: null, error: new Error('Empresa no encontrada.') };
    }

    // 2. Fetch completed ticket rides not in closed settlements
    let ridesQuery = supabase
      .from('rides')
      .select(`
        id,
        ride_code,
        requester_person,
        pickup_address,
        destination_address,
        total_fare,
        created_at,
        status,
        payment_method,
        driver:drivers (
          movil_number
        )
      `)
      .eq('company_id', companyId)
      .eq('status', 'completed')
      .ilike('payment_method', 'Ticket')
      .order('created_at', { ascending: true });

    if (periodFilter === 'current_month') {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      ridesQuery = ridesQuery.gte('created_at', startOfMonth);
    } else if (periodFilter === 'last_month') {
      const now = new Date();
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
      ridesQuery = ridesQuery.gte('created_at', startOfLastMonth).lte('created_at', endOfLastMonth);
    } else if (periodFilter === 'custom' && customStart && customEnd) {
      ridesQuery = ridesQuery.gte('created_at', customStart).lte('created_at', customEnd);
    }

    const { data: rides, error: ridesErr } = await ridesQuery;
    if (ridesErr) {
      return { payload: null, error: new Error(`Error al consultar carreras: ${ridesErr.message}`) };
    }

    if (!rides || rides.length === 0) {
      // Check overpayment credit balance
      const overpaymentCredit = await fetchOverpaymentCredit(supabase, companyId);

      const emptyTax = calculateTaxSurcharge(0, (company.tax_mode as CompanyTaxMode) || 'SIN_FACTURA');
      return {
        payload: {
          company: {
            id: company.id,
            business_name: company.business_name,
            nit: company.nit || 'Sin NIT',
          },
          summary: {
            total_pending_tickets: 0,
            subtotal_base: 0,
            tax_mode: emptyTax.tax_mode,
            tax_rate_label: emptyTax.tax_rate_label,
            tax_amount: 0,
            total_charges: 0,
            total_applied: 0,
            total_pending: 0,
            overpayment_credit: overpaymentCredit,
          },
          tickets: [],
          period_label: formatPeriodLabel(periodFilter, customStart, customEnd),
          generation_date: new Date().toLocaleString('es-BO'),
        },
        error: null,
      };
    }

    // 3. Exclude rides that belong to closed company settlements
    const rideIds = rides.map((r) => r.id);
    const { data: settledItems } = await supabase
      .from('company_settlement_items')
      .select('ride_id')
      .in('ride_id', rideIds);

    const settledRideIds = new Set((settledItems || []).map((i) => i.ride_id));
    const eligibleRides = rides.filter((r) => !settledRideIds.has(r.id));

    if (eligibleRides.length === 0) {
      const overpaymentCredit = await fetchOverpaymentCredit(supabase, companyId);
      const emptyTax = calculateTaxSurcharge(0, (company.tax_mode as CompanyTaxMode) || 'SIN_FACTURA');
      return {
        payload: {
          company: {
            id: company.id,
            business_name: company.business_name,
            nit: company.nit || 'Sin NIT',
          },
          summary: {
            total_pending_tickets: 0,
            subtotal_base: 0,
            tax_mode: emptyTax.tax_mode,
            tax_rate_label: emptyTax.tax_rate_label,
            tax_amount: 0,
            total_charges: 0,
            total_applied: 0,
            total_pending: 0,
            overpayment_credit: overpaymentCredit,
          },
          tickets: [],
          period_label: formatPeriodLabel(periodFilter, customStart, customEnd),
          generation_date: new Date().toLocaleString('es-BO'),
        },
        error: null,
      };
    }

    // 4. Fetch corporate ticket codes
    const eligibleIds = eligibleRides.map((r) => r.id);
    const { data: corpTickets } = await supabase
      .from('corporate_tickets')
      .select('ride_id, ticket_code')
      .in('ride_id', eligibleIds);

    const ticketMap = new Map<string, string>();
    (corpTickets || []).forEach((ct) => {
      ticketMap.set(ct.ride_id, ct.ticket_code);
    });

    // 5. Fetch payment allocations
    const { data: allocs } = await supabase
      .from('company_payment_allocations')
      .select('ride_id, amount_applied')
      .in('ride_id', eligibleIds);

    const allocMap = new Map<string, number>();
    (allocs || []).forEach((a) => {
      const current = allocMap.get(a.ride_id) || 0;
      allocMap.set(a.ride_id, current + Number(a.amount_applied));
    });

    // 6. Build ticket list and filter out fully paid (pending <= 0)
    const tickets: StatementTicketItem[] = [];
    let totalCharges = 0;
    let totalApplied = 0;
    let totalPending = 0;

    for (const r of eligibleRides) {
      const fare = Number(r.total_fare || 0);
      const applied = allocMap.get(r.id) || 0;
      const pending = Math.max(0, fare - applied);

      if (pending > 0) {
        const origin = (r.pickup_address || '').trim() || 'No registrado';
        const destination = (r.destination_address || '').trim() || 'No registrado';
        const route = `${origin} → ${destination}`;
        const ticketCode = ticketMap.get(r.id) || `TK-${r.ride_code}`;

        const driverObj = r.driver as unknown as { movil_number?: number } | { movil_number?: number }[] | null;
        const movil = Array.isArray(driverObj)
          ? driverObj[0]?.movil_number
          : driverObj?.movil_number;

        const dateFormatted = new Date(r.created_at).toLocaleString('es-BO', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        tickets.push({
          ride_id: r.id,
          ticket_code: ticketCode,
          ride_code: r.ride_code,
          date_formatted: dateFormatted,
          requester_person: r.requester_person || 'Solicitante general',
          origin,
          destination,
          route,
          movil_number: movil ? `Móvil ${movil}` : '—',
          total_fare: fare,
          amount_applied: applied,
          pending_amount: pending,
        });

        totalCharges += fare;
        totalApplied += applied;
        totalPending += pending;
      }
    }

    const overpaymentCredit = await fetchOverpaymentCredit(supabase, companyId);
    const subtotalBase = totalCharges;
    const taxBreakdown = calculateTaxSurcharge(subtotalBase, (company.tax_mode as CompanyTaxMode) || 'SIN_FACTURA');
    const finalTotalCharges = taxBreakdown.total_with_tax;
    const finalTotalPending = Math.max(0, finalTotalCharges - totalApplied);

    return {
      payload: {
        company: {
          id: company.id,
          business_name: company.business_name,
          nit: company.nit || 'Sin NIT',
        },
        summary: {
          total_pending_tickets: tickets.length,
          subtotal_base: subtotalBase,
          tax_mode: taxBreakdown.tax_mode,
          tax_rate_label: taxBreakdown.tax_rate_label,
          tax_amount: taxBreakdown.tax_amount,
          total_charges: finalTotalCharges,
          total_applied: totalApplied,
          total_pending: finalTotalPending,
          overpayment_credit: overpaymentCredit,
        },
        tickets,
        period_label: formatPeriodLabel(periodFilter, customStart, customEnd),
        generation_date: new Date().toLocaleString('es-BO'),
      },
      error: null,
    };
  } catch (err: unknown) {
    return { payload: null, error: (err as Error) };
  }
}

/**
 * Fetches company overpayment credit balance
 */
async function fetchOverpaymentCredit(supabase: ReturnType<typeof createClient>, companyId: string): Promise<number> {
  const { data } = await supabase
    .from('company_payments')
    .select('overpayment_amount')
    .eq('company_id', companyId)
    .eq('payment_status', 'unreconciled_overpayment');

  if (!data || data.length === 0) return 0;
  return data.reduce((sum, item) => sum + Number(item.overpayment_amount || 0), 0);
}

function formatPeriodLabel(
  periodFilter: string,
  customStart?: string,
  customEnd?: string
): string {
  if (periodFilter === 'current_month') return 'Mes Actual';
  if (periodFilter === 'last_month') return 'Mes Anterior';
  if (periodFilter === 'custom' && customStart && customEnd) {
    const s = new Date(customStart).toLocaleDateString('es-BO');
    const e = new Date(customEnd).toLocaleDateString('es-BO');
    return `Del ${s} al ${e}`;
  }
  return 'Todos los pendientes';
}

/**
 * Generates professional jsPDF document for corporate account statement.
 */
export function generateCorporateStatementPDF(payload: CorporateStatementPayload): {
  pdfBlob: Blob;
  pdfArrayBuffer: ArrayBuffer;
  fileName: string;
} {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const primaryColor = [15, 23, 42]; // #0F172A Dark Slate
  const brandYellow = [253, 222, 18]; // #FDDE12 MotoJAT Yellow
  const accentGreen = [16, 185, 129]; // #10B981 Emerald
  const textColor = [51, 65, 85]; // #334155 Slate

  // Header branding banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 28, 'F');

  // Yellow accent line
  doc.setFillColor(brandYellow[0], brandYellow[1], brandYellow[2]);
  doc.rect(0, 28, 210, 2, 'F');

  // MotoJAT Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('MOTOJAT', 14, 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(253, 222, 18);
  doc.text('MOTOSERVI JUSTO A TIEMPO S.R.L. — COBRANZAS CORPORATIVAS', 14, 21);

  // Document Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('ESTADO DE CUENTA CORPORATIVO', 200, 16, { align: 'right' });

  // Company Details & Statement Metadata Header Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 34, 182, 26, 2, 2, 'FD');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(payload.company.business_name, 18, 42);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.text(`NIT: ${payload.company.nit}`, 18, 48);
  doc.text(`Período Consultado: ${payload.period_label}`, 18, 54);

  doc.text(`Fecha de Emisión: ${payload.generation_date}`, 192, 42, { align: 'right' });
  doc.text(`Moneda: Bolivianos (Bs.)`, 192, 48, { align: 'right' });
  doc.text(`Documento de Conciliación`, 192, 54, { align: 'right' });

  // Financial Summary Cards Box
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(14, 64, 182, 22, 2, 2, 'F');

  const colW = 182 / (payload.summary.overpayment_credit > 0 ? 5 : 4);

  // Card 1: Tickets
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(148, 163, 184);
  doc.text('TICKETS PENDIENTES', 14 + 6, 71);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`${payload.summary.total_pending_tickets}`, 14 + 6, 80);

  // Card 2: Total Cargos
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(148, 163, 184);
  doc.text('TOTAL CARGOS', 14 + colW + 4, 71);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`Bs. ${payload.summary.total_charges.toFixed(2)}`, 14 + colW + 4, 80);

  // Card 3: Total Aplicado
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(148, 163, 184);
  doc.text('PAGOS APLICADOS', 14 + colW * 2 + 4, 71);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129);
  doc.text(`Bs. ${payload.summary.total_applied.toFixed(2)}`, 14 + colW * 2 + 4, 80);

  // Card 4: Saldo Pendiente
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(253, 222, 18);
  doc.text('SALDO PENDIENTE', 14 + colW * 3 + 4, 71);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(253, 222, 18);
  doc.text(`Bs. ${payload.summary.total_pending.toFixed(2)}`, 14 + colW * 3 + 4, 80);

  // Card 5 (Optional): Saldo a favor
  if (payload.summary.overpayment_credit > 0) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(56, 189, 248);
    doc.text('SALDO A FAVOR', 14 + colW * 4 + 4, 71);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(56, 189, 248);
    doc.text(`Bs. ${payload.summary.overpayment_credit.toFixed(2)}`, 14 + colW * 4 + 4, 80);
  }

  // Table Data Preparation: Fecha, Nº Ticket, Nº Móvil, Origen, Destino, Monto
  const tableHead = [
    ['Fecha', 'Nº Ticket', 'Nº Móvil', 'Origen', 'Destino', 'Monto'],
  ];

  const tableBody = payload.tickets.map((t) => [
    t.date_formatted,
    t.ticket_code,
    t.movil_number,
    t.origin,
    t.destination,
    `Bs. ${t.total_fare.toFixed(2)}`,
  ]);

  if (tableBody.length === 0) {
    tableBody.push([
      '—',
      '—',
      '—',
      'No existen tickets pendientes de pago a la fecha.',
      '—',
      'Bs. 0.00',
    ]);
  }

  // AutoTable configuration
  autoTable(doc, {
    startY: 90,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [51, 65, 85],
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { cellWidth: 26 }, // Fecha
      1: { cellWidth: 30, fontStyle: 'bold' }, // Nº Ticket
      2: { cellWidth: 18 }, // Nº Móvil
      3: { cellWidth: 46 }, // Origen
      4: { cellWidth: 46 }, // Destino
      5: { cellWidth: 16, halign: 'right', fontStyle: 'bold' }, // Monto
    },
    styles: {
      overflow: 'linebreak',
    },
    showHead: 'everyPage',
    didDrawPage: (data) => {
      // Footer on every page
      const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
      const pageHeight = doc.internal.pageSize.height || 297;

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);

      // Line
      doc.setDrawColor(226, 232, 240);
      doc.line(14, pageHeight - 16, 196, pageHeight - 16);

      // Disclaimer
      doc.text(
        'Este estado de cuenta refleja los servicios corporativos de MotoJAT con saldo pendiente a la fecha de emisión para su conciliación.',
        14,
        pageHeight - 10
      );

      // Page X of Y
      doc.text(`Página ${data.pageNumber} de ${pageCount}`, 196, pageHeight - 10, { align: 'right' });
    },
  });

  // Final Financial Summary Box matching MotoJAT Commercial Standard
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 150;
  if (finalY < 235) {
    const summaryBoxX = 112;
    const summaryBoxY = finalY + 6;
    const hasTax = payload.summary.tax_mode && payload.summary.tax_mode !== 'SIN_FACTURA';
    const boxHeight = hasTax ? (payload.summary.total_applied > 0 ? 36 : 30) : (payload.summary.total_applied > 0 ? 30 : 24);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(summaryBoxX, summaryBoxY, 84, boxHeight, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);

    let currY = summaryBoxY + 5.5;
    doc.text('TOTAL SERVICIOS:', summaryBoxX + 4, currY);
    doc.text(`Bs. ${payload.summary.subtotal_base.toFixed(2)}`, summaryBoxX + 80, currY, { align: 'right' });

    if (payload.summary.tax_mode === 'IVA_13') {
      currY += 5.5;
      doc.text('IVA (13%):', summaryBoxX + 4, currY);
      doc.text(`Bs. ${payload.summary.tax_amount.toFixed(2)}`, summaryBoxX + 80, currY, { align: 'right' });
    } else if (payload.summary.tax_mode === 'EFECTIVA_14_94') {
      currY += 5.5;
      doc.text('IMPUESTO EFECTIVO (14.94%):', summaryBoxX + 4, currY);
      doc.text(`Bs. ${payload.summary.tax_amount.toFixed(2)}`, summaryBoxX + 80, currY, { align: 'right' });
    }

    currY += 5.5;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', summaryBoxX + 4, currY);
    doc.text(`Bs. ${payload.summary.total_charges.toFixed(2)}`, summaryBoxX + 80, currY, { align: 'right' });

    if (payload.summary.total_applied > 0) {
      currY += 5.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(16, 185, 129); // Emerald
      doc.text('PAGOS APLICADOS (-):', summaryBoxX + 4, currY);
      doc.text(`Bs. ${payload.summary.total_applied.toFixed(2)}`, summaryBoxX + 80, currY, { align: 'right' });
    }

    currY += 5.5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(225, 29, 72); // Rose
    doc.text('SALDO PENDIENTE:', summaryBoxX + 4, currY);
    doc.text(`Bs. ${payload.summary.total_pending.toFixed(2)}`, summaryBoxX + 80, currY, { align: 'right' });
  }
  if (finalY < 250) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('NOTA DE CONCILIACIÓN DE COBRANZA', 14, finalY + 8);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.text(
      'El cliente puede utilizar los códigos de ticket y carrera detallados arriba para conciliar con sus vales físicos o comprobantes internos.',
      14,
      finalY + 13
    );
    doc.text(
      'Para consultas, aclaraciones de ruta o soporte administrativo, favor contactar a MotoJAT (tickets@motojat.com / Tel. Oficina).',
      14,
      finalY + 18
    );
  }

  // Generate output
  const pdfArrayBuffer = doc.output('arraybuffer');
  const pdfBlob = doc.output('blob');

  const sanitizedComp = payload.company.business_name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
  const dateStamp = new Date().toISOString().split('T')[0];
  const fileName = `Estado-de-Cuenta-${sanitizedComp}-${dateStamp}.pdf`;

  return { pdfBlob, pdfArrayBuffer, fileName };
}
