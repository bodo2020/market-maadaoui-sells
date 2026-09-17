import { supabase } from "@/integrations/supabase/client";

export type TenantRuntime = {
  tenant_id: string;
  tenant_name: string;
  subdomain: string;
  tenant_status: "active" | "inactive" | "suspended";
  subscription_status: "trial" | "active" | "cancelled" | "expired";
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

export type SaaSTenantControl = TenantRuntime & {
  contact_email?: string | null;
  contact_phone?: string | null;
  country?: string | null;
  created_at: string;
  branch_count: number;
  user_count: number;
  latest_subscription?: {
    id: string;
    plan_name: string;
    plan_price: number;
    billing_cycle: string;
    status: string;
    starts_at: string;
    ends_at?: string | null;
    next_payment_at?: string | null;
  } | null;
};

export type SaaSControlDashboard = {
  summary: {
    tenant_count: number;
    active_tenant_count: number;
    suspended_tenant_count: number;
    online_sales_enabled_count: number;
  };
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

type RpcError = { message?: string; details?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function saasControlError(error: RpcError) {
  const message = error?.message || "";
  if (message.includes("SUPER_ADMIN_REQUIRED")) return new Error("هذه الصفحة متاحة لـ Super Admin فقط.");
  if (message.includes("TENANT_ACCESS_REQUIRED")) return new Error("المستخدم غير مربوط بعميل SaaS نشط.");
  if (message.includes("TENANT_NOT_FOUND")) return new Error("عميل SaaS غير موجود.");
  if (message.includes("BLOCK_REASON_REQUIRED")) return new Error("سبب الإيقاف مطلوب عند تعطيل أي خدمة.");
  if (message.includes("INVALID_BLOCK_REASON_CODE")) return new Error("نوع سبب الإيقاف غير صالح.");
  return new Error(message || "تعذر تنفيذ أمر منصة SaaS.");
}

export async function fetchSaaSControlCenter(): Promise<SaaSControlDashboard> {
  const { data, error } = await rpc("get_saas_control_center_v1");
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
