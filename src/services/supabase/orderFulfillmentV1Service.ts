import { supabase } from "@/integrations/supabase/client";

const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;

function unwrap<T>(data: unknown, error: { message?: string } | null): T {
  if (error) throw new Error(error.message || "تعذر تنفيذ العملية");
  return data as T;
}

export const fetchFulfillmentWorkspace = async (branchId: string) => {
  const { data, error } = await rpc("get_my_order_fulfillment_workspace_v1", { p_branch_id: branchId });
  return unwrap<any>(data, error);
};

export const fetchOrderOperationsSnapshot = async (orderId: string) => {
  const { data, error } = await rpc("get_my_order_operations_snapshot_v1", { p_order_id: orderId });
  return unwrap<any>(data, error);
};

export const claimOrderFulfillment = async (orderId: string) => {
  const { data, error } = await rpc("claim_order_fulfillment_v1", { p_order_id: orderId });
  return unwrap<any>(data, error);
};

export const startOrderPicking = async (orderId: string) => {
  const { data, error } = await rpc("start_order_picking_v1", { p_order_id: orderId });
  return unwrap<any>(data, error);
};

export const updateOrderFulfillmentProgress = async (orderId: string, itemsPicked: number, shortageCount = 0, substitutionCount = 0, bagsCount?: number, note?: string) => {
  const { data, error } = await rpc("update_order_fulfillment_progress_v1", { p_order_id: orderId, p_items_picked: itemsPicked, p_shortage_count: shortageCount, p_substitution_count: substitutionCount, p_bags_count: bagsCount ?? null, p_note: note?.trim() || null });
  return unwrap<any>(data, error);
};

export const startOrderPacking = async (orderId: string, bagsCount = 0) => {
  const { data, error } = await rpc("start_order_packing_v1", { p_order_id: orderId, p_bags_count: bagsCount });
  return unwrap<any>(data, error);
};

export const markOrderReady = async (orderId: string, bagsCount: number, note?: string) => {
  const { data, error } = await rpc("mark_order_ready_v1", { p_order_id: orderId, p_bags_count: bagsCount, p_note: note?.trim() || null });
  return unwrap<any>(data, error);
};

export const assignRecommendedDelivery = async (orderId: string, force = false) => {
  const { data, error } = await rpc("assign_recommended_delivery_v1", { p_order_id: orderId, p_force: force });
  return unwrap<any>(data, error);
};
