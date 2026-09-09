import { supabase } from "@/integrations/supabase/client";

export interface OnlineOrderSlaPolicy {
  branch_id: string;
  enabled: boolean;
  first_response_target_minutes: number;
  preparation_target_minutes: number;
  updated_at: string | null;
  updated_by: string | null;
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function mapError(error: { message?: string } | null) {
  const text = error?.message || "";
  if (text.includes("permission_denied")) return new Error("ليس لديك صلاحية إدارة SLA الطلبات لهذا الفرع.");
  if (text.includes("invalid_first_response_target") || text.includes("invalid_preparation_target")) return new Error("قيمة SLA يجب أن تكون بين 1 و1440 دقيقة.");
  return new Error(text || "تعذر حفظ إعدادات SLA الطلبات.");
}

export async function getOnlineOrderSlaPolicy(branchId: string): Promise<OnlineOrderSlaPolicy> {
  const { data, error } = await rpc("get_online_order_sla_policy_v1", { p_branch_id: branchId });
  if (error) throw mapError(error);
  return data as OnlineOrderSlaPolicy;
}

export async function setOnlineOrderSlaPolicy(params: {
  branchId: string;
  enabled: boolean;
  firstResponseTargetMinutes: number;
  preparationTargetMinutes: number;
}): Promise<OnlineOrderSlaPolicy> {
  const { data, error } = await rpc("set_online_order_sla_policy_v1", {
    p_branch_id: params.branchId,
    p_enabled: params.enabled,
    p_first_response_target_minutes: params.firstResponseTargetMinutes,
    p_preparation_target_minutes: params.preparationTargetMinutes,
  });
  if (error) throw mapError(error);
  return data as OnlineOrderSlaPolicy;
}
