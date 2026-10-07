import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { CompanyContract, CompanyContractStatus } from '@/types/database.types';

export interface CreateCompanyContractPayload {
  company_id: string;
  contract_number: string;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
  status: CompanyContractStatus;
}

/**
 * Evaluates and returns the current operational contract for a company.
 * Semiautomatic Lifecycle:
 * 1. Checks if an 'active' contract exists and is within valid date range.
 * 2. If an 'active' contract has expired (end_date < today), normalizes it to 'expired'.
 * 3. If no active contract exists, checks for a 'draft' contract whose start_date <= today.
 * 4. Semiautomatically activates valid 'draft' contract ('draft' -> 'active') if start_date has arrived.
 */
export async function getOperationalCompanyContract(
  companyId: string
): Promise<CompanyContract | null> {
  const supabase = createBrowserClient();
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    // 1. Fetch all non-cancelled/replaced contracts for this company
    const { data: contracts, error } = await supabase
      .from('company_contracts')
      .select('*')
      .eq('company_id', companyId)
      .in('status', ['active', 'draft'])
      .order('start_date', { ascending: true });

    if (error || !contracts || contracts.length === 0) {
      return null;
    }

    // 2. Check current 'active' contract
    const activeContract = contracts.find((c) => c.status === 'active');
    if (activeContract) {
      const startOk = !activeContract.start_date || activeContract.start_date <= todayStr;
      const endOk = !activeContract.end_date || activeContract.end_date >= todayStr;

      if (startOk && endOk) {
        return activeContract as CompanyContract;
      }

      // If active contract has passed end_date -> mark as expired
      if (activeContract.end_date && activeContract.end_date < todayStr) {
        await supabase
          .from('company_contracts')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', activeContract.id);
      }
    }

    // 3. Semiautomatic activation of scheduled 'draft' contracts whose start_date has arrived
    const pendingDraft = contracts.find(
      (c) =>
        c.status === 'draft' &&
        c.start_date &&
        c.start_date <= todayStr &&
        (!c.end_date || c.end_date >= todayStr)
    );

    if (pendingDraft) {
      const { data: activated, error: activateErr } = await supabase
        .from('company_contracts')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', pendingDraft.id)
        .select()
        .single();

      if (!activateErr && activated) {
        return activated as CompanyContract;
      }
    }

    return null;
  } catch (err) {
    console.error('Error in getOperationalCompanyContract:', err);
    return null;
  }
}

/**
 * Fetches all company contracts for a given company_id ordered by created_at DESC.
 * Triggers semiautomatic lifecycle checks before returning records.
 */
export async function getCompanyContracts(companyId: string): Promise<CompanyContract[]> {
  const supabase = createBrowserClient();

  // Run semiautomatic status resolution first
  await getOperationalCompanyContract(companyId);

  const { data, error } = await supabase
    .from('company_contracts')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching company contracts:', error);
    throw new Error(`Error al consultar contratos corporativos: ${error.message}`);
  }

  return (data as CompanyContract[]) || [];
}

/**
 * Checks if the company currently has an active contract in public.company_contracts.
 */
export async function hasActiveCompanyContract(companyId: string): Promise<boolean> {
  const operational = await getOperationalCompanyContract(companyId);
  return Boolean(operational && operational.status === 'active');
}

/**
 * Creates a new company contract in public.company_contracts.
 */
export async function createCompanyContract(
  payload: CreateCompanyContractPayload
): Promise<CompanyContract> {
  const supabase = createBrowserClient();

  // Get current user id for created_by audit
  const { data: { user } } = await supabase.auth.getUser();

  const insertData = {
    company_id: payload.company_id,
    contract_number: payload.contract_number.trim(),
    start_date: payload.start_date,
    end_date: payload.end_date || null,
    notes: payload.notes?.trim() || null,
    status: payload.status,
    created_by: user?.id || null,
  };

  const { data, error } = await supabase
    .from('company_contracts')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Error creating company contract:', error);
    if (error.code === '23505') {
      throw new Error(
        'Esta empresa ya tiene un contrato activo registrado. Para habilitar otro contrato activo simultáneo debe gestionarse el contrato actual.'
      );
    }
    throw new Error(`Error al registrar el contrato: ${error.message}`);
  }

  return data as CompanyContract;
}

/**
 * Uploads a contract PDF file to Supabase Storage bucket 'company-contracts'
 * using path format: {company_id}/{contract_id}.pdf,
 * and updates public.company_contracts.pdf_file_path.
 * Includes orphan file cleanup if DB update fails.
 */
export async function uploadContractPdf(
  companyId: string,
  contractId: string,
  file: File
): Promise<string> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Formato no soportado. Debe seleccionar un archivo en formato PDF.');
  }

  // 10MB maximum file size limit
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error('El archivo PDF excede el tamaño máximo permitido (10 MB).');
  }

  const supabase = createBrowserClient();
  const filePath = `${companyId}/${contractId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('company-contracts')
    .upload(filePath, file, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    console.error('Error uploading contract PDF to storage:', uploadError);
    throw new Error(`Error al subir el documento PDF a Storage: ${uploadError.message}`);
  }

  // Update company_contracts table with pdf_file_path
  const { error: updateError } = await supabase
    .from('company_contracts')
    .update({
      pdf_file_path: filePath,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId);

  if (updateError) {
    console.error('Error updating contract pdf_file_path:', updateError);
    // Cleanup orphan file if DB update failed
    await supabase.storage.from('company-contracts').remove([filePath]);
    throw new Error(`El PDF fue subido pero no se pudo actualizar el registro: ${updateError.message}`);
  }

  return filePath;
}

/**
 * Generates a signed URL to view/download a contract PDF from Storage.
 */
export async function getContractPdfSignedUrl(pdfFilePath: string): Promise<string | null> {
  if (!pdfFilePath) return null;

  const supabase = createBrowserClient();
  const { data, error } = await supabase.storage
    .from('company-contracts')
    .createSignedUrl(pdfFilePath, 3600); // 1 hour expiration

  if (error || !data?.signedUrl) {
    console.error('Error creating signed URL for contract PDF:', error);
    return null;
  }

  return data.signedUrl;
}
