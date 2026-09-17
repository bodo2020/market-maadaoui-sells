import { supabase } from "@/integrations/supabase/client";

export type BranchChannelKey =
  | "pos"
  | "online_sales"
  | "customer_app"
  | "marketplace"
  | "delivery"
  | "pickup";

export type MerchantType = "owned" | "franchise" | "partner";

export interface BranchChannelRuntime {
  branch_id: string;
  tenant_id: string;
  merchant_id: string;
  merchant_type: MerchantType;
  channel: BranchChannelKey;
  configured_enabled: boolean;
  effective_enabled: boolean;
  blocked_by: string[];
  reason?: string | null;
  message_ar?: string | null;
  source: string;
  revision: number;
  updated_at?: string | null;
}

export interface BranchActiveResult {
  branch_id: string;
  tenant_id: string;
  merchant_id: string;
  merchant_type: MerchantType;
  merchant_status: string;
  active: boolean;
  changed: boolean;
  reason?: string | null;
  agreement_status?: string | null;
  agreement_starts_on?: string | null;
  agreement_ends_on?: string | null;
}

export interface BranchGroupSummary {
  id: string;
  code: string;
  name: string;
  group_type: "region" | "operations" | "franchise_network" | "marketplace_network" | "custom";
  active: boolean;
  merchant_id?: string | null;
  metadata?: Record<string, unknown>;
  branch_ids?: string[];
}

export interface BranchStructureNode {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  active: boolean;
  category?: string | null;
  branch_type?: string | null;
  delivery_enabled: boolean;
  marketplace_customer_enabled: boolean;
  opens_at?: string | null;
  closes_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  channels: Record<BranchChannelKey, BranchChannelRuntime>;
  groups: BranchGroupSummary[];
}

export interface MerchantStructureNode {
  id: string;
  code: string;
  name: string;
  merchant_type: MerchantType;
  status: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  customer_published_at?: string | null;
  branch_count: number;
  branches: BranchStructureNode[];
}

export interface BusinessStructureDashboard {
  tenant: {
    id: string;
    name: string;
    subdomain: string;
    status: string;
    logo_url?: string | null;
    country?: string | null;
    city?: string | null;
  };
  summary: {
    merchant_count: number;
    branch_count: number;
    owned_branch_count: number;
    franchise_branch_count: number;
    marketplace_branch_count: number;
    active_branch_count: number;
    online_branch_count: number;
    delivery_branch_count: number;
  };
  merchants: MerchantStructureNode[];
  groups: BranchGroupSummary[];
  generated_at: string;
}

export interface BranchControlDetail {
  branch: BranchStructureNode & {
    tenant_id: string;
    merchant_id: string;
    phone?: string | null;
    email?: string | null;
    independent_pricing?: boolean;
    independent_inventory?: boolean;
    inventory_source_branch_id?: string | null;
    pricing_source_branch_id?: string | null;
    delivery_radius_km?: number | null;
    delivery_fee?: number | null;
    min_order_amount?: number | null;
    estimated_delivery_minutes?: number | null;
  };
  merchant: Omit<MerchantStructureNode, "branches" | "branch_count">;
  channels: Record<BranchChannelKey, BranchChannelRuntime>;
  groups: BranchGroupSummary[];
  health: {
    inventory_sku_count: number;
    low_stock_count: number;
    active_online_orders: number;
    orders_last_24h: number;
    last_order_at?: string | null;
    active_delivery_zones: number;
  };
}

function friendlyBranchControlError(message?: string) {
  const value = message || "تعذر تنفيذ العملية";
  const map: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "يجب تسجيل الدخول أولًا.",
    TENANT_ACCESS_REQUIRED: "ليس لديك صلاحية لعرض هيكل هذه الشركة.",
    BUSINESS_STRUCTURE_MANAGER_REQUIRED: "تحتاج صلاحية إدارة هيكل الفروع لتنفيذ العملية.",
    BRANCH_NOT_FOUND: "الفرع غير موجود.",
    BRANCH_MERCHANT_NOT_FOUND: "المشغل المرتبط بالفرع غير موجود.",
    BRANCH_MERCHANT_NOT_ACTIVE: "لا يمكن تشغيل الفرع لأن المشغل نفسه غير نشط.",
    BRANCH_DISABLE_REASON_REQUIRED: "سبب إيقاف الفرع مطلوب.",
    FRANCHISE_AGREEMENT_REQUIRED: "لا يمكن تشغيل فرع Franchise قبل إنشاء عقد حالي.",
    FRANCHISE_AGREEMENT_NOT_ACTIVE: "لا يمكن تشغيل فرع Franchise قبل تفعيل العقد.",
    FRANCHISE_AGREEMENT_NOT_STARTED: "لا يمكن تشغيل الفرع قبل تاريخ بداية عقد الـFranchise.",
    FRANCHISE_AGREEMENT_EXPIRED: "لا يمكن تشغيل الفرع لأن عقد الـFranchise منتهي.",
    INVALID_BRANCH_CHANNEL: "قناة التشغيل غير صحيحة.",
    DISABLE_REASON_REQUIRED: "سبب الإيقاف مطلوب.",
    BRANCH_GROUP_NOT_FOUND: "مجموعة الفروع غير موجودة.",
    BRANCH_GROUP_SCOPE_MISMATCH: "بعض الفروع خارج نطاق المجموعة أو المشغل.",
    GROUP_MERCHANT_TENANT_MISMATCH: "المشغل لا يتبع نفس الشركة.",
    GROUP_CODE_AND_NAME_REQUIRED: "كود واسم المجموعة مطلوبان.",
  };

  for (const [key, translated] of Object.entries(map)) {
    if (value.includes(key)) return translated;
  }
  return value;
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) throw new Error(friendlyBranchControlError(error.message));
  return data as T;
}

export function fetchBusinessStructure(tenantId?: string | null) {
  return rpc<BusinessStructureDashboard>("get_business_structure_v1", {
    p_tenant_id: tenantId ?? null,
  });
}

export function fetchBranchControlDetail(branchId: string) {
  return rpc<BranchControlDetail>("get_branch_control_detail_v1", {
    p_branch_id: branchId,
  });
}

export function setBranchActive(input: {
  branchId: string;
  active: boolean;
  reason?: string | null;
}) {
  return rpc<BranchActiveResult>("set_branch_active_v1", {
    p_branch_id: input.branchId,
    p_active: input.active,
    p_reason: input.reason ?? null,
  });
}

export function setBranchChannel(input: {
  branchId: string;
  channel: BranchChannelKey;
  enabled: boolean;
  reason?: string | null;
  messageAr?: string | null;
}) {
  return rpc<BranchChannelRuntime>("set_branch_channel_v1", {
    p_branch_id: input.branchId,
    p_channel: input.channel,
    p_enabled: input.enabled,
    p_reason: input.reason ?? null,
    p_message_ar: input.messageAr ?? null,
  });
}

export function createBranchGroup(input: {
  tenantId: string;
  code: string;
  name: string;
  groupType: BranchGroupSummary["group_type"];
  merchantId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return rpc<BranchGroupSummary>("create_branch_group_v1", {
    p_tenant_id: input.tenantId,
    p_code: input.code,
    p_name: input.name,
    p_group_type: input.groupType,
    p_merchant_id: input.merchantId ?? null,
    p_metadata: input.metadata ?? {},
  });
}

export function setBranchGroupMembers(groupId: string, branchIds: string[]) {
  return rpc<{ group_id: string; branch_ids: string[] }>("set_branch_group_members_v1", {
    p_group_id: groupId,
    p_branch_ids: branchIds,
  });
}
