export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'SUPERVISOR' | 'OPERATOR' | 'DRIVER' | 'CLIENT_USER';
export type DriverStatus = 'available' | 'busy' | 'offline' | 'baja';
export type RideStatus = 'pending' | 'assigned' | 'ontheway' | 'completed' | 'cancelled';
export type RidePriority = 'low' | 'medium' | 'high' | 'urgent';
export type PaymentMethod = 'Efectivo' | 'QR' | 'Ticket';

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  company_id: string | null;
  user_id: string | null;
  area: string | null;
  position: string | null;
  ci: string | null;
  address: string | null;
  is_active: boolean;
  uses_ticket_contract: boolean;
  created_at: string;
  updated_at: string;
}

export type CompanyTaxMode = 'IVA_13' | 'EFECTIVA_14_94' | 'SIN_FACTURA';

export interface Company {
  id: string;
  business_name: string;
  trade_name: string | null;
  nit: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  primary_contact_customer_id: string | null;
  status: 'active' | 'inactive' | 'suspended';
  uses_ticket_contract: boolean;
  tax_mode?: CompanyTaxMode;
  created_at: string;
  updated_at: string;
}

export type CompanyContractStatus = 'draft' | 'active' | 'suspended' | 'expired' | 'replaced' | 'cancelled';

export interface CompanyContract {
  id: string;
  company_id: string;
  contract_number: string | null;
  start_date: string | null;
  end_date: string | null;
  pdf_file_path: string | null;
  status: CompanyContractStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyUser {
  id: string;
  company_id: string;
  profile_id: string;
  created_at: string;
}

export interface UserPermission {
  id: string;
  profile_id: string;
  permission_key: string;
  granted_by: string | null;
  created_at: string;
}

export interface Driver {
  id: string;
  profile_id: string | null;
  movil_number: number;
  vehicle_type: string;
  vehicle_plate: string;
  zone: string;
  rating: number;
  status: DriverStatus;
  created_at: string;
  updated_at: string;
}

export type SurchargeStatus = 'pending' | 'approved' | 'rejected' | null;

export interface Ride {
  id: string;
  ride_code: string;
  requester_company: string;
  requester_person: string;
  customer_id?: string | null;
  company_id?: string | null;
  pickup_address: string;
  destination_address: string;
  initial_fare: number;
  wait_time_minutes: number;
  wait_time_cost: number;
  total_fare: number;
  status: RideStatus;
  priority: RidePriority;
  driver_id: string | null;
  payment_method: PaymentMethod | null;
  observations: string | null;
  cargo_description?: string | null;
  surcharge_amount?: number | null;
  surcharge_reason?: string | null;
  surcharge_status?: SurchargeStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RideTimeline {
  id: string;
  ride_id: string;
  status_from: string | null;
  status_to: string;
  event_title: string;
  event_description: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface DriverSettlement {
  id: string;
  settlement_code?: string | null;
  driver_id: string;
  cutoff_at?: string;
  period_start: string;
  period_end: string;
  total_rides: number;
  gross_amount: number;
  driver_commission_pct?: number;
  central_commission_pct: number;
  central_commission_amount: number;
  driver_base_share?: number;
  cash_collected?: number;
  qr_collected?: number;
  ticket_collected?: number;
  gross_net_balance?: number;
  bonus_amount?: number;
  discount_amount?: number;
  discount_reason?: string | null;
  final_net_balance?: number;
  driver_payout_amount: number;
  status: 'draft' | 'completed' | 'closed' | 'voided';
  settlement_status?: 'draft' | 'closed' | 'voided';
  payment_status?: 'pending_payment' | 'paid';
  settled_by: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverSettlementItem {
  id: string;
  settlement_id: string;
  ride_id: string;
  driver_id: string;
  ride_code: string;
  requester_person: string | null;
  requester_company: string | null;
  pickup_address: string | null;
  destination_address: string | null;
  payment_method: string;
  gross_fare: number;
  driver_commission_pct: number;
  driver_share_amount: number;
  central_commission_amount: number;
  is_voided: boolean;
  created_at: string;
}

export interface CorporateTicket {
  id: string;
  ride_id: string;
  driver_id: string;
  amount: number;
  ticket_code: string;
  status: 'pending' | 'settled' | 'cancelled';
  settlement_id: string | null;
  created_at: string;
  updated_at: string;
}
