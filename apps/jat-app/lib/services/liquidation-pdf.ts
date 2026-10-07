import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createClient } from '@/lib/supabase/client';
import { formatTicketCode } from '@/lib/services/tickets';

export interface LiquidationTicketItem {
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
}

export interface LiquidationSummaryData {
  payment_received: number;
  applied_to_tickets: number;
  overpayment_credit: number;
  liquidated_tickets_count: number;
}

export interface LiquidationPaymentData {
  payment_id: string;
  payment_code: string;
  payment_date_formatted: string;
  payment_method: string;
  reference_number: string;
  notes: string;
}

export interface LiquidationCompanyData {
  id: string;
  business_name: string;
  nit: string;
  email?: string | null;
}

export interface PaymentLiquidationPayload {
  company: LiquidationCompanyData;
  payment: LiquidationPaymentData;
  summary: LiquidationSummaryData;
  tickets: LiquidationTicketItem[];
  generation_date: string;
}

/**
 * Fetches allocation data for a specific company payment and constructs liquidation payload.
 */
export async function getPaymentLiquidationData(
  paymentId: string
): Promise<{ payload: PaymentLiquidationPayload | null; error: Error | null }> {
  try {
    const supabase = createClient();

    // 1. Fetch payment details
    const { data: payment, error: payErr } = await supabase
      .from('company_payments')
      .select(`
        id,
        company_id,
        amount,
        applied_amount,
        overpayment_amount,
        payment_date,
        payment_method,
        reference_number,
        notes,
        payment_status,
        company:companies (
          id,
          business_name,
          nit,
          email
        )
      `)
      .eq('id', paymentId)
      .single();

    if (payErr || !payment) {
      return { payload: null, error: new Error('Pago no encontrado.') };
    }

    const compObj = payment.company as unknown as {
      id: string;
      business_name: string;
      nit?: string | null;
      email?: string | null;
    } | null;

    if (!compObj) {
      return { payload: null, error: new Error('Información de la empresa no encontrada.') };
    }

    // 2. Fetch payment allocations
    const { data: allocData, error: allocErr } = await supabase
      .from('company_payment_allocations')
      .select(`
        id,
        amount_applied,
        created_at,
        ride:rides (
          id,
          ride_code,
          requester_person,
          pickup_address,
          destination_address,
          total_fare,
          created_at,
          driver:drivers (
            movil_number
          )
        )
      `)
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: true });

    if (allocErr) {
      return { payload: null, error: new Error(`Error al consultar asignaciones: ${allocErr.message}`) };
    }

    // 3. Fetch corporate ticket codes for allocated rides
    const rideIds = (allocData || []).map((item) => (item.ride as unknown as { id: string })?.id).filter(Boolean);
    const corpMap = new Map<string, string>();

    if (rideIds.length > 0) {
      const { data: corpTickets } = await supabase
        .from('corporate_tickets')
        .select('ride_id, ticket_code')
        .in('ride_id', rideIds);

      (corpTickets || []).forEach((ct) => {
        corpMap.set(ct.ride_id, ct.ticket_code);
      });
    }

    // 4. Build ticket items
    const tickets: LiquidationTicketItem[] = (allocData || []).map((item) => {
      const r = item.ride as unknown as {
        id: string;
        ride_code: string;
        requester_person?: string | null;
        pickup_address?: string | null;
        destination_address?: string | null;
        total_fare: number;
        created_at: string;
        driver?: { movil_number?: number } | { movil_number?: number }[] | null;
      };

      const origin = (r.pickup_address || '').trim() || 'No registrado';
      const destination = (r.destination_address || '').trim() || 'No registrado';
      const route = `${origin} → ${destination}`;
      const ticketCode = formatTicketCode(r.ride_code, corpMap.get(r.id));

      const movil = Array.isArray(r.driver) ? r.driver[0]?.movil_number : r.driver?.movil_number;

      const dateFormatted = new Date(r.created_at).toLocaleString('es-BO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      return {
        ride_id: r.id,
        ticket_code: ticketCode,
        ride_code: r.ride_code,
        date_formatted: dateFormatted,
        requester_person: r.requester_person || 'Solicitante general',
        origin,
        destination,
        route,
        movil_number: movil ? `Móvil ${movil}` : '—',
        total_fare: Number(r.total_fare || 0),
        amount_applied: Number(item.amount_applied || 0),
      };
    });

    const paymentCode = `PAGO-${payment.id.substring(0, 6).toUpperCase()}`;
    const paymentDateFormatted = new Date(payment.payment_date).toLocaleString('es-BO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      payload: {
        company: {
          id: compObj.id,
          business_name: compObj.business_name,
          nit: compObj.nit || 'Sin NIT',
          email: compObj.email,
        },
        payment: {
          payment_id: payment.id,
          payment_code: paymentCode,
          payment_date_formatted: paymentDateFormatted,
          payment_method: payment.payment_method || '—',
          reference_number: payment.reference_number || '—',
          notes: payment.notes || '',
        },
        summary: {
          payment_received: Number(payment.amount || 0),
          applied_to_tickets: Number(payment.applied_amount || 0),
          overpayment_credit: Number(payment.overpayment_amount || 0),
          liquidated_tickets_count: tickets.length,
        },
        tickets,
        generation_date: new Date().toLocaleString('es-BO'),
      },
      error: null,
    };
  } catch (err: unknown) {
    return { payload: null, error: err as Error };
  }
}

