import { supabase } from "@/integrations/supabase/client";

export type CustomerPrioritySignal = {
  type: "followup_overdue" | "followup_due" | "abandoned_cart" | "purchase_overdue" | "purchase_due" | "under_watch" | "coupon_ready" | string;
  [key: string]: unknown;
};

export type CustomerOperationsCenter = {
  attribution_window_days: number;
  summary: {
    window_days: number;
    completed_followups: number;
    converted_followups: number;
    conversion_rate: number;
    attributed_orders: number;
    attributed_revenue: number;
    average_revenue_per_conversion: number;
    overdue_followups: number;
    next_7d_followups: number;
  };
  priority_queue: Array<{
    id: string;
    name: string | null;
    phone: string | null;
    membership_number: string | null;
    priority_score: number;
    priority_level: "critical" | "high" | "medium" | "low";
    signal_count: number;
    signals: CustomerPrioritySignal[];
  }>;
  type_performance: Array<{
    type: string;
    completed: number;
    converted: number;
    conversion_rate: number;
    attributed_orders: number;
    attributed_revenue: number;
  }>;
  agent_performance: Array<{
    staff_id: string | null;
    staff_name: string;
    completed: number;
    converted: number;
    conversion_rate: number;
    attributed_orders: number;
    attributed_revenue: number;
  }>;
};

export type CustomerFollowupPerformance = {
  attribution_window_days: number;
  summary: {
    window_days: number;
    completed_followups: number;
    converted_followups: number;
    conversion_rate: number;
    attributed_orders: number;
    attributed_revenue: number;
  };
  followups: Array<{
    interaction_id: string;
    type: string;
    subject: string;
    description: string | null;
    priority: string;
    scheduled_at: string | null;
    completed_at: string;
    staff_id: string | null;
    staff_name: string | null;
    converted: boolean;
    attributed_orders: number;
    attributed_revenue: number;
    first_purchase_at: string | null;
  }>;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function mapError(message?: string) {
  if (message?.includes("CUSTOMER_ACCESS_DENIED")) return new Error("ليس لديك صلاحية عرض مركز تشغيل العملاء.");
  if (message?.includes("CUSTOMER_NOT_FOUND")) return new Error("العميل غير موجود.");
  return new Error(message || "تعذر تحميل تحليلات المتابعة.");
}

export async function fetchCustomerOperationsCenter(branchId?: string | null, days = 30, limit = 50): Promise<CustomerOperationsCenter> {
  const { data, error } = await rpc("get_customer_operations_center", {
    p_branch_id: branchId || null,
    p_days: days,
    p_limit: limit,
  });
  if (error) throw mapError(error.message);
  return data as CustomerOperationsCenter;
}

export async function fetchCustomerFollowupPerformance(customerId: string, branchId?: string | null, days = 180): Promise<CustomerFollowupPerformance> {
  const { data, error } = await rpc("get_customer_followup_performance", {
    p_customer_id: customerId,
    p_branch_id: branchId || null,
    p_days: days,
  });
  if (error) throw mapError(error.message);
  return data as CustomerFollowupPerformance;
}
