import { supabase } from "@/integrations/supabase/client";

export type MarketplaceTenant = {
  id: string;
  name: string;
  subdomain: string;
  status: string;
};

export type MarketplaceBranch = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  branch_type: string;
  category: string;
  delivery_enabled: boolean;
  address?: string | null;
};

export type MarketplaceMerchant = {
  id: string;
  code: string;
  name: string;
  merchant_type: "owned" | "partner" | "franchise";
  status: "draft" | "pending" | "active" | "suspended" | "inactive";
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  created_at: string;
  branch_count: number;
  active_branch_count: number;
  listing_count: number;
  active_listing_count: number;
  order_count: number;
  unsettled_balance: number;
  commission_rule_count: number;
  branches: MarketplaceBranch[];
};

export type MarketplaceCommissionRule = {
  id: string;
  merchant_id?: string | null;
  merchant_name?: string | null;
  name: string;
  commission_percent: number;
  fixed_fee: number;
  calculation_basis: string;
  priority: number;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
};

export type MarketplaceSettlement = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  reference: string;
  status: string;
  period_start?: string | null;
  period_end: string;
  gross_credits: number;
  total_deductions: number;
  net_payable: number;
  currency: string;
  created_at: string;
  paid_at?: string | null;
};

export type MarketplaceDashboard = {
  version: number;
  tenant: MarketplaceTenant & {
    subscription_status?: string | null;
    country?: string | null;
    settings?: Record<string, unknown>;
  };
  manageable_tenants: MarketplaceTenant[];
  summary: {
    merchant_count: number;
    partner_count: number;
    franchise_count: number;
    owned_count: number;
    pending_count: number;
    active_count: number;
    listing_count: number;
    active_listing_count: number;
    marketplace_order_count: number;
    unsettled_payable: number;
    draft_settlement_count: number;
  };
  merchants: MarketplaceMerchant[];
  commission_rules: MarketplaceCommissionRule[];
  settlements: MarketplaceSettlement[];
  generated_at: string;
};

export type CreateMarketplacePartnerInput = {
  tenantId: string;
  merchantName: string;
  branchName: string;
  branchCode?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function marketplaceError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.");
  if (value.includes("MARKETPLACE_ACCESS_DENIED")) return new Error("ليس لديك صلاحية إدارة الـ Marketplace لهذه الشركة.");
  if (value.includes("MARKETPLACE_TENANT_NOT_FOUND")) return new Error("لا توجد شركة متاحة لإدارة الـ Marketplace.");
  if (value.includes("tenant_not_found_or_inactive")) return new Error("الشركة غير موجودة أو غير نشطة.");
  if (value.includes("merchant_and_branch_name_required")) return new Error("اسم المتجر واسم الفرع مطلوبان.");
  if (value.includes("duplicate key") || value.includes("unique constraint")) return new Error("كود الفرع مستخدم بالفعل. اختر كودًا مختلفًا.");
  return new Error(message || "تعذر تنفيذ عملية الـ Marketplace.");
}

export async function fetchMarketplaceAdminDashboard(tenantId?: string | null): Promise<MarketplaceDashboard> {
  const { data, error } = await rpc("get_marketplace_admin_dashboard_v1", {
    p_tenant_id: tenantId || null,
  });
  if (error) throw marketplaceError(error.message);
  return data as MarketplaceDashboard;
}

export async function createMarketplacePartner(input: CreateMarketplacePartnerInput) {
  const { data, error } = await rpc("create_marketplace_partner_v1", {
    p_tenant_id: input.tenantId,
    p_merchant_name: input.merchantName.trim(),
    p_branch_name: input.branchName.trim(),
    p_branch_code: input.branchCode?.trim() || null,
    p_contact_name: input.contactName?.trim() || null,
    p_phone: input.phone?.trim() || null,
    p_email: input.email?.trim() || null,
    p_address: input.address?.trim() || null,
    p_latitude: null,
    p_longitude: null,
    p_owner_user_id: null,
  });
  if (error) throw marketplaceError(error.message);
  return data as {
    merchant_id: string;
    branch_id: string;
    merchant_status: "pending";
    branch_active: false;
    delivery_enabled: false;
  };
}
