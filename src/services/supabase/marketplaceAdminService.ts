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

export type MerchantDetailBranch = MarketplaceBranch & {
  phone?: string | null;
  email?: string | null;
  marketplace_customer_enabled?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  delivery_radius_km: number;
  delivery_fee: number;
  min_order_amount: number;
  estimated_delivery_minutes?: number | null;
  opens_at?: string | null;
  closes_at?: string | null;
  active_delivery_zone_count: number;
};

export type MerchantListing = {
  id: string;
  branch_id: string;
  branch_name: string;
  product_id: string;
  product_name: string;
  barcode?: string | null;
  image_url?: string | null;
  merchant_sku?: string | null;
  status: "draft" | "active" | "paused" | "rejected" | "archived";
  marketplace_customer_enabled?: boolean;
  preparation_minutes?: number | null;
  sale_price?: number | null;
  purchase_price?: number | null;
  offer_price?: number | null;
  is_offer: boolean;
  quantity?: number | null;
  created_at: string;
};

export type MerchantReadiness = {
  merchant_id: string;
  tenant_id: string;
  merchant_type: MarketplaceMerchant["merchant_type"];
  merchant_status: string;
  approved_at?: string | null;
  customer_published_at?: string | null;
  ready_for_approval: boolean;
  missing: string[];
  checks: {
    merchant_contact: boolean;
    branch_count: number;
    branch_profiles_ready: number;
    branches_with_active_delivery_zone: number;
    listing_count: number;
    valid_listing_count: number;
    active_commission_rule_count: number;
  };
};

export type CustomerPublishReadiness = {
  merchant_id: string;
  ready_for_customer_publish: boolean;
  missing: string[];
  base_readiness?: MerchantReadiness;
  checks: {
    branch_count?: number;
    branches_with_coordinates?: number;
    publishable_listings?: number;
    [key: string]: unknown;
  };
};

export type MarketplaceMerchantDetail = {
  merchant: {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
    merchant_type: MarketplaceMerchant["merchant_type"];
    status: MarketplaceMerchant["status"];
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
    metadata?: Record<string, unknown>;
    marketplace_approved_at?: string | null;
    customer_published_at?: string | null;
    created_at: string;
  };
  branches: MerchantDetailBranch[];
  listings: MerchantListing[];
  commission_rules: MarketplaceCommissionRule[];
  settlements: MarketplaceSettlement[];
  readiness: MerchantReadiness;
  customer_publish_readiness: CustomerPublishReadiness;
  generated_at: string;
};

