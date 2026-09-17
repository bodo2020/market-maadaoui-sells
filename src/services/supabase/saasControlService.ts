import { supabase } from "@/integrations/supabase/client";

export type SubscriptionStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled" | "expired";

export type TenantRuntime = {
  tenant_id: string;
  tenant_name: string;
  subdomain: string;
  tenant_status: "active" | "inactive" | "suspended";
  subscription_status: SubscriptionStatus;
  subscription_effective_status?: SubscriptionStatus | "legacy_unmanaged" | null;
  subscription_managed?: boolean;
  subscription_allowed?: boolean;
  plan_id?: string | null;
  plan_code?: string | null;
  plan_name?: string | null;
  subscription_ends_at?: string | null;
  grace_ends_at?: string | null;
  days_remaining?: number | null;
  app_access_enabled: boolean;
  online_sales_enabled: boolean;
  pos_enabled: boolean;
  admin_enabled: boolean;
  customer_app_enabled: boolean;
  delivery_enabled: boolean;
  block_reason_code?: "manual" | "billing" | "security" | "maintenance" | "policy" | "other" | null;
  block_reason?: string | null;
  block_message_ar?: string | null;
  revision: number;
  updated_at?: string | null;
};

export type SaaSUsageMetric = {
  used: number;
  limit: number | null;
  remaining: number | null;
};

export type SaaSUsage = {
  branches: SaaSUsageMetric;
  users: SaaSUsageMetric;
  products: SaaSUsageMetric;
};

export type SaaSSubscription = {
  managed: boolean;
  allowed: boolean;
  subscription_id?: string | null;
  stored_status: SubscriptionStatus | "legacy_unmanaged";
  effective_status: SubscriptionStatus | "legacy_unmanaged";
  plan_id?: string | null;
  plan_code?: string | null;
  plan_name?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  grace_ends_at?: string | null;
  auto_suspend?: boolean;
  cancel_at_period_end?: boolean;
  days_remaining?: number | null;
};

export type SaaSPlan = {
  id: string;
  code: string;
  name_ar: string;
  name_en?: string | null;
  description_ar?: string | null;
  currency: string;
  monthly_price: number;
  yearly_price: number;
  is_active: boolean;
  is_internal: boolean;
  sort_order?: number;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
};

export type SaaSFeatureCatalogItem = {
  feature_key: string;
  name_ar: string;
  description_ar?: string | null;
  category: string;
};

export type SaaSLimitCatalogItem = {
  limit_key: string;
  name_ar: string;
  unit_label_ar?: string | null;
};

export type SaaSTenantControl = TenantRuntime & {
  contact_email?: string | null;
  contact_phone?: string | null;
  country?: string | null;
  created_at: string;
  usage: SaaSUsage;
  subscription: SaaSSubscription;
};

export type SaaSControlDashboard = {
  summary: {
    tenant_count: number;
    active_tenant_count: number;
    suspended_tenant_count: number;
    online_sales_enabled_count: number;
    past_due_count: number;
    subscription_blocked_count: number;
  };
  plans: SaaSPlan[];
  feature_catalog: SaaSFeatureCatalogItem[];
  limit_catalog: SaaSLimitCatalogItem[];
  tenants: SaaSTenantControl[];
  generated_at: string;
};

export type TenantPlatformControlPatch = {
  tenantId: string;
  appAccessEnabled?: boolean | null;
  onlineSalesEnabled?: boolean | null;
  posEnabled?: boolean | null;
  adminEnabled?: boolean | null;
  customerAppEnabled?: boolean | null;
  deliveryEnabled?: boolean | null;
  blockReasonCode?: "manual" | "billing" | "security" | "maintenance" | "policy" | "other" | null;
  blockReason?: string | null;
  blockMessageAr?: string | null;
};

export type SaaSPlanInput = {
  planId?: string | null;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  descriptionAr?: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
  currency?: string;
  isActive: boolean;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
};

export type AssignTenantSubscriptionInput = {
  tenantId: string;
  planId: string;
  billingCycle: "monthly" | "yearly";
  status: "trial" | "active" | "past_due" | "suspended";
  startsAt?: string | null;
  endsAt?: string | null;
  graceDays?: number;
  autoSuspend?: boolean;
};

