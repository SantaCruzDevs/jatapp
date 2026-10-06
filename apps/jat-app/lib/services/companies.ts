import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { Company, CompanyTaxMode, CompanyUser, Profile } from '@/types/database.types';

export async function getCompanies(search?: string): Promise<Company[]> {
  const supabase = createBrowserClient();
  let query = supabase.from('companies').select('*').order('created_at', { ascending: false });

  if (search && search.trim() !== '') {
    const term = search.trim();
    query = query.or(`business_name.ilike.%${term}%,trade_name.ilike.%${term}%,nit.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching companies:', error);
    throw new Error(`Error al obtener empresas: ${error.message}`);
  }

  return (data as Company[]) || [];
}

export async function createCompany(payload: {
  business_name: string;
  trade_name?: string | null;
  nit?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_mode?: CompanyTaxMode;
}): Promise<Company> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase
    .from('companies')
    .insert({
      business_name: payload.business_name.trim(),
      trade_name: payload.trade_name?.trim() || null,
      nit: payload.nit?.trim() || null,
      phone: payload.phone?.trim() || null,
      email: payload.email?.trim() || null,
      address: payload.address?.trim() || null,
      tax_mode: payload.tax_mode || 'SIN_FACTURA',
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating company:', error);
    throw new Error(`Error al crear la empresa: ${error.message}`);
  }

  return data as Company;
}

export async function updateCompany(
  id: string,
  payload: {
    business_name?: string;
    trade_name?: string | null;
    nit?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    primary_contact_customer_id?: string | null;
    status?: 'active' | 'inactive' | 'suspended';
    tax_mode?: CompanyTaxMode;
  }
): Promise<Company> {
  const supabase = createBrowserClient();
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.business_name !== undefined) updateData.business_name = payload.business_name.trim();
  if (payload.trade_name !== undefined) updateData.trade_name = payload.trade_name?.trim() || null;
  if (payload.nit !== undefined) updateData.nit = payload.nit?.trim() || null;
  if (payload.phone !== undefined) updateData.phone = payload.phone?.trim() || null;
  if (payload.email !== undefined) updateData.email = payload.email?.trim() || null;
  if (payload.address !== undefined) updateData.address = payload.address?.trim() || null;
  if (payload.primary_contact_customer_id !== undefined) updateData.primary_contact_customer_id = payload.primary_contact_customer_id || null;
  if (payload.status !== undefined) updateData.status = payload.status;
  if (payload.tax_mode !== undefined) updateData.tax_mode = payload.tax_mode;

  const { data, error } = await supabase
    .from('companies')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating company:', error);
    throw new Error(`Error al actualizar la empresa: ${error.message}`);
  }

  return data as Company;
}

export async function setCompanyPrimaryContact(
  companyId: string,
  customerId: string | null
): Promise<Company> {
  return updateCompany(companyId, { primary_contact_customer_id: customerId });
}

export async function getCompanyUsers(companyId: string): Promise<(CompanyUser & { profile: Profile })[]> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase
    .from('company_users')
    .select('*, profile:profiles(*)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching company users:', error);
    throw new Error(`Error al obtener usuarios corporativos: ${error.message}`);
  }

  return (data as (CompanyUser & { profile: Profile })[]) || [];
}

export async function linkCompanyUser(companyId: string, profileId: string): Promise<CompanyUser> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase
    .from('company_users')
    .insert({
      company_id: companyId,
      profile_id: profileId,
    })
    .select()
    .single();

  if (error) {
    console.error('Error linking company user:', error);
    if (error.code === '23505') {
      throw new Error('El usuario ya se encuentra vinculado a esta empresa.');
    }
    throw new Error(`Error al vincular el usuario a la empresa: ${error.message}`);
  }

  return data as CompanyUser;
}

export async function unlinkCompanyUser(companyId: string, profileId: string): Promise<void> {
  const supabase = createBrowserClient();
  const { error } = await supabase
    .from('company_users')
    .delete()
    .eq('company_id', companyId)
    .eq('profile_id', profileId);

  if (error) {
    console.error('Error unlinking company user:', error);
    throw new Error(`Error al desvincular el usuario: ${error.message}`);
  }
}

/**
 * Creates a Company and its First Contact atomically via PostgreSQL RPC create_company_with_first_contact_atomic
 */
export async function createCompanyWithFirstContact(payload: {
  business_name: string;
  trade_name?: string | null;
  nit?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  company_address?: string | null;
  contact_full_name: string;
  contact_phone: string;
  contact_ci?: string | null;
  contact_email?: string | null;
  contact_area?: string | null;
  contact_position?: string | null;
  contact_address?: string | null;
  is_primary_contact?: boolean;
  is_active?: boolean;
}): Promise<{ company_id: string; customer_id: string; is_primary_contact: boolean }> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase.rpc('create_company_with_first_contact_atomic', {
    p_business_name: payload.business_name.trim(),
    p_trade_name: payload.trade_name?.trim() || null,
    p_nit: payload.nit?.trim() || null,
    p_company_phone: payload.company_phone?.trim() || null,
    p_company_email: payload.company_email?.trim() || null,
    p_company_address: payload.company_address?.trim() || null,
    p_contact_full_name: payload.contact_full_name.trim(),
    p_contact_phone: payload.contact_phone.trim(),
    p_contact_ci: payload.contact_ci?.trim() || null,
    p_contact_email: payload.contact_email?.trim() || null,
    p_contact_area: payload.contact_area?.trim() || null,
    p_contact_position: payload.contact_position?.trim() || null,
    p_contact_address: payload.contact_address?.trim() || null,
    p_is_primary_contact: payload.is_primary_contact !== undefined ? payload.is_primary_contact : true,
    p_is_active: payload.is_active !== undefined ? payload.is_active : true,
  });

  console.log('=== CREATE COMPANY RPC DEBUG ===');
  console.log('RPC data:', data);
  console.log('RPC error raw:', error);
  console.log('RPC error type:', typeof error);
  console.log('RPC error String:', String(error));
  console.log('RPC error own properties:', error ? Object.getOwnPropertyNames(error) : null);
  console.log('RPC error JSON:', error ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : null);
  console.log('================================');

  if (error) {
    console.error('Error in createCompanyWithFirstContact:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      status: (error as any).status,
      errorObj: error,
    });
    const errorDetails = error ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : '';
    throw new Error(error.message || `Error RPC ${error.code || ''}: ${errorDetails}`);
  }

  return data as { company_id: string; customer_id: string; is_primary_contact: boolean };
}