export type MarketplaceProductMasterItem = {
  id: string;
  name: string;
  barcode?: string | null;
  image_url?: string | null;
  default_sale_price: number;
  default_purchase_price: number;
  unit_of_measure?: string | null;
  main_category_id?: string | null;
  already_listed: boolean;
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
  if (value.includes("MARKETPLACE_CUSTOMER_NOT_READY")) return new Error("لا يمكن نشر المتجر للعملاء قبل استكمال متطلبات النشر الظاهرة في الصفحة.");
  if (value.includes("MARKETPLACE_NOT_READY")) return new Error("لا يمكن اعتماد المتجر قبل استكمال كل متطلبات التجهيز.");
  if (value.includes("merchant_not_publishable")) return new Error("المتجر غير قابل للنشر للعملاء بالحالة الحالية.");
  if (value.includes("tenant_not_found_or_inactive")) return new Error("الشركة غير موجودة أو غير نشطة.");
  if (value.includes("merchant_and_branch_name_required")) return new Error("اسم المتجر واسم الفرع مطلوبان.");
  if (value.includes("commission_rule_name_required")) return new Error("اسم قاعدة العمولة مطلوب.");
  if (value.includes("invalid_commission_percent")) return new Error("نسبة العمولة يجب أن تكون بين 0 و100.");
  if (value.includes("branch_address_required")) return new Error("عنوان الفرع مطلوب قبل الاعتماد.");
  if (value.includes("branch_does_not_belong_to_merchant")) return new Error("الفرع لا يتبع هذا المتجر.");
  if (value.includes("duplicate key") || value.includes("unique constraint")) return new Error("القيمة مستخدمة بالفعل. راجع كود الفرع أو البيانات المدخلة.");
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

export async function fetchMarketplaceMerchantDetail(merchantId: string): Promise<MarketplaceMerchantDetail> {
  const { data, error } = await rpc("get_marketplace_merchant_detail_v1", {
    p_merchant_id: merchantId,
  });
  if (error) throw marketplaceError(error.message);
  return data as MarketplaceMerchantDetail;
}

export async function saveMarketplaceCommissionRule(input: {
  merchantId: string;
  name: string;
  commissionPercent: number;
  fixedFee?: number;
  calculationBasis?: "merchandise_subtotal" | "order_total" | "net_after_discounts";
}) {
  const { data, error } = await rpc("upsert_marketplace_commission_rule_v1", {
    p_merchant_id: input.merchantId,
    p_name: input.name.trim(),
    p_commission_percent: input.commissionPercent,
    p_fixed_fee: input.fixedFee ?? 0,
    p_calculation_basis: input.calculationBasis || "merchandise_subtotal",
    p_effective_from: new Date().toISOString(),
    p_priority: 100,
  });
  if (error) throw marketplaceError(error.message);
  return data as { rule_id: string; merchant_id: string; active: boolean };
}

export async function searchMarketplaceProductMaster(merchantId: string, query: string): Promise<MarketplaceProductMasterItem[]> {
  const { data, error } = await rpc("search_marketplace_product_master_v1", {
    p_merchant_id: merchantId,
    p_query: query.trim(),
    p_limit: 30,
  });
  if (error) throw marketplaceError(error.message);
  return (data || []) as MarketplaceProductMasterItem[];
}

export async function saveMarketplaceListing(input: {
  merchantId: string;
  branchId: string;
  productId: string;
  salePrice: number;
  purchasePrice: number;
  quantity: number;
  offerPrice?: number | null;
  isOffer?: boolean;
  merchantSku?: string;
  preparationMinutes?: number | null;
}) {
  const { data, error } = await rpc("upsert_marketplace_listing_v1", {
    p_merchant_id: input.merchantId,
    p_branch_id: input.branchId,
    p_product_id: input.productId,
    p_sale_price: input.salePrice,
    p_purchase_price: input.purchasePrice,
    p_quantity: input.quantity,
    p_offer_price: input.offerPrice ?? null,
    p_is_offer: input.isOffer ?? false,
    p_merchant_sku: input.merchantSku?.trim() || null,
    p_preparation_minutes: input.preparationMinutes ?? null,
    p_requested_status: "draft",
  });
  if (error) throw marketplaceError(error.message);
  return data as Record<string, unknown>;
}

export async function updateMarketplaceBranchProfile(input: {
  merchantId: string;
  branchId: string;
  address: string;
  phone?: string;
  email?: string;
  latitude?: number | null;
  longitude?: number | null;
  deliveryFee?: number;
  minOrderAmount?: number;
  estimatedDeliveryMinutes?: number | null;
}) {
  const { data, error } = await rpc("update_marketplace_branch_profile_v1", {
    p_merchant_id: input.merchantId,
    p_branch_id: input.branchId,
    p_address: input.address.trim(),
    p_phone: input.phone?.trim() || null,
    p_email: input.email?.trim() || null,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_delivery_fee: input.deliveryFee ?? 0,
    p_min_order_amount: input.minOrderAmount ?? 0,
    p_estimated_delivery_minutes: input.estimatedDeliveryMinutes ?? null,
  });
  if (error) throw marketplaceError(error.message);
  return data as { branch_id: string; updated: boolean };
}

export async function approveMarketplaceMerchant(merchantId: string) {
  const { data, error } = await rpc("approve_marketplace_merchant_v1", {
    p_merchant_id: merchantId,
  });
  if (error) throw marketplaceError(error.message);
  return data as {
    merchant_id: string;
    approved: boolean;
    customer_published: false;
    branches_active: false;
    delivery_enabled: false;
    readiness: MerchantReadiness;
  };
}

export async function publishMarketplaceMerchant(merchantId: string) {
  const { data, error } = await rpc("publish_marketplace_merchant_v1", {
    p_merchant_id: merchantId,
  });
  if (error) throw marketplaceError(error.message);
  return data as {
    merchant_id: string;
    customer_published: true;
    published_listings: number;
    readiness: CustomerPublishReadiness;
  };
}

export async function unpublishMarketplaceMerchant(merchantId: string) {
  const { data, error } = await rpc("unpublish_marketplace_merchant_v1", {
    p_merchant_id: merchantId,
  });
  if (error) throw marketplaceError(error.message);
  return data as {
    merchant_id: string;
    customer_published: false;
  };
}
