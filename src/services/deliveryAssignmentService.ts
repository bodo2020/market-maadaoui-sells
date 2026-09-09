import { supabase } from "@/integrations/supabase/client";

export type DeliveryCandidate = {
  id: string;
  name: string;
  role: string;
};

export type DeliveryAssignmentWorkspace = {
  order_id: string;
  branch_id: string;
  order_status: string;
  tracking_number: string | null;
  legacy_delivery_person: string | null;
  current: null | {
    assignment_id: string;
    delivery_user_id: string;
    name: string;
    assigned_at: string;
    tracking_number: string | null;
  };
  candidates: DeliveryCandidate[];
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function deliveryAssignmentError(message?: string) {
  const text = message || "";
  if (text.includes("permission_denied")) return new Error("ليس لديك صلاحية إدارة مندوبي التوصيل لهذا الفرع.");
  if (text.includes("order_branch_required")) return new Error("يجب ربط الطلب بفرع قبل تعيين مندوب توصيل.");
  if (text.includes("terminal_order_assignment_denied")) return new Error("لا يمكن تغيير مندوب طلب تم توصيله أو إلغاؤه.");
  if (text.includes("delivery_user_out_of_branch")) return new Error("مندوب التوصيل غير مسند لهذا الفرع.");
  if (text.includes("delivery_user_not_eligible")) return new Error("الحساب المختار ليس حساب مندوب توصيل.");
  if (text.includes("delivery_user_not_found")) return new Error("مندوب التوصيل غير موجود أو غير نشط.");
  if (text.includes("order_not_found")) return new Error("الطلب غير موجود.");
  return new Error(text || "تعذر تحديث مندوب التوصيل.");
}

export async function getDeliveryAssignmentWorkspace(orderId: string): Promise<DeliveryAssignmentWorkspace> {
  const { data, error } = await rpc("get_delivery_assignment_workspace_v1", { p_order_id: orderId });
  if (error) throw deliveryAssignmentError(error.message);
  return data as DeliveryAssignmentWorkspace;
}

export async function setDeliveryOrderAssignment(params: {
  orderId: string;
  deliveryUserId: string | null;
  trackingNumber?: string | null;
  reason?: string | null;
}) {
  const { data, error } = await rpc("set_delivery_order_assignment_v1", {
    p_order_id: params.orderId,
    p_delivery_user_id: params.deliveryUserId,
    p_tracking_number: params.trackingNumber || null,
    p_reason: params.reason || null,
  });
  if (error) throw deliveryAssignmentError(error.message);
  return data as {
    order_id: string;
    assignment_id?: string;
    delivery_user_id: string | null;
    delivery_name?: string;
    tracking_number?: string | null;
    idempotent: boolean;
    unassigned?: boolean;
  };
}