/**
 * Generates professional jsPDF document for Payment Liquidation.
 */
export function generatePaymentLiquidationPDF(payload: PaymentLiquidationPayload): {
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
  doc.text('MOTOSERVI JUSTO A TIEMPO S.R.L. — COMPROBANTE DE LIQUIDACIÓN DE PAGO', 14, 21);

  // Document Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('LIQUIDACIÓN DE PAGO', 200, 16, { align: 'right' });

  // Company Details & Payment Metadata Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 34, 182, 28, 2, 2, 'FD');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(payload.company.business_name, 18, 42);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.text(`NIT: ${payload.company.nit}`, 18, 48);
  doc.text(`Código de Pago: ${payload.payment.payment_code}`, 18, 54);

  doc.text(`Fecha del Pago: ${payload.payment.payment_date_formatted}`, 192, 42, { align: 'right' });
  doc.text(`Método: ${payload.payment.payment_method}`, 192, 48, { align: 'right' });
  doc.text(`Comprobante / Ref: ${payload.payment.reference_number}`, 192, 54, { align: 'right' });

  // Financial Summary Cards Box
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(14, 66, 182, 22, 2, 2, 'F');

  const colW = 182 / (payload.summary.overpayment_credit > 0 ? 4 : 3);

  // Card 1: Pago Recibido
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(148, 163, 184);
  doc.text('PAGO RECIBIDO', 14 + 6, 73);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`Bs. ${payload.summary.payment_received.toFixed(2)}`, 14 + 6, 82);

  // Card 2: Aplicado a Tickets
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(148, 163, 184);
  doc.text('APLICADO A TICKETS', 14 + colW + 4, 73);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129);
  doc.text(`Bs. ${payload.summary.applied_to_tickets.toFixed(2)}`, 14 + colW + 4, 82);

  // Card 3: Tickets Liquidados
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(148, 163, 184);
  doc.text('TICKETS LIQUI-DADOS', 14 + colW * 2 + 4, 73);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(253, 222, 18);
  doc.text(`${payload.summary.liquidated_tickets_count}`, 14 + colW * 2 + 4, 82);

  // Card 4 (Optional): Saldo a favor
  if (payload.summary.overpayment_credit > 0) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(56, 189, 248);
    doc.text('SALDO A FAVOR (CRÉDITO)', 14 + colW * 3 + 4, 73);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(56, 189, 248);
    doc.text(`Bs. ${payload.summary.overpayment_credit.toFixed(2)}`, 14 + colW * 3 + 4, 82);
  }

  // Table Data Preparation
  const tableHead = [
    ['Vale / Ticket', 'Fecha Carrera', 'Solicitante', 'Móvil', 'Ruta (Origen → Destino)', 'Importe', 'Aplicado por este Pago'],
  ];

  const tableBody = payload.tickets.map((t) => [
    t.ticket_code,
    t.date_formatted,
    t.requester_person,
    t.movil_number,
    t.route,
    `Bs. ${t.total_fare.toFixed(2)}`,
    `Bs. ${t.amount_applied.toFixed(2)}`,
  ]);

  if (tableBody.length === 0) {
    tableBody.push([
      '—',
      '—',
      'Este pago fue registrado históricamente sin desglose individual de tickets.',
      '—',
      '—',
      'Bs. 0.00',
      'Bs. 0.00',
    ]);
  }

  // AutoTable configuration
  autoTable(doc, {
    startY: 94,
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
      0: { cellWidth: 24, fontStyle: 'bold' }, // Ticket
      1: { cellWidth: 26 }, // Fecha
      2: { cellWidth: 28 }, // Solicitante
      3: { cellWidth: 16 }, // Móvil
      4: { cellWidth: 50 }, // Ruta
      5: { cellWidth: 18, halign: 'right' }, // Importe
      6: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] }, // Aplicado
    },
    styles: {
      overflow: 'linebreak',
    },
    showHead: 'everyPage',
    didDrawPage: (data) => {
      const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
      const pageHeight = doc.internal.pageSize.height || 297;

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);

      doc.setDrawColor(226, 232, 240);
      doc.line(14, pageHeight - 16, 196, pageHeight - 16);

      doc.text(
        'Este documento constituye el comprobante oficial de liquidación de pago e imputación de tickets corporativos de MotoJAT.',
        14,
        pageHeight - 10
      );

      doc.text(`Página ${data.pageNumber} de ${pageCount}`, 196, pageHeight - 10, { align: 'right' });
    },
  });

  // Final Summary & Conciliation Note
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 150;
  if (finalY < 250) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('NOTA DE LIQUIDACIÓN Y CONCILIACIÓN', 14, finalY + 8);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.text(
      'La presente liquidación confirma que el pago recibido ha sido imputado a las carreras indicadas respetando la política FIFO.',
      14,
      finalY + 13
    );
    doc.text(
      'Para cualquier consulta administrativa o conciliación, favor contactar a MotoJAT (tickets@motojat.com).',
      14,
      finalY + 18
    );
  }

  const pdfArrayBuffer = doc.output('arraybuffer');
  const pdfBlob = doc.output('blob');

  const sanitizedComp = payload.company.business_name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
  const dateStamp = new Date().toISOString().split('T')[0];
  const fileName = `Liquidacion-de-Pago-${payload.payment.payment_code}-${sanitizedComp}-${dateStamp}.pdf`;

  return { pdfBlob, pdfArrayBuffer, fileName };
}
