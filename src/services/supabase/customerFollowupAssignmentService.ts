import { supabase } from "@/integrations/supabase/client";

export type CustomerFollowupAssignee = {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  pending_count: number;
  overdue_count: number;
  next_due_at: string | null;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function mapError(message?: string) {
  if (message?.includes("CUSTOMER_MANAGE_DENIED")) return new Error("ليس لديك صلاحية توزيع متابعات العملاء.");
  if (message?.includes("FOLLOWUP_NOT_FOUND")) return new Error("المتابعة غير موجودة.");
  if (message?.includes("FOLLOWUP_ALREADY_CLOSED")) return new Error("المتابعة مقفولة بالفعل.");
  if (message?.includes("FOLLOWUP_ASSIGNEE_OUT_OF_SCOPE")) return new Error("الموظف المختار غير مسموح له بإدارة العملاء في هذا الفرع.");
  if (message?.includes("FOLLOWUP_BRANCH_SCOPE_DENIED")) return new Error("المتابعة تخص فرعًا آخر.");
  return new Error(message || "تعذر توزيع متابعة العميل.");
}

export async function fetchCustomerFollowupAssignees(branchId?: string | null): Promise<CustomerFollowupAssignee[]> {
  const { data, error } = await rpc("get_customer_followup_assignees", {
    p_branch_id: branchId || null,
  });
  if (error) throw mapError(error.message);
  return (data || []) as CustomerFollowupAssignee[];
}

export async function reassignCustomerFollowup(interactionId: string, assignedTo: string, branchId?: string | null) {
  const { data, error } = await rpc("reassign_customer_followup", {
    p_interaction_id: interactionId,
    p_assigned_to: assignedTo,
    p_branch_id: branchId || null,
  });
  if (error) throw mapError(error.message);
  return data;
}
