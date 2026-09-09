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

export async function getHrEmployeePerformance(params: {
  branchId: string;
  from: string;
  to: string;
}): Promise<HrPerformanceResult> {
  const { data, error } = await (supabase.rpc as any)("get_hr_employee_performance_v1", {
    p_branch_id: params.branchId,
    p_from: params.from,
    p_to: params.to,
  });
  if (error) throw new Error(error.message || "تعذر تحميل مؤشرات أداء الموظفين");
  return data as HrPerformanceResult;
}
