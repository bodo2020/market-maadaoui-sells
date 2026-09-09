import { supabase } from "@/integrations/supabase/client";

export type HrPerformanceEmployee = {
  user_id: string;
  name: string;
  employee_code: string | null;
  department_name: string | null;
  job_title_name: string | null;
  work_mode: string | null;
  employment_status: string | null;
  attendance_days: number;
  approved_leave_days: number;
  worked_hours: number;
  late_days: number;
  late_minutes: number;
  early_departure_days: number;
  early_departure_minutes: number;
  onsite_sessions: number;
  remote_sessions: number;
  completed_tasks: number;
  failed_tasks: number;
  overdue_open_tasks: number;
  completed_on_time: number;
  completed_late: number;
  sla_on_time_pct: number | null;
  inventory_tasks_completed: number;
  avg_task_minutes: number;
};

export type HrPerformanceResult = {
  branch_id: string;
  from: string;
  to: string;
  summary: {
    employees: number;
    attendance_days: number;
    worked_hours: number;
    late_minutes: number;
    completed_tasks: number;
    overdue_open_tasks: number;
    inventory_tasks_completed: number;
  };
  employees_data: HrPerformanceEmployee[];
};

export interface HrEmployeePerformanceDetail {
  employee: {
    id: string;
    name: string;
    employee_code?: string | null;
    department_name?: string | null;
    team_name?: string | null;
    job_title_name?: string | null;
    work_mode?: string | null;
  };
  period: { from: string; to: string; days: number };
  attendance: {
    sessions: number;
    checkins: number;
    completed_sessions: number;
    worked_minutes: number;
    late_sessions: number;
    late_minutes: number;
    early_departure_sessions: number;
    early_departure_minutes: number;
    on_time_sessions: number;
    punctuality_rate: number | null;
  };
  tasks: {
    assigned: number;
    completed: number;
    completion_rate: number | null;
    overdue_open: number;
    sla_measured_completed: number;
    sla_met: number;
    completed_late: number;
    sla_rate: number | null;
    avg_completion_minutes: number;
  };
  inventory: {
    counts_completed: number;
    matched: number;
    with_variance: number;
    recounts_completed: number;
    count_accuracy_rate: number | null;
  };
  notes: string[];
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function performanceError(message?: string) {
  const text = message || "";
  if (text.includes("permission_denied") || text.includes("PERMISSION_DENIED")) return new Error("ليس لديك صلاحية عرض أداء الموظفين.");
  if (text.includes("employee_out_of_scope")) return new Error("الموظف خارج نطاق الفرع الحالي.");
  if (text.includes("date_range_too_large") || text.includes("RANGE_TOO_LARGE")) return new Error("الفترة القصوى لعرض الأداء سنة واحدة.");
  if (text.includes("invalid_date_range") || text.includes("INVALID_RANGE")) return new Error("الفترة الزمنية غير صحيحة.");
  return new Error(text || "تعذر تحميل مؤشرات الأداء.");
}

/** Manager/team overview for a branch. */
export async function getHrTeamPerformance(params: {
  branchId: string;
  from: string;
  to: string;
}): Promise<HrPerformanceResult> {
  const { data, error } = await rpc("get_hr_employee_performance_v1", {
    p_branch_id: params.branchId,
    p_from: params.from,
    p_to: params.to,
  });
  if (error) throw performanceError(error.message);
  return data as HrPerformanceResult;
}

/** Detailed, explainable performance for one employee. */
export async function getHrEmployeePerformanceDetail(params: {
  employeeId: string;
  branchId: string;
  from: string;
  to: string;
}): Promise<HrEmployeePerformanceDetail> {
  const { data, error } = await rpc("get_hr_employee_performance_v1", {
    p_employee_id: params.employeeId,
    p_branch_id: params.branchId,
    p_from: params.from,
    p_to: params.to,
  });
  if (error) throw performanceError(error.message);
  return data as HrEmployeePerformanceDetail;
}
