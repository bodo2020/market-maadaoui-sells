import { supabase } from "@/integrations/supabase/client";

export type CustomerOpportunityBoard = {
  summary: {
    abandoned_carts: number;
    coupon_ready: number;
    due_or_overdue: number;
    under_watch: number;
  };
  abandoned_carts: Array<{
    id: string;
    name: string | null;
    phone: string | null;
    membership_number: string | null;
    item_count: number;
    cart_updated_at: string;
    age_hours: number;
  }>;
  coupon_ready: Array<{
    id: string;
    name: string | null;
    phone: string | null;
    membership_number: string | null;
    coupon_count: number;
    coupon_value: number;
    latest_coupon_at: string | null;
  }>;
  purchase_due: Array<{
    id: string;
    name: string | null;
    phone: string | null;
    membership_number: string | null;
    purchase_count: number;
    average_days: number;
    last_purchase_at: string;
    predicted_at: string;
    opportunity_type: "due_soon" | "overdue";
    overdue_days: number;
  }>;
  under_watch: Array<{
    id: string;
    name: string | null;
    phone: string | null;
    membership_number: string | null;
    management_status: string;
    last_admin_action_at: string | null;
  }>;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export async function fetchCustomerOpportunityBoard(branchId?: string | null, limit = 20): Promise<CustomerOpportunityBoard> {
  const { data, error } = await rpc("get_customer_opportunity_board", {
    p_branch_id: branchId || null,
    p_limit: limit,
  });
  if (error) {
    if (error.message?.includes("CUSTOMER_ACCESS_DENIED")) throw new Error("ليس لديك صلاحية عرض فرص العملاء.");
    throw new Error(error.message || "تعذر تحميل فرص العملاء.");
  }
  return data as CustomerOpportunityBoard;
}
