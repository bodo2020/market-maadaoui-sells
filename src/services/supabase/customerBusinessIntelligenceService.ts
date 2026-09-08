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

export async function fetchCustomerBusinessIntelligence(customerId: string, branchId?: string | null): Promise<CustomerBusinessIntelligence> {
  const { data, error } = await rpc("get_customer_business_intelligence", {
    p_customer_id: customerId,
    p_branch_id: branchId || null,
  });
  if (error) {
    if (error.message?.includes("CUSTOMER_ACCESS_DENIED")) throw new Error("ليس لديك صلاحية عرض تحليلات هذا العميل.");
    if (error.message?.includes("CUSTOMER_NOT_FOUND")) throw new Error("العميل غير موجود.");
    throw new Error(error.message || "تعذر تحميل ذكاء العميل.");
  }
  return data as CustomerBusinessIntelligence;
}
