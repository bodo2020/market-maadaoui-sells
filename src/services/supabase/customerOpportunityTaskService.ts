import { supabase } from "@/integrations/supabase/client";

export type CustomerConvertibleOpportunityKey = "abandoned_cart" | "purchase_overdue" | "purchase_due" | "under_watch" | "coupon_ready";
export type CustomerOpportunityFollowupType = "call" | "whatsapp" | "email" | "meeting";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function mapError(message?: string) {
  if (message?.includes("CUSTOMER_MANAGE_DENIED")) return new Error("ليس لديك صلاحية إنشاء متابعات للعملاء.");
  if (message?.includes("FOLLOWUP_ASSIGNEE_OUT_OF_SCOPE")) return new Error("الموظف المختار غير مؤهل لإدارة العملاء في هذا الفرع.");
  if (message?.includes("INVALID_OPPORTUNITY_KEY")) return new Error("نوع الفرصة غير قابل للتحويل لمهمة.");
  if (message?.includes("FOLLOWUP_SCHEDULE_REQUIRED")) return new Error("حدد موعد تنفيذ المهمة.");
  if (message?.includes("FOLLOWUP_SCHEDULE_TOO_FAR")) return new Error("موعد المهمة بعيد جدًا. اختر موعدًا خلال 90 يومًا.");
  return new Error(message || "تعذر تحويل الفرصة إلى مهمة.");
}

export async function createFollowupFromOpportunity(params: {
  customerId: string;
  opportunityKey: CustomerConvertibleOpportunityKey;
  type: CustomerOpportunityFollowupType;
  scheduledAt: string;
  priority: "low" | "medium" | "high";
  assignedTo: string;
  note?: string;
  branchId: string;
}): Promise<{ id: string; created: boolean; duplicate: boolean }> {
  const { data, error } = await rpc("create_customer_followup_from_opportunity", {
    p_customer_id: params.customerId,
    p_opportunity_key: params.opportunityKey,
    p_type: params.type,
    p_scheduled_at: params.scheduledAt,
    p_priority: params.priority,
    p_assigned_to: params.assignedTo,
    p_note: params.note?.trim() || null,
    p_branch_id: params.branchId,
  });
  if (error) throw mapError(error.message);
  return data as { id: string; created: boolean; duplicate: boolean };
}
