import { supabase } from "@/integrations/supabase/client";

export type CustomerBusinessIntelligence = {
  purchase_pattern: {
    purchase_count: number;
    first_purchase_at: string | null;
    last_purchase_at: string | null;
    average_days_between_purchases: number | null;
    predicted_next_purchase_at: string | null;
    prediction_ready: boolean;
    cadence: "weekly" | "biweekly" | "monthly" | "occasional" | "unknown";
  };
  cart_signal: {
    items_count: number;
    estimated_value: number;
    last_updated_at: string | null;
    age_hours: number | null;
    is_abandoned: boolean;
    abandoned_threshold_hours: number;
  };
  rfm: {
    recency_days: number | null;
    frequency: number;
    monetary: number;
    recency_score: number;
    frequency_score: number;
    monetary_score: number;
    total_score: number;
    max_score: number;
    label: "champion" | "loyal" | "promising" | "at_risk" | "hibernating" | "high_value" | "regular" | "new_no_purchase" | string;
    calculation: string;
  };
  top_products: Array<{
    product_id: string | null;
    product_name: string;
    quantity_bought: number;
    amount_spent: number;
    purchase_occurrences: number;
    last_bought_at: string | null;
    category_id: string | null;
    category_name: string | null;
  }>;
  top_categories: Array<{
    category_id: string;
    category_name: string | null;
    quantity_bought: number;
    amount_spent: number;
  }>;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function mapError(message?: string) {
  if (message?.includes("CUSTOMER_ACCESS_DENIED")) return new Error("ليس لديك صلاحية عرض تحليلات هذا العميل.");
  if (message?.includes("CUSTOMER_NOT_FOUND")) return new Error("العميل غير موجود.");
  return new Error(message || "تعذر تحميل ذكاء العميل.");
}

export async function fetchCustomerBusinessIntelligence(customerId: string, branchId?: string | null): Promise<CustomerBusinessIntelligence> {
  const args = { p_customer_id: customerId, p_branch_id: branchId || null };
  const [intelligenceResult, rfmResult] = await Promise.all([
    rpc("get_customer_business_intelligence", args),
    rpc("get_customer_rfm_score", args),
  ]);

  if (intelligenceResult.error) throw mapError(intelligenceResult.error.message);
  if (rfmResult.error) throw mapError(rfmResult.error.message);

  return {
    ...(intelligenceResult.data as Omit<CustomerBusinessIntelligence, "rfm">),
    rfm: rfmResult.data as CustomerBusinessIntelligence["rfm"],
  };
}
