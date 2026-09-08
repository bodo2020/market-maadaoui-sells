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

export type CustomerCouponConversionDashboard = {
  summary: {
    window_days: number;
    coupon_orders: number;
    used_vouchers: number;
    discount_used: number;
    gross_sales_with_coupon: number;
    net_sales_after_coupon: number;
    cohort_created: number;
    cohort_used: number;
    cohort_redemption_rate: number;
    active_vouchers: number;
    active_value: number;
  };
  recent_conversions: Array<{
    source: "store" | "online" | string;
    purchase_id: string;
    purchased_at: string;
    gross_amount: number;
    discount_amount: number;
    net_amount: number;
    customer_id: string | null;
    name: string | null;
    phone: string | null;
    membership_number: string | null;
    voucher_code: string | null;
  }>;
  top_customers: Array<{
    customer_id: string;
    name: string | null;
    phone: string | null;
    membership_number: string | null;
    coupon_orders: number;
    discount_used: number;
    net_sales: number;
  }>;
};

export type CustomerFollowupOutcomeDashboard = {
  attribution_window_days: number;
  summary: {
    window_days: number;
    total_completed: number;
    structured_outcomes: number;
    no_answer: number;
    interested: number;
    not_interested: number;
    callback_requested: number;
    issue_resolved: number;
    reached: number;
    wrong_number: number;
  };
  outcomes: Array<{
    outcome_code: string;
    completed: number;
    converted: number;
    conversion_rate: number;
    attributed_orders: number;
    attributed_revenue: number;
    recommended_action: string;
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

export async function fetchCustomerCouponConversionDashboard(branchId?: string | null, days = 30, limit = 30): Promise<CustomerCouponConversionDashboard> {
  const { data, error } = await rpc("get_customer_coupon_conversion_dashboard", {
    p_branch_id: branchId || null,
    p_days: days,
    p_limit: limit,
  });
  if (error) throw mapError(error.message);
  return data as CustomerCouponConversionDashboard;
}

export async function fetchCustomerFollowupOutcomeDashboard(branchId?: string | null, days = 30): Promise<CustomerFollowupOutcomeDashboard> {
  const { data, error } = await rpc("get_customer_followup_outcome_dashboard", {
    p_branch_id: branchId || null,
    p_days: days,
  });
  if (error) throw mapError(error.message);
  return data as CustomerFollowupOutcomeDashboard;
}
