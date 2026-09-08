import { supabase } from "@/integrations/supabase/client";

export type CustomerFollowupType = "call" | "email" | "meeting" | "whatsapp";
export type CustomerFollowupOutcomeCode = "reached" | "no_answer" | "interested" | "not_interested" | "issue_resolved" | "callback_requested" | "wrong_number";

export type CustomerPendingFollowup = {
  id: string;
  type: CustomerFollowupType;
  subject: string;
  description: string | null;
  priority: "low" | "medium" | "high" | string;
  scheduled_at: string;
  created_at: string;
  branch_id: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  overdue: boolean;
  overdue_hours: number;
};

export type CustomerManagementWorkspace = {
  management_status: "active" | "watch" | "blocked";
  permissions: {
    can_view: boolean;
    can_manage: boolean;
    can_adjust_points: boolean;
  };
  tags: Array<{
    id: string;
    name: string;
    color: string | null;
    assigned_at: string;
  }>;
  interactions: Array<{
    id: string;
    type: "call" | "email" | "meeting" | "note" | "whatsapp" | string;
    subject: string;
    description: string | null;
    status: string;
    priority: "low" | "medium" | "high" | string;
    scheduled_at: string | null;
    created_by: string | null;
    created_at: string;
    branch_id?: string | null;
    assigned_to?: string | null;
    assigned_to_name?: string | null;
    completed_at?: string | null;
    completed_by?: string | null;
    outcome_code?: CustomerFollowupOutcomeCode | null;
    outcome_note?: string | null;
  }>;
  pending_followups: CustomerPendingFollowup[];
  audit: Array<{
    id: string;
    action_type: string;
    branch_id: string | null;
    created_by: string | null;
    created_by_name?: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function rpcError(message?: string) {
  if (message?.includes("CUSTOMER_MANAGE_DENIED")) return new Error("ليس لديك صلاحية تعديل بيانات العميل.");
  if (message?.includes("CUSTOMER_LOYALTY_ADJUST_DENIED")) return new Error("ليس لديك صلاحية تعديل نقاط العميل.");
  if (message?.includes("CUSTOMER_ACCESS_DENIED")) return new Error("ليس لديك صلاحية عرض إدارة العميل.");
  if (message?.includes("INSUFFICIENT_POINTS")) return new Error("لا يمكن خصم نقاط أكثر من رصيد العميل الحالي.");
  if (message?.includes("ADJUSTMENT_REASON_REQUIRED") || message?.includes("STATUS_REASON_REQUIRED")) return new Error("اكتب سببًا واضحًا لتنفيذ العملية.");
  if (message?.includes("INVALID_TAG_NAME")) return new Error("اسم التصنيف يجب أن يكون من 2 إلى 40 حرفًا.");
  if (message?.includes("FOLLOWUP_SCHEDULE_REQUIRED")) return new Error("حدد موعد المتابعة.");
  if (message?.includes("INVALID_FOLLOWUP_SUBJECT")) return new Error("اكتب عنوانًا واضحًا للمتابعة.");
  if (message?.includes("FOLLOWUP_OUTCOME_REQUIRED")) return new Error("اكتب نتيجة المتابعة قبل إغلاقها.");
  if (message?.includes("INVALID_FOLLOWUP_OUTCOME_CODE")) return new Error("اختر نتيجة متابعة صحيحة.");
  if (message?.includes("FOLLOWUP_OUTCOME_NOTE_TOO_LONG")) return new Error("ملاحظة النتيجة طويلة جدًا.");
  if (message?.includes("FOLLOWUP_CANCEL_REASON_REQUIRED")) return new Error("اكتب سبب إلغاء المتابعة.");
  if (message?.includes("FOLLOWUP_ALREADY_CLOSED")) return new Error("المتابعة مقفولة بالفعل.");
  if (message?.includes("CALLBACK_SCHEDULE_REQUIRED")) return new Error("حدد موعد إعادة التواصل مع العميل.");
  if (message?.includes("CALLBACK_SCHEDULE_MUST_BE_FUTURE")) return new Error("موعد إعادة التواصل لازم يكون في المستقبل.");
  if (message?.includes("CALLBACK_SCHEDULE_TOO_FAR")) return new Error("موعد إعادة التواصل لازم يكون خلال 90 يومًا.");
  if (message?.includes("CALLBACK_ASSIGNEE_OUT_OF_SCOPE")) return new Error("مسؤول المتابعة الحالية لم يعد مؤهلًا لإدارة العملاء في هذا الفرع. أعد إسناد المهمة أولًا.");
  return new Error(message || "تعذر تنفيذ العملية.");
}

export async function fetchCustomerManagementWorkspace(customerId: string, branchId?: string | null): Promise<CustomerManagementWorkspace> {
  const { data, error } = await rpc("get_customer_management_workspace", {
    p_customer_id: customerId,
    p_branch_id: branchId || null,
  });
  if (error) throw rpcError(error.message);
  return data as CustomerManagementWorkspace;
}

export async function setCustomerManagementTag(customerId: string, tagName: string, assigned: boolean, branchId?: string | null): Promise<CustomerManagementWorkspace> {
  const { data, error } = await rpc("set_customer_management_tag", {
    p_customer_id: customerId,
    p_tag_name: tagName,
    p_assigned: assigned,
    p_branch_id: branchId || null,
  });
  if (error) throw rpcError(error.message);
  return data as CustomerManagementWorkspace;
}

export async function addCustomerManagementNote(
  customerId: string,
  subject: string,
  description: string,
  priority: "low" | "medium" | "high",
  branchId?: string | null,
): Promise<CustomerManagementWorkspace> {
  const { data, error } = await rpc("add_customer_management_note", {
    p_customer_id: customerId,
    p_subject: subject,
    p_description: description,
    p_priority: priority,
    p_branch_id: branchId || null,
  });
  if (error) throw rpcError(error.message);
  return data as CustomerManagementWorkspace;
}

export async function setCustomerManagementStatus(
  customerId: string,
  status: "active" | "watch" | "blocked",
  reason: string,
  branchId?: string | null,
): Promise<CustomerManagementWorkspace> {
  const { data, error } = await rpc("set_customer_management_status", {
    p_customer_id: customerId,
    p_status: status,
    p_reason: reason,
    p_branch_id: branchId || null,
  });
  if (error) throw rpcError(error.message);
  return data as CustomerManagementWorkspace;
}

export async function adjustCustomerLoyaltyPoints(
  customerId: string,
  pointsDelta: number,
  reason: string,
  branchId?: string | null,
): Promise<{ before: number; after: number; delta: number; workspace: CustomerManagementWorkspace }> {
  const { data, error } = await rpc("adjust_customer_loyalty_points", {
    p_customer_id: customerId,
    p_points_delta: pointsDelta,
    p_reason: reason,
    p_branch_id: branchId || null,
  });
  if (error) throw rpcError(error.message);
  return data as { before: number; after: number; delta: number; workspace: CustomerManagementWorkspace };
}

export async function createCustomerFollowup(params: {
  customerId: string;
  type: CustomerFollowupType;
  subject: string;
  description?: string;
  scheduledAt: string;
  priority?: "low" | "medium" | "high";
  assignedTo?: string | null;
  branchId?: string | null;
}): Promise<{ id: string; workspace: CustomerManagementWorkspace }> {
  const { data, error } = await rpc("create_customer_followup", {
    p_customer_id: params.customerId,
    p_type: params.type,
    p_subject: params.subject,
    p_description: params.description?.trim() || null,
    p_scheduled_at: params.scheduledAt,
    p_priority: params.priority || "medium",
    p_assigned_to: params.assignedTo || null,
    p_branch_id: params.branchId || null,
  });
  if (error) throw rpcError(error.message);
  return data as { id: string; workspace: CustomerManagementWorkspace };
}

export async function completeCustomerFollowup(interactionId: string, outcome: string, branchId?: string | null): Promise<CustomerManagementWorkspace> {
  const { data, error } = await rpc("complete_customer_followup", {
    p_interaction_id: interactionId,
    p_outcome: outcome,
    p_branch_id: branchId || null,
  });
  if (error) throw rpcError(error.message);
  return data as CustomerManagementWorkspace;
}

export async function completeCustomerFollowupV2(
  interactionId: string,
  outcomeCode: CustomerFollowupOutcomeCode,
  outcomeNote?: string,
  branchId?: string | null,
): Promise<CustomerManagementWorkspace> {
  const { data, error } = await rpc("complete_customer_followup_v2", {
    p_interaction_id: interactionId,
    p_outcome_code: outcomeCode,
    p_outcome_note: outcomeNote?.trim() || null,
    p_branch_id: branchId || null,
  });
  if (error) throw rpcError(error.message);
  return data as CustomerManagementWorkspace;
}

export async function completeCustomerFollowupV3(
  interactionId: string,
  outcomeCode: CustomerFollowupOutcomeCode,
  outcomeNote?: string,
  callbackAt?: string | null,
  branchId?: string | null,
): Promise<{
  workspace: CustomerManagementWorkspace;
  completed_interaction_id: string;
  callback_created: boolean;
  callback_interaction_id: string | null;
}> {
  const { data, error } = await rpc("complete_customer_followup_v3", {
    p_interaction_id: interactionId,
    p_outcome_code: outcomeCode,
    p_outcome_note: outcomeNote?.trim() || null,
    p_callback_at: callbackAt || null,
    p_branch_id: branchId || null,
  });
  if (error) throw rpcError(error.message);
  return data as {
    workspace: CustomerManagementWorkspace;
    completed_interaction_id: string;
    callback_created: boolean;
    callback_interaction_id: string | null;
  };
}

export async function cancelCustomerFollowup(interactionId: string, reason: string, branchId?: string | null): Promise<CustomerManagementWorkspace> {
  const { data, error } = await rpc("cancel_customer_followup", {
    p_interaction_id: interactionId,
    p_reason: reason,
    p_branch_id: branchId || null,
  });
  if (error) throw rpcError(error.message);
  return data as CustomerManagementWorkspace;
}
