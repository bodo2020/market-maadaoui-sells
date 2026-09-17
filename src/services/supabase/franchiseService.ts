import { supabase } from "@/integrations/supabase/client";
import type { BranchChannelKey, BranchChannelRuntime } from "@/services/supabase/branchControlService";

export type FranchiseAgreementStatus =
  | "draft"
  | "review"
  | "approved"
  | "active"
  | "suspended"
  | "expired"
  | "terminated";

export type FranchiseAgreementAction =
  | "submit_review"
  | "return_to_draft"
  | "approve"
  | "activate"
  | "suspend"
  | "resume"
  | "terminate"
  | "expire";

export interface FranchiseProfile {
  merchant_id: string;
  tenant_id: string;
  legal_entity_name: string;
  commercial_registration?: string | null;
  tax_registration?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  territory_name?: string | null;
  territory_scope?: unknown;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FranchiseAgreement {
  id: string;
  tenant_id: string;
  merchant_id: string;
  agreement_code: string;
  version: number;
  is_current: boolean;
  status: FranchiseAgreementStatus;
  starts_on: string;
  ends_on?: string | null;
  royalty_rate: number;
  marketing_fee_rate: number;
  platform_fee_rate: number;
  monthly_fixed_fee: number;
  security_deposit: number;
  currency: string;
  settlement_cycle: "weekly" | "biweekly" | "monthly";
  pricing_policy: "central" | "bounded" | "independent";
  catalog_policy: "central" | "curated" | "independent";
  supplier_policy: "approved_only" | "approved_plus_local" | "independent";
  promotion_policy: "central" | "approval_required" | "independent";
  max_branches?: number | null;
  can_manage_inventory: boolean;
  can_view_analytics: boolean;
  max_discount_percentage: number;
  requires_order_approval: boolean;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  reviewed_at?: string | null;
  approved_at?: string | null;
  activated_at?: string | null;
  suspended_at?: string | null;
  terminated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FranchiseEvent {
  id: string;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  reason?: string | null;
  actor_user_id?: string | null;
  created_at: string;
}

export interface FranchiseBranch {
  id: string;
  name: string;
  code: string;
  active: boolean;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  franchise_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  legacy_settings?: Record<string, unknown> | null;
  channels: Record<BranchChannelKey, BranchChannelRuntime>;
}

export interface FranchiseDetail {
  merchant: {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
    status: string;
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
    customer_published_at?: string | null;
  };
  profile: FranchiseProfile;
  current_agreement: FranchiseAgreement;
  agreement_history: FranchiseAgreement[];
  events: FranchiseEvent[];
  branches: FranchiseBranch[];
}

export interface FranchiseNetworkOperator {
  merchant_id: string;
  operator_name: string;
  operator_code: string;
  merchant_status: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  profile?: FranchiseProfile | null;
  agreement?: FranchiseAgreement | null;
  branch_count: number;
  active_branch_count: number;
  branches: FranchiseBranch[];
}

export interface FranchiseNetwork {
  tenant_id: string;
  operators: FranchiseNetworkOperator[];
}

export interface CreateFranchiseInput {
  tenantId: string;
  profile: {
    operator_name: string;
    operator_code?: string;
    legal_entity_name: string;
    commercial_registration?: string;
    tax_registration?: string;
    contact_name?: string;
    phone?: string;
    email?: string;
    territory_name?: string;
    territory_scope?: unknown;
    notes?: string;
  };
  agreement: {
    agreement_code?: string;
    starts_on?: string;
    ends_on?: string;
    royalty_rate?: number;
    marketing_fee_rate?: number;
    platform_fee_rate?: number;
    monthly_fixed_fee?: number;
    security_deposit?: number;
    currency?: string;
    settlement_cycle?: FranchiseAgreement["settlement_cycle"];
    pricing_policy?: FranchiseAgreement["pricing_policy"];
    catalog_policy?: FranchiseAgreement["catalog_policy"];
    supplier_policy?: FranchiseAgreement["supplier_policy"];
    promotion_policy?: FranchiseAgreement["promotion_policy"];
    max_branches?: number | null;
    can_manage_inventory?: boolean;
    can_view_analytics?: boolean;
    max_discount_percentage?: number;
    requires_order_approval?: boolean;
    notes?: string;
  };
  branch: {
    name: string;
    code?: string;
    address?: string;
    phone?: string;
    email?: string;
    latitude?: number | null;
    longitude?: number | null;
    delivery_fee?: number;
    min_order_amount?: number;
    estimated_delivery_minutes?: number | null;
  };
  ownerUserId?: string | null;
}

const errorMap: Record<string, string> = {
  BUSINESS_STRUCTURE_MANAGER_REQUIRED: "تحتاج صلاحية إدارة هيكل الفروع والـFranchise.",
  TENANT_NOT_ACTIVE: "الشركة غير نشطة حاليًا.",
  FRANCHISE_OPERATOR_NAME_REQUIRED: "اسم مشغل الـFranchise مطلوب.",
  FRANCHISE_LEGAL_ENTITY_REQUIRED: "الاسم القانوني للكيان مطلوب.",
  FRANCHISE_BRANCH_NAME_REQUIRED: "اسم أول فرع مطلوب.",
  FRANCHISE_AGREEMENT_INVALID_DATES: "تاريخ نهاية العقد لا يمكن أن يسبق تاريخ البداية.",
  FRANCHISE_RATE_OUT_OF_RANGE: "النسب يجب أن تكون بين 0% و100%.",
  FRANCHISE_NEGATIVE_FEE_NOT_ALLOWED: "الرسوم والقيم المالية لا يمكن أن تكون سالبة.",
  FRANCHISE_POLICY_INVALID: "إحدى سياسات عقد الـFranchise غير صحيحة.",
  FRANCHISE_NOT_FOUND: "مشغل الـFranchise غير موجود.",
  MERCHANT_NOT_FRANCHISE: "المشغل المحدد ليس Franchise.",
  FRANCHISE_CURRENT_AGREEMENT_REQUIRED: "لا يوجد عقد Franchise حالي لهذا المشغل.",
  FRANCHISE_AGREEMENT_NOT_OPEN: "العقد منتهي أو ملغي ولا يمكن إضافة فروع جديدة عليه.",
  FRANCHISE_MAX_BRANCHES_REACHED: "وصل المشغل للحد الأقصى المسموح به من الفروع في العقد.",
  FRANCHISE_ACTIVE_AGREEMENT_REQUIRES_REVISION: "العقد النشط لا يُعدل مباشرة؛ يحتاج إصدار/ملحق جديد.",
  FRANCHISE_INVALID_TRANSITION: "هذا الانتقال غير مسموح من حالة العقد الحالية.",
  FRANCHISE_TRANSITION_REASON_REQUIRED: "سبب الإيقاف أو الإنهاء مطلوب.",
  FRANCHISE_AGREEMENT_OUTSIDE_ACTIVE_DATES: "العقد خارج فترة السريان ولا يمكن تفعيله الآن.",
  FRANCHISE_PROFILE_INCOMPLETE: "بيانات الملف القانوني غير مكتملة.",
  FRANCHISE_AGREEMENT_NOT_EXPIRED: "العقد لم يصل لتاريخ الانتهاء بعد.",
  OWNER_AUTH_USER_NOT_FOUND: "حساب مالك الـFranchise غير موجود.",
};

function friendlyError(message?: string) {
  const raw = message || "تعذر تنفيذ عملية الـFranchise";
  for (const [key, value] of Object.entries(errorMap)) {
    if (raw.includes(key)) return value;
  }
  if (raw.includes("duplicate key") && raw.includes("merchants_tenant_id_code_key")) return "كود مشغل الـFranchise مستخدم بالفعل.";
  if (raw.includes("duplicate key") && raw.includes("branches_code_key")) return "كود الفرع مستخدم بالفعل.";
  if (raw.includes("duplicate key") && raw.includes("branches_name_key")) return "اسم الفرع مستخدم بالفعل.";
  if (raw.includes("duplicate key") && raw.includes("franchise_agreements_tenant_code_key")) return "كود العقد مستخدم بالفعل.";
  return raw;
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) throw new Error(friendlyError(error.message));
  return data as T;
}

export function fetchFranchiseNetwork(tenantId: string) {
  return rpc<FranchiseNetwork>("get_franchise_network_v1", { p_tenant_id: tenantId });
}

export function fetchFranchiseDetail(merchantId: string) {
  return rpc<FranchiseDetail>("get_franchise_detail_v1", { p_merchant_id: merchantId });
}

export function createFranchiseOperator(input: CreateFranchiseInput) {
  return rpc<{
    merchant_id: string;
    agreement_id: string;
    branch_id: string;
    merchant_status: string;
    agreement_status: string;
    branch_active: boolean;
    channels_enabled: boolean;
  }>("create_franchise_operator_v1", {
    p_tenant_id: input.tenantId,
    p_profile: input.profile,
    p_agreement: input.agreement,
    p_branch: input.branch,
    p_owner_user_id: input.ownerUserId ?? null,
  });
}

export function createFranchiseBranch(merchantId: string, branch: CreateFranchiseInput["branch"]) {
  return rpc<{ merchant_id: string; branch_id: string; branch_active: boolean; channels_enabled: boolean }>(
    "create_franchise_branch_v1",
    { p_merchant_id: merchantId, p_branch: branch },
  );
}

export function updateFranchiseProfile(merchantId: string, profile: Record<string, unknown>) {
  return rpc<FranchiseDetail>("update_franchise_profile_v1", {
    p_merchant_id: merchantId,
    p_profile: profile,
  });
}

export function updateFranchiseAgreement(merchantId: string, agreement: Record<string, unknown>) {
  return rpc<FranchiseDetail>("update_franchise_agreement_v1", {
    p_merchant_id: merchantId,
    p_agreement: agreement,
  });
}

export function transitionFranchiseAgreement(merchantId: string, action: FranchiseAgreementAction, reason?: string | null) {
  return rpc<FranchiseDetail>("transition_franchise_agreement_v1", {
    p_merchant_id: merchantId,
    p_action: action,
    p_reason: reason ?? null,
  });
}
