import { supabase } from "@/integrations/supabase/client";

export type HrWorkspaceEmployee = {
  id: string;
  name: string;
  employee_code?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  job_title_name?: string | null;
  scheduled_today: boolean;
  checked_in: boolean;
  checked_out: boolean;
  late_minutes: number;
  early_departure_minutes: number;
  check_in_location_status?: string | null;
  on_leave: boolean;
  pending_exceptions: number;
  open_tasks: number;
  overdue_tasks: number;
  absent_now: boolean;
};

export type HrWorkspaceDashboard = {
  date: string;
  branch_id: string;
  role_code: string;
  scope: "own" | "team" | "department" | "branch";
  summary: {
    employees: number;
    scheduled_today: number;
    present: number;
    late: number;
    absent: number;
    on_leave: number;
    pending_exceptions: number;
    open_tasks: number;
    overdue_tasks: number;
  };
  attention: HrWorkspaceEmployee[];
  employees: HrWorkspaceEmployee[];
};

export type HrAttendanceExceptionItem = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code?: string | null;
  requested_at: string;
  attendance_mode: string;
  distance_m?: number | null;
  accuracy_m?: number | null;
  reason: string;
  status: string;
  operations_task_id?: string | null;
};

export type HrAttendanceControl = HrWorkspaceDashboard & {
  pending_exception_items: HrAttendanceExceptionItem[];
};

export type HrScopedEmployeeProfile = {
  user: {
    id: string;
    name: string;
    username: string;
    phone?: string | null;
    email?: string | null;
    role?: string | null;
    active?: boolean;
    created_at?: string | null;
  };
  profile?: {
    employee_code?: string | null;
    employment_status?: string | null;
    work_mode?: string | null;
    contract_type?: string | null;
    hire_date?: string | null;
    termination_date?: string | null;
    notes?: string | null;
    primary_branch_id?: string | null;
    department_id?: string | null;
    team_id?: string | null;
    job_title_id?: string | null;
    direct_manager_id?: string | null;
  } | null;
  department?: { id: string; name_ar: string; code?: string | null } | null;
  team?: { id: string; name_ar: string } | null;
  job_title?: { id: string; name_ar: string; grade?: string | null } | null;
  manager?: { id: string; name: string } | null;
  branches?: Array<{ branch_id: string; branch_name: string; is_primary: boolean; active: boolean; role?: string | null }>;
};

export type HrEmployeePerformanceDetail = {
  employee?: { id: string; name: string; employee_code?: string | null; department_name?: string | null; team_name?: string | null; job_title_name?: string | null; work_mode?: string | null };
  period?: { from: string; to: string; days: number };
  attendance?: {
    sessions?: number;
    scheduled_days?: number;
    approved_leave_days?: number;
    attended_scheduled_days?: number;
    absence_days?: number;
    attendance_rate?: number | null;
    late_sessions?: number;
    late_minutes?: number;
    early_departure_sessions?: number;
    early_departure_minutes?: number;
    punctuality_rate?: number | null;
    worked_minutes?: number;
  };
  tasks?: {
    assigned?: number;
    completed?: number;
    completion_rate?: number | null;
    overdue_open?: number;
    sla_rate?: number | null;
    avg_completion_minutes?: number | null;
  };
  inventory?: {
    counts_completed?: number;
    matched?: number;
    with_variance?: number;
    recounts_completed?: number;
    count_accuracy_rate?: number | null;
  };
  notes?: string[];
};

export async function getHrWorkspaceDashboard(branchId: string, date?: string | null): Promise<HrWorkspaceDashboard> {
  const { data, error } = await supabase.rpc("get_hr_workspace_dashboard_v1", {
    p_branch_id: branchId,
    p_date: date || null,
  } as never);
  if (error) throw error;
  return (data || { summary: {}, attention: [], employees: [] }) as unknown as HrWorkspaceDashboard;
}

export async function getHrAttendanceControl(branchId: string, date?: string | null): Promise<HrAttendanceControl> {
  const { data, error } = await supabase.rpc("get_hr_attendance_control_v1", {
    p_branch_id: branchId,
    p_date: date || null,
  } as never);
  if (error) throw error;
  return (data || { summary: {}, attention: [], employees: [], pending_exception_items: [] }) as unknown as HrAttendanceControl;
}

export async function getHrScopedEmployeeProfile(employeeId: string, branchId: string): Promise<HrScopedEmployeeProfile> {
  const { data, error } = await supabase.rpc("get_hr_employee_profile_v2", {
    p_employee_id: employeeId,
    p_branch_id: branchId,
  } as never);
  if (error) throw error;
  return data as unknown as HrScopedEmployeeProfile;
}

export async function getHrEmployeePerformanceDetail(employeeId: string, branchId: string, from: string, to: string): Promise<HrEmployeePerformanceDetail> {
  const { data, error } = await supabase.rpc("get_hr_employee_performance_detail_v1", {
    p_employee_id: employeeId,
    p_branch_id: branchId,
    p_from: from,
    p_to: to,
  } as never);
  if (error) throw error;
  return data as unknown as HrEmployeePerformanceDetail;
}
