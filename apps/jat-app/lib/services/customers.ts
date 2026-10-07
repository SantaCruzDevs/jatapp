import { createClient } from '@/lib/supabase/client';
import { Customer } from '@/types/database.types';

export interface CustomerWithCompany extends Customer {
  companies?: {
    id: string;
    business_name: string;
    primary_contact_customer_id?: string | null;
  } | null;
  is_primary_contact?: boolean;
}

export interface UnifiedRequesterItem {
  customer_id: string;
  full_name: string;
  phone: string;
  phone_normalized: string | null;
  ci: string | null;
  area: string | null;
  contact_position: string | null;
  is_active: boolean;
  company_id: string | null;
  company_business_name: string | null;
  company_trade_name: string | null;
  company_nit: string | null;
  company_status: string | null;
  is_primary_contact: boolean;
  match_priority?: number;
}

/**
 * Performs unified intelligent search for active requesters (customers & corporate contacts).
 */
export async function searchUnifiedRequesters(
  query: string
): Promise<{ data: UnifiedRequesterItem[] | null; error: Error | null }> {
  const clean = query.trim();
  if (!clean || clean.length < 2) {
    return { data: [], error: null };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('search_unified_requesters', {
    p_query: clean,
  });

  if (error) {
    console.error('Error in searchUnifiedRequesters:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data: (data as UnifiedRequesterItem[]) || [], error: null };
}

/**
 * Normalizes phone numbers by stripping all non-digit characters.
 * E.g., "+591 700-12345" -> "59170012345"
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Retrieves all customers with optional search filtering by name, phone or company.
 */
export async function getCustomers(searchQuery?: string): Promise<{ data: CustomerWithCompany[] | null; error: Error | null }> {
  const supabase = createClient();
  let query = supabase
    .from('customers')
    .select(`
      *,
      companies!customers_company_id_fkey (
        id,
        business_name,
        primary_contact_customer_id
      )
    `)
    .order('created_at', { ascending: false });

  if (searchQuery && searchQuery.trim() !== '') {
    const cleanSearch = searchQuery.trim();
    const digitsOnly = normalizePhone(cleanSearch);

    if (digitsOnly.length > 0) {
      query = query.or(`full_name.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%,phone_normalized.ilike.%${digitsOnly}%,ci.ilike.%${cleanSearch}%,area.ilike.%${cleanSearch}%,position.ilike.%${cleanSearch}%`);
    } else {
      query = query.or(`full_name.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%,ci.ilike.%${cleanSearch}%,area.ilike.%${cleanSearch}%,position.ilike.%${cleanSearch}%`);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching customers:', error);
    return { data: null, error: new Error(error.message) };
  }

  const enrichedData = (data as CustomerWithCompany[] || []).map((c) => ({
    ...c,
    is_primary_contact: Boolean(c.companies && c.companies.primary_contact_customer_id === c.id),
  }));

  return { data: enrichedData, error: null };
}

/**
 * Performs normalized telephone lookup for incoming call / order reception.
 */
export async function findCustomerByPhone(phone: string): Promise<{ customer: CustomerWithCompany | null; error: Error | null }> {
  const digits = normalizePhone(phone);
  if (!digits || digits.length < 4) {
    return { customer: null, error: null };
  }

  const supabase = createClient();
  const lastDigits = digits.slice(-8);

  const { data, error } = await supabase
    .from('customers')
    .select(`
      *,
      companies!customers_company_id_fkey (
        id,
        business_name,
        primary_contact_customer_id
      )
    `)
    .or(`phone_normalized.eq.${digits},phone_normalized.ilike.%${lastDigits}`)
    .limit(1);

  if (error) {
    console.error('Error searching customer by phone:', error);
    return { customer: null, error: new Error(error.message) };
  }

  if (!data || data.length === 0) {
    return { customer: null, error: null };
  }

  const customerObj = data[0] as CustomerWithCompany;
  customerObj.is_primary_contact = Boolean(
    customerObj.companies && customerObj.companies.primary_contact_customer_id === customerObj.id
  );

  return { customer: customerObj, error: null };
}

/**
 * Sets or clears the Primary Contact (Contacto Principal) of a company.
 * Validates that if customerId is provided, the customer belongs to companyId.
 */
export async function setPrimaryContact(
  companyId: string,
  customerId: string | null
): Promise<{ error: Error | null }> {
  const supabase = createClient();

  if (customerId !== null) {
    const { data: cust, error: custErr } = await supabase
      .from('customers')
      .select('company_id')
      .eq('id', customerId)
      .single();

    if (custErr || !cust) {
      return { error: new Error('El cliente especificado como contacto principal no existe.') };
    }

    if (cust.company_id !== companyId) {
      return { error: new Error('Aislamiento multitenant: El contacto principal debe ser un solicitante de la misma empresa.') };
    }
  }

  const { error: updateErr } = await supabase
    .from('companies')
    .update({ primary_contact_customer_id: customerId })
    .eq('id', companyId);

  if (updateErr) {
    console.error('Error updating company primary contact:', updateErr);
    return { error: new Error(updateErr.message) };
  }

  return { error: null };
}

/**
 * Creates a new customer master record.
 */
export async function createCustomer(data: {
  full_name: string;
  phone: string;
  email?: string | null;
  company_id?: string | null;
  area?: string | null;
  position?: string | null;
  ci?: string | null;
  address?: string | null;
  is_active?: boolean;
  uses_ticket_contract?: boolean;
  is_primary_contact?: boolean;
}): Promise<{ customer: Customer | null; error: Error | null }> {
  const supabase = createClient();

  const insertData = {
    full_name: data.full_name.trim(),
    phone: data.phone.trim(),
    email: data.email?.trim() || null,
    company_id: data.company_id || null,
    area: data.area?.trim() || null,
    position: data.position?.trim() || null,
    ci: data.ci?.trim() || null,
    address: data.address?.trim() || null,
    is_active: data.is_active !== undefined ? data.is_active : true,
    uses_ticket_contract: data.uses_ticket_contract !== undefined ? data.uses_ticket_contract : false,
  };

  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert([insertData])
    .select()
    .single();

  if (error) {
    console.error('Error creating customer:', error);
    return { customer: null, error: new Error(error.message) };
  }

  const createdCustomer = newCustomer as Customer;

  // Handle Primary Contact linkage if requested for a corporate customer
  if (data.is_primary_contact && data.company_id) {
    const { error: primaryErr } = await setPrimaryContact(data.company_id, createdCustomer.id);
    if (primaryErr) {
      console.warn('Warning setting primary contact during creation:', primaryErr.message);
    }
  }

  return { customer: createdCustomer, error: null };
}

/**
 * Updates an existing customer master record.
 */
export async function updateCustomer(
  id: string,
  data: {
    full_name?: string;
    phone?: string;
    email?: string | null;
    company_id?: string | null;
    area?: string | null;
    position?: string | null;
    ci?: string | null;
    address?: string | null;
    is_active?: boolean;
    uses_ticket_contract?: boolean;
    is_primary_contact?: boolean;
  }
): Promise<{ customer: Customer | null; error: Error | null }> {
  const supabase = createClient();

  // Retrieve current customer state first
  const { data: currentCust, error: fetchErr } = await supabase
    .from('customers')
    .select('company_id')
    .eq('id', id)
    .single();

  if (fetchErr || !currentCust) {
    return { customer: null, error: new Error('Cliente no encontrado.') };
  }

  const newCompanyId = data.company_id !== undefined ? (data.company_id || null) : currentCust.company_id;

  const updatePayload: Record<string, unknown> = {};
  if (data.full_name !== undefined) updatePayload.full_name = data.full_name.trim();
  if (data.phone !== undefined) updatePayload.phone = data.phone.trim();
  if (data.email !== undefined) updatePayload.email = data.email?.trim() || null;
  if (data.company_id !== undefined) updatePayload.company_id = data.company_id || null;
  if (data.area !== undefined) updatePayload.area = data.area?.trim() || null;
  if (data.position !== undefined) updatePayload.position = data.position?.trim() || null;
  if (data.ci !== undefined) updatePayload.ci = data.ci?.trim() || null;
  if (data.address !== undefined) updatePayload.address = data.address?.trim() || null;
  if (data.is_active !== undefined) updatePayload.is_active = data.is_active;
  if (data.uses_ticket_contract !== undefined) updatePayload.uses_ticket_contract = data.uses_ticket_contract;

  const { data: updated, error } = await supabase
    .from('customers')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating customer:', error);
    return { customer: null, error: new Error(error.message) };
  }

  const updatedCustomer = updated as Customer;

  // Handle Primary Contact updates
  if (data.is_primary_contact !== undefined && newCompanyId) {
    if (data.is_primary_contact) {
      await setPrimaryContact(newCompanyId, id);
    } else {
      // Check if customer was previously primary contact and clear if so
      const { data: comp } = await supabase
        .from('companies')
        .select('primary_contact_customer_id')
        .eq('id', newCompanyId)
        .single();

      if (comp && comp.primary_contact_customer_id === id) {
        await setPrimaryContact(newCompanyId, null);
      }
    }
  } else if (currentCust.company_id && currentCust.company_id !== newCompanyId) {
    // If company changed, check if customer was primary contact of old company and clear
    const { data: oldComp } = await supabase
      .from('companies')
      .select('primary_contact_customer_id')
      .eq('id', currentCust.company_id)
      .single();

    if (oldComp && oldComp.primary_contact_customer_id === id) {
      await setPrimaryContact(currentCust.company_id, null);
    }
  }

  return { customer: updatedCustomer, error: null };
}

/**
 * Retrieves all contacts/requesters belonging to a specific company.
 */
export async function getCompanyContacts(companyId: string): Promise<{ data: CustomerWithCompany[] | null; error: Error | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('customers')
    .select(`
      *,
      companies!customers_company_id_fkey (
        id,
        business_name,
        primary_contact_customer_id
      )
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching company contacts:', error);
    return { data: null, error: new Error(error.message) };
  }

  const enrichedData = (data as CustomerWithCompany[] || []).map((c) => ({
    ...c,
    is_primary_contact: Boolean(c.companies && c.companies.primary_contact_customer_id === c.id),
  }));

  return { data: enrichedData, error: null };
}

