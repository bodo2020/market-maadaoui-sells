import { supabase } from "@/integrations/supabase/client";

export type DeliveryProofLocationStatus =
  | "verified"
  | "low_accuracy"
  | "far_from_dropoff"
  | "missing"
  | string;

export type OrderDeliveryProof = {
  id: string;
  order_id: string;
  assignment_id: string;
  event_id: string;
  order_group_id: string | null;
  route_id: string | null;
  branch_id: string | null;
  driver_name: string | null;
  verification_order_id: string;
  verification_method: "pin" | "group_lead_pin" | string;
  pin_verified: boolean;
  pin_consumed_at: string | null;
  delivered_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  distance_to_dropoff_m: number | null;
  location_status: DeliveryProofLocationStatus;
  payment_method: string | null;
  payment_status: string | null;
  order_total: number | null;
  collected_amount: number;
  payment_reference: string | null;
  proof_source: string;
  note: string | null;
  created_at: string;
};

type RpcResult = Promise<{
  data: unknown;
  error: { message?: string; code?: string } | null;
}>;

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => RpcResult;

export async function getOrderDeliveryProof(orderId: string): Promise<OrderDeliveryProof | null> {
  const { data, error } = await rpc("get_order_delivery_proof_v1", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message || error.code || "DELIVERY_PROOF_FAILED");
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as OrderDeliveryProof;
}