type RpcError = { message?: string; details?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function saasControlError(error: RpcError) {
  const message = error?.message || "";
  const details = error?.details || "";
  if (message.includes("SUPER_ADMIN_REQUIRED")) return new Error("هذه الصفحة متاحة لـ Super Admin فقط.");
  if (message.includes("TENANT_ACCESS_REQUIRED")) return new Error("المستخدم غير مربوط بعميل SaaS نشط.");
  if (message.includes("TENANT_NOT_FOUND")) return new Error("عميل SaaS غير موجود.");
  if (message.includes("BLOCK_REASON_REQUIRED")) return new Error("سبب الإيقاف مطلوب عند تعطيل أي خدمة.");
  if (message.includes("INVALID_BLOCK_REASON_CODE")) return new Error("نوع سبب الإيقاف غير صالح.");
  if (message.includes("SAAS_LIMIT_EXCEEDED")) return new Error(`تم الوصول لحد الباقة ولا يمكن تنفيذ العملية.${details ? ` ${details}` : ""}`);
  if (message.includes("SAAS_SUBSCRIPTION_BLOCKED")) return new Error("الاشتراك الحالي لا يسمح بتشغيل الخدمة حتى يتم استرجاعه أو تجديده.");
  if (message.includes("SAAS_FEATURE_NOT_INCLUDED")) return new Error("الميزة غير مشمولة في الباقة الحالية.");
  if (message.includes("PLAN_NOT_FOUND_OR_INACTIVE")) return new Error("الباقة غير موجودة أو غير مفعلة.");
  if (message.includes("INTERNAL_PLAN_IMMUTABLE")) return new Error("الخطة الداخلية للمنصة محمية ولا يمكن تعديلها.");
  if (message.includes("INVALID_PLAN_PRICE")) return new Error("سعر الباقة غير صالح.");
  if (message.includes("INVALID_SUBSCRIPTION_PERIOD")) return new Error("فترة الاشتراك غير صالحة.");
  if (message.includes("SUBSCRIPTION_NOT_FOUND")) return new Error("لا يوجد اشتراك لإجراء هذا التغيير عليه.");
  return new Error(message || "تعذر تنفيذ أمر منصة SaaS.");
}

export async function fetchSaaSControlCenter(): Promise<SaaSControlDashboard> {
  const { data, error } = await rpc("get_saas_control_center_v2");
  if (error) throw saasControlError(error);
  return data as SaaSControlDashboard;
}

export async function fetchMyTenantRuntime(): Promise<TenantRuntime> {
  const { data, error } = await rpc("get_my_tenant_runtime_v1");
  if (error) throw saasControlError(error);
  return data as TenantRuntime;
}

export async function updateTenantPlatformControls(input: TenantPlatformControlPatch): Promise<TenantRuntime> {
  const { data, error } = await rpc("set_tenant_platform_controls_v1", {
    p_tenant_id: input.tenantId,
    p_app_access_enabled: input.appAccessEnabled ?? null,
    p_online_sales_enabled: input.onlineSalesEnabled ?? null,
    p_pos_enabled: input.posEnabled ?? null,
    p_admin_enabled: input.adminEnabled ?? null,
    p_customer_app_enabled: input.customerAppEnabled ?? null,
    p_delivery_enabled: input.deliveryEnabled ?? null,
    p_block_reason_code: input.blockReasonCode ?? null,
    p_block_reason: input.blockReason?.trim() || null,
    p_block_message_ar: input.blockMessageAr?.trim() || null,
  });
  if (error) throw saasControlError(error);
  return data as TenantRuntime;
}

export async function upsertSaaSPlan(input: SaaSPlanInput): Promise<SaaSPlan> {
  const { data, error } = await rpc("upsert_saas_plan_v1", {
    p_plan_id: input.planId ?? null,
    p_code: input.code.trim().toLowerCase(),
    p_name_ar: input.nameAr.trim(),
    p_name_en: input.nameEn?.trim() || null,
    p_description_ar: input.descriptionAr?.trim() || null,
    p_monthly_price: Number(input.monthlyPrice || 0),
    p_yearly_price: Number(input.yearlyPrice || 0),
    p_currency: (input.currency || "EGP").trim().toUpperCase(),
    p_is_active: input.isActive,
    p_features: input.features,
    p_limits: input.limits,
  });
  if (error) throw saasControlError(error);
  return data as SaaSPlan;
}

export async function assignTenantSubscription(input: AssignTenantSubscriptionInput) {
  const { data, error } = await rpc("assign_tenant_subscription_v1", {
    p_tenant_id: input.tenantId,
    p_plan_id: input.planId,
    p_billing_cycle: input.billingCycle,
    p_status: input.status,
    p_starts_at: input.startsAt ?? null,
    p_ends_at: input.endsAt ?? null,
    p_grace_days: Math.max(0, Number(input.graceDays || 0)),
    p_auto_suspend: input.autoSuspend ?? true,
  });
  if (error) throw saasControlError(error);
  return data as { runtime: TenantRuntime; subscription: SaaSSubscription; usage: SaaSUsage };
}

export async function setTenantSubscriptionStatus(
  tenantId: string,
  status: SubscriptionStatus,
  reason?: string | null,
  graceEndsAt?: string | null,
) {
  const { data, error } = await rpc("set_tenant_subscription_status_v1", {
    p_tenant_id: tenantId,
    p_status: status,
    p_reason: reason?.trim() || null,
    p_grace_ends_at: graceEndsAt ?? null,
  });
  if (error) throw saasControlError(error);
  return data as { runtime: TenantRuntime; subscription: SaaSSubscription; usage: SaaSUsage };
}
