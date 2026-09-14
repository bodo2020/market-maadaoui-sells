import { supabase } from "@/integrations/supabase/client";

export type PosInboxOrder = {
  order_id: string;
  display_id: string;
  created_at: string;
  age_minutes: number;
  order_status: string;
  customer_name: string;
  customer_phone: string | null;
  total: number;
  payment_method: string;
  payment_status: string;
  items_count: number;
  fulfillment_state: string | null;
  items_total: number;
  items_picked: number;
  shortage_count: number;
  substitution_count: number;
  bags_count: number;
  picker_name: string | null;
  predicted_ready_at: string | null;
  ready_at: string | null;
  eta_risk: string;
  driver_name: string | null;
  delivery_state: string | null;
  arrived_branch_at: string | null;
  rider_wait_seconds: number | null;
  needs_attention: boolean;
};

export type PosOrderInbox = {
  branch_id: string;
  generated_at: string;
  summary: {
    new_orders: number;
    in_fulfillment: number;
    ready: number;
    at_risk: number;
  };
  orders: PosInboxOrder[];
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export async function fetchPosOnlineOrderInbox(branchId: string, limit = 30): Promise<PosOrderInbox> {
  const { data, error } = await rpc("get_pos_online_order_inbox_v1", {
    p_branch_id: branchId,
    p_limit: limit,
  });
  if (error) throw new Error(error.message || error.code || "ORDER_INBOX_FAILED");
  return data as PosOrderInbox;
}

export async function acceptPosOnlineOrder(orderId: string) {
  const { data, error } = await rpc("accept_pos_online_order_v1", { p_order_id: orderId });
  if (error) throw new Error(error.message || error.code || "ORDER_ACCEPT_FAILED");
  return data as { ok: boolean; order_id: string; status: string; idempotent?: boolean };
}
