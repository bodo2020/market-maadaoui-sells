import { supabase } from "@/integrations/supabase/client";

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
    type: "call" | "email" | "meeting" | "note" | string;
    subject: string;
    description: string | null;
    status: string;
    priority: "low" | "medium" | "high" | string;
    scheduled_at: string | null;
    created_by: string | null;
    created_at: string;
  }>;
  audit: Array<{
    id: string;
    action_type: string;
    branch_id: string | null;
    created_by: string | null;
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
