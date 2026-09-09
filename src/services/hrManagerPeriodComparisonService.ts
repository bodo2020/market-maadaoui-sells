import { supabase } from "@/integrations/supabase/client";

export interface HrManagerPeriodSnapshot {
  employees: number;
  attendance_rate: number | null;
  absence_days: number;
  late_minutes: number;
  completed_tasks: number;
  overdue_open_tasks: number;
  cash_variance: number;
  payment_variance: number;
  inventory_completion_rate: number | null;
  delivery_delivered: number;
  online_handled_orders: number;
  followup_completion_rate: number | null;
  followups_overdue_open: number;
}

export interface HrManagerPeriodComparison {
  branch_id: string;
  current_period: { from: string; to: string; days: number };
  previous_period: { from: string; to: string; days: number };
  current: HrManagerPeriodSnapshot;
  previous: HrManagerPeriodSnapshot;
  context: {
    current_scheduled_days: number;
    previous_scheduled_days: number;
    same_length_periods: boolean;
  };
  notes: string[];
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export async function getHrManagerTeamPeriodComparison(params: {
  branchId: string;
  from: string;
  to: string;
}): Promise<HrManagerPeriodComparison> {
  const { data, error } = await rpc("get_hr_manager_team_period_comparison_v1", {
    p_branch_id: params.branchId,
    p_from: params.from,
    p_to: params.to,
  });

  if (error) {
    const text = error.message || "";
    if (text.includes("permission_denied")) throw new Error("ليس لديك صلاحية عرض مقارنة أداء الفريق.");
    if (text.includes("date_range_too_large")) throw new Error("الفترة القصوى للمقارنة سنة واحدة.");
    if (text.includes("invalid_date_range")) throw new Error("الفترة الزمنية غير صحيحة.");
    throw new Error(text || "تعذر تحميل مقارنة أداء الفريق.");
  }

  return data as HrManagerPeriodComparison;
}
