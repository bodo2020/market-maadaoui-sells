import { supabase } from "@/integrations/supabase/client";

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

export type OnlineOrderReceiptLine = {
  kind: "requested" | "pending" | "picked" | "substitution" | "shortage";
  line_no: number;
  product_id?: string | null;
  variant_id?: string | null;
  barcode?: string | null;
  product_name: string;
  image_url?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  removed_amount?: number;
  unit_of_measure?: string | null;
  is_weight_based?: boolean;
  is_bulk?: boolean;
  status: string;
  substituted_from?: string;
  original_unit_price?: number;
  price_delta_total?: number;
  financial_state?: string;
};

export type OnlineOrderReceiptAdjustment = {
  kind: "substitution" | "shortage";
  id: string;
  source_id: string;
  signed_amount: number;
  amount: number;
  settlement_state: string;
  payment_method?: string | null;
  provider_reference?: string | null;
  note?: string | null;
  created_at: string;
  settled_at?: string | null;
};

export type OnlineOrderFinalReceipt = {
  version: number;
  order_id: string;
  tracking_number?: string | null;
  branch_id: string;
  branch_name?: string | null;
  order_status: string;
  created_at: string;
  updated_at: string;
  customer_snapshot?: Record<string, unknown> | null;
  shipping_snapshot?: Record<string, unknown> | null;
  shipping_address?: string | null;
  notes?: string | null;
  payment_method?: string | null;
  payment_status: string;
  shipping_cost: number;
  loyalty_voucher_amount: number;
  original_items_total: number;
  original_commercial_total: number;
  current_total: number;
  pending_financial_delta: number;
  projected_total: number;
  has_pending_finance: boolean;
  fulfillment_state?: string | null;
  unresolved_quantity_total: number;
  is_final_fulfillment: boolean;
  items: OnlineOrderReceiptLine[];
  financial_adjustments: OnlineOrderReceiptAdjustment[];
  generated_at: string;
};

export async function fetchOnlineOrderFinalReceipt(orderId: string): Promise<OnlineOrderFinalReceipt> {
  const { data, error } = await rpc("get_online_order_final_receipt_v1", { p_order_id: orderId });
  if (error) {
    const message = error.message || "";
    if (message.includes("ONLINE_ORDER_RECEIPT_ACCESS_DENIED") || message.includes("BRANCH_ACCESS_DENIED")) {
      throw new Error("ليس لديك صلاحية عرض إيصال هذا الطلب.");
    }
    if (message.includes("ORDER_NOT_FOUND")) throw new Error("لم يتم العثور على الطلب.");
    throw new Error(error.message || "تعذر تحميل إيصال الطلب.");
  }
  return data as OnlineOrderFinalReceipt;
}
