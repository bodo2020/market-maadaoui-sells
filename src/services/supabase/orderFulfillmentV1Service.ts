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

export const markOrderReady = async (orderId: string, bagsCount = 0, note?: string) => {
  const { data, error } = await rpc("mark_order_ready_v1", { p_order_id: orderId, p_bags_count: bagsCount, p_note: note?.trim() || null });
  return unwrap<any>(data, error);
};

export const assignRecommendedDelivery = async (orderId: string, force = false) => {
  const { data, error } = await rpc("assign_recommended_delivery_v1", { p_order_id: orderId, p_force: force });
  return unwrap<any>(data, error);
};

export const retryRecommendedDelivery = async (orderId: string) => assignRecommendedDelivery(orderId, true);

export type PickerAssignmentPolicy = {
  branch_id: string;
  mode: "shadow" | "assisted";
  offer_ttl_seconds: number;
  can_manage: boolean;
};

export const fetchPickerAssignmentPolicy = async (branchId: string) => {
  const { data, error } = await rpc("get_picker_assignment_policy_v1", { p_branch_id: branchId });
  return unwrap<PickerAssignmentPolicy>(data, error);
};

export const setPickerAssignmentPolicy = async (branchId: string, mode: "shadow" | "assisted", offerTtlSeconds = 90) => {
  const { data, error } = await rpc("set_picker_assignment_policy_v1", {
    p_branch_id: branchId,
    p_mode: mode,
    p_offer_ttl_seconds: offerTtlSeconds,
  });
  return unwrap<{ ok: boolean; branch_id: string; mode: "shadow" | "assisted"; offer_ttl_seconds: number }>(data, error);
};

export type BatchPickingShadowOrder = {
  order_id: string;
  display_id: string;
  customer_name: string;
  items_total: number;
  predicted_ready_at?: string | null;
  eta_risk: "on_track" | "at_risk" | "late";
};

export type BatchPickingShadowRecommendation = {
  id: string;
  batch_code: string;
  order_ids: string[];
  order_count: number;
  total_lines: number;
  score: number;
  reason: "shared_shelf_route" | "shared_categories" | "close_sla_window";
  recommended_user_id?: string | null;
  recommended_user_name?: string | null;
  generated_at: string;
  orders: BatchPickingShadowOrder[];
};

export type BatchPickingShadowPayload = {
  mode: "shadow";
  branch_id: string;
  generated_at: string;
  limits: {
    max_orders: number;
    max_lines: number;
    max_ready_gap_minutes: number;
    minimum_pair_score: number;
  };
  summary: {
    eligible_orders: number;
    recommended_batches: number;
    covered_orders: number;
    single_orders: number;
    coverage_rate?: number | null;
  };
  batches: BatchPickingShadowRecommendation[];
};

export const fetchBatchPickingShadow = async (branchId: string) => {
  const { data, error } = await rpc("get_batch_picking_shadow_v1", { p_branch_id: branchId });
  return unwrap<BatchPickingShadowPayload>(data, error);
};
