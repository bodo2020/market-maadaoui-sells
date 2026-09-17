import { supabase } from "@/integrations/supabase/client";

export type FranchisePortalRole = "owner" | "admin" | "manager";

export type FranchisePortalMembership = {
  merchant_id: string;
  merchant_name: string;
  merchant_code: string;
  merchant_status: string;
  tenant_id?: string;
  role: FranchisePortalRole;
};

export type FranchisePortalIdentity = {
  user_id: string;
  default_merchant_id: string;
  memberships: FranchisePortalMembership[];
};

export type FranchisePortalCapabilities = {
  can_view_analytics: boolean;
  can_view_finance: boolean;
  can_manage_inventory: boolean;
  can_manage_branches: boolean;
  can_manage_agreement: boolean;
  can_manage_settlements: boolean;
};

export type FranchisePortalBranch = {
  id: string;
  name: string;
  code: string;
  franchise_code?: string | null;
  active: boolean;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  delivery_fee?: number | null;
  min_order_amount?: number | null;
  estimated_delivery_minutes?: number | null;
  channels?: Record<string, unknown>;
  period_sales?: {
    pos_count: number;
    pos_gross: number;
    online_delivered_count: number;
    online_delivered_gross: number;
  } | null;
  inventory: {
    product_count: number;
    out_of_stock_count: number;
    low_stock_count: number;
  };
};

export type FranchisePortalSettlement = {
  id: string;
  reference: string;
  status: string;
  period_start: string;
  period_end: string;
  gross_credits: number;
  total_deductions: number;
  net_payable: number;
  currency: string;
  external_reference?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
};

export type FranchisePortalFinanceEntry = {
  id: string;
  branch_id?: string | null;
  entry_type: string;
  signed_amount: number;
  currency: string;
  description?: string | null;
  occurred_at: string;
  created_at: string;
  settled: boolean;
};

export type FranchisePortalWorkspace = {
  identity: {
    user_id: string;
    role: FranchisePortalRole;
    selected_merchant_id: string;
    memberships: FranchisePortalMembership[];
    capabilities: FranchisePortalCapabilities;
  };
  merchant: {
    id: string;
    tenant_id: string;
    name: string;
    code: string;
    status: string;
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  profile: {
    legal_entity_name: string;
    commercial_registration?: string | null;
    tax_registration?: string | null;
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
    territory_name?: string | null;
    territory_scope?: unknown;
  } | null;
  agreement: {
    id: string;
    agreement_code: string;
    version: number;
    status: string;
    starts_on: string;
    ends_on?: string | null;
    currency: string;
    settlement_cycle: string;
    pricing_policy: string;
    catalog_policy: string;
    supplier_policy: string;
    promotion_policy: string;
    max_branches?: number | null;
    can_manage_inventory: boolean;
    can_view_analytics: boolean;
    max_discount_percentage: number;
    requires_order_approval: boolean;
    royalty_rate?: number | null;
    marketing_fee_rate?: number | null;
    platform_fee_rate?: number | null;
    monthly_fixed_fee?: number | null;
  } | null;
  period: { start: string; end: string };
  sales: {
    pos_count: number;
    pos_gross: number;
    pos_profit: number;
    online_count: number;
    online_delivered_count: number;
    online_delivered_gross: number;
    total_gross: number;
  } | null;
  inventory: {
    product_count: number;
    units: number;
    out_of_stock_count: number;
    low_stock_count: number;
    cost_value?: number | null;
    retail_value: number;
  };
  branches: FranchisePortalBranch[];
  finance: {
    royalty: number;
    marketing: number;
    platform: number;
    fixed: number;
    adjustments: number;
    period_balance: number;
    unsettled_balance: number;
    balance_direction: "merchant_owes_platform" | "platform_owes_merchant" | "balanced";
    settlements: FranchisePortalSettlement[];
    entries: FranchisePortalFinanceEntry[];
  } | null;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function staffCompatibleEmail(login: string) {
  return `u-${bytesToBase64Url(new TextEncoder().encode(login.trim()))}@staff.elmadawymarket.local`;
}

function friendlyPortalError(message?: string) {
  if (message?.includes("FRANCHISE_PORTAL_ACCESS_REQUIRED")) return "الحساب غير مرتبط بمشغل Franchise نشط.";
  if (message?.includes("FRANCHISE_PORTAL_MERCHANT_ACCESS_REQUIRED")) return "ليس لديك صلاحية للوصول لهذا المشغل.";
  if (message?.includes("AUTH_REQUIRED")) return "سجّل الدخول للمتابعة.";
  return message || "تعذر تحميل بوابة الـFranchise.";
}

export async function fetchMyFranchisePortalIdentity(): Promise<FranchisePortalIdentity> {
  const { data, error } = await rpc("get_my_franchise_portal_identity_v1");
  if (error || !data) throw new Error(friendlyPortalError(error?.message));
  return data as FranchisePortalIdentity;
}

export async function fetchMyFranchisePortal(
  merchantId: string,
  periodStart: string,
  periodEnd: string,
): Promise<FranchisePortalWorkspace> {
  const { data, error } = await rpc("get_my_franchise_portal_v1", {
    p_merchant_id: merchantId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
  if (error || !data) throw new Error(friendlyPortalError(error?.message));
  return data as FranchisePortalWorkspace;
}

export async function signInFranchisePortal(login: string, password: string) {
  const normalized = login.trim();
  if (!normalized || !password) throw new Error("اكتب البريد أو اسم المستخدم وكلمة المرور.");

  const email = normalized.includes("@") ? normalized : staffCompatibleEmail(normalized);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("بيانات الدخول غير صحيحة.");

  try {
    return await fetchMyFranchisePortalIdentity();
  } catch (portalError) {
    await supabase.auth.signOut();
    throw portalError;
  }
}

export async function signOutFranchisePortal() {
  await supabase.auth.signOut();
}

export async function hasFranchisePortalSession() {
  const { data, error } = await supabase.auth.getSession();
  return !error && !!data.session?.user;
}
