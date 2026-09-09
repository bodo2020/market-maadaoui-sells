import { supabase } from "@/integrations/supabase/client";

export interface HrInventoryPerformance {
  applicable: boolean;
  period: { from: string; to: string };
  employee: {
    id: string;
    name: string;
    role: string;
    employee_code?: string | null;
    department_name?: string | null;
    job_title_name?: string | null;
  };
  counts: {
    assigned: number;
    submitted: number;
    completion_rate: number | null;
    matched: number;
    discrepancy: number;
    match_rate: number | null;
    abs_variance_units: number;
    abs_variance_value: number;
    avg_active_minutes: number;
    completed_on_time: number;
    overdue_open: number;
  };
  recounts: {
    assigned: number;
    submitted: number;
    completion_rate: number | null;
    matched: number;
    discrepancy: number;
    abs_variance_units: number;
    abs_variance_value: number;
    avg_active_minutes: number;
    overdue_open: number;
  };
  peer_review: {
    reviewed: number;
    confirmed: number;
    disagreed: number;
    confirmation_rate: number | null;
  };
  notes: string[];
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export async function getHrInventoryPerformance(params: {
  employeeId: string;
  branchId: string;
  from: string;
  to: string;
}): Promise<HrInventoryPerformance> {
  const { data, error } = await rpc("get_hr_inventory_performance_v1", {
    p_employee_id: params.employeeId,
    p_branch_id: params.branchId,
    p_from: params.from,
    p_to: params.to,
  });

  if (error) {
    const text = error.message || "";
    if (text.includes("permission_denied")) throw new Error("ليس لديك صلاحية عرض مؤشرات الجرد للموظف.");
    if (text.includes("employee_out_of_scope")) throw new Error("الموظف خارج نطاق الفرع الحالي.");
    if (text.includes("date_range_too_large")) throw new Error("الفترة القصوى لعرض مؤشرات الجرد سنة واحدة.");
    throw new Error(text || "تعذر تحميل مؤشرات الجرد للموظف.");
  }

  return data as HrInventoryPerformance;
}
