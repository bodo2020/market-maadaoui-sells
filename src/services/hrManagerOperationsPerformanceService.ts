import { supabase } from "@/integrations/supabase/client";

export interface HrManagerOperationsEmployee {
  user_id: string;
  name: string;
  role: string;
  employee_code?: string | null;
  department_name?: string | null;
  job_title_name?: string | null;
  cashier_invoices: number;
  cashier_sales: number;
  cashier_shifts: number;
  cash_variance: number;
  opening_variance: number;
  payment_variance_lines: number;
  payment_variance: number;
  inventory_counts_assigned: number;
  inventory_counts_submitted: number;
  inventory_differences_found: number;
  inventory_recounts_assigned: number;
  inventory_recounts_submitted: number;
  inventory_recounts_conflicting: number;
  delivery_assigned: number;
  delivery_active_open: number;
  delivery_delivered: number;
  avg_delivery_minutes: number | null;
  online_transitions: number;
  online_handled_orders: number;
  online_cancellations: number;
  followups_assigned: number;
  followups_closed: number;
  followups_overdue_open: number;
  needs_attention: boolean;
}

export interface HrManagerOperationsPerformance {
  branch_id: string;
  period: { from: string; to: string };
  summary: {
    employees: number;
    employees_with_specialist_activity: number;
    employees_needing_attention: number;
    cashier: { invoices: number; sales: number; cash_variance: number; payment_variance: number };
    inventory: { counts_assigned: number; counts_submitted: number; differences_found: number; recounts_submitted: number; recount_conflicts: number };
    delivery: { assigned: number; active_open: number; delivered: number };
    online: { handled_orders: number; transitions: number; cancellations: number };
    customer_service: { assigned: number; closed: number; overdue_open: number };
  };
  employees: HrManagerOperationsEmployee[];
  notes: string[];
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export async function getHrManagerOperationsPerformance(params: {
  branchId: string;
  from: string;
  to: string;
}): Promise<HrManagerOperationsPerformance> {
  const { data, error } = await rpc("get_hr_manager_team_operations_v1", {
    p_branch_id: params.branchId,
    p_from: params.from,
    p_to: params.to,
  });

  if (error) {
    const text = error.message || "";
    if (text.includes("permission_denied")) throw new Error("ليس لديك صلاحية عرض تشغيل الفريق.");
    if (text.includes("date_range_too_large")) throw new Error("الفترة القصوى لعرض تشغيل الفريق سنة واحدة.");
    if (text.includes("invalid_date_range")) throw new Error("الفترة الزمنية غير صحيحة.");
    throw new Error(text || "تعذر تحميل تشغيل الفريق.");
  }
  return data as HrManagerOperationsPerformance;
}
