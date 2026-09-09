import { supabase } from "@/integrations/supabase/client";

export type WorkMode = "onsite" | "remote" | "hybrid" | "field";
export type EmploymentStatus = "active" | "leave" | "suspended" | "terminated";
export type ContractType = "full_time" | "part_time" | "temporary" | "contractor" | "intern";

export interface HrDepartment {
  id: string;
  code: string;
  name_ar: string;
  description?: string | null;
  parent_department_id?: string | null;
  active: boolean;
  sort_order: number;
}

export interface HrTeam {
  id: string;
  department_id: string;
  branch_id?: string | null;
  name_ar: string;
  description?: string | null;
  manager_user_id?: string | null;
  manager_name?: string | null;
  active: boolean;
}

export interface HrJobTitle {
  id: string;
  department_id?: string | null;
  code: string;
  name_ar: string;
  grade?: string | null;
  default_work_mode: WorkMode;
  active: boolean;
}

export interface HrStructure {
  organization: { id: string; code: string; name_ar: string; legal_name?: string | null; active: boolean } | null;
  departments: HrDepartment[];
  teams: HrTeam[];
  job_titles: HrJobTitle[];
}

export interface HrEmployeeDirectoryItem {
  id: string;
  name: string;
  username: string;
  phone?: string | null;
  email?: string | null;
  active: boolean;
  role: string;
  employee_code?: string | null;
  employment_status?: EmploymentStatus | null;
  work_mode?: WorkMode | null;
  contract_type?: ContractType | null;
  hire_date?: string | null;
  primary_branch_id?: string | null;
  branch_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  job_title_id?: string | null;
  job_title_name?: string | null;
  grade?: string | null;
  direct_manager_id?: string | null;
  direct_manager_name?: string | null;
}

export interface HrEmployeeDirectoryResult {
  items: HrEmployeeDirectoryItem[];
  total: number;
}

export interface HrEmployeeProfilePayload {
  employee_code?: string;
  department_id?: string | null;
  team_id?: string | null;
  job_title_id?: string | null;
  direct_manager_id?: string | null;
  primary_branch_id?: string | null;
  employment_status?: EmploymentStatus;
  work_mode?: WorkMode;
  contract_type?: ContractType;
  hire_date?: string | null;
  termination_date?: string | null;
  notes?: string | null;
}

export async function getHrStructure(branchId?: string | null): Promise<HrStructure> {
  const { data, error } = await supabase.rpc("get_hr_structure_v1", { p_branch_id: branchId || null } as never);
  if (error) throw error;
  return (data || { organization: null, departments: [], teams: [], job_titles: [] }) as unknown as HrStructure;
}

export async function getHrEmployeeDirectory(params: {
  branchId?: string | null;
  search?: string;
  departmentId?: string | null;
  status?: EmploymentStatus | null;
  limit?: number;
  offset?: number;
}): Promise<HrEmployeeDirectoryResult> {
  const { data, error } = await supabase.rpc("get_hr_employee_directory_v1", {
    p_branch_id: params.branchId || null,
    p_search: params.search || null,
    p_department_id: params.departmentId || null,
    p_status: params.status || null,
    p_limit: params.limit ?? 100,
    p_offset: params.offset ?? 0,
  } as never);
  if (error) throw error;
  return (data || { items: [], total: 0 }) as unknown as HrEmployeeDirectoryResult;
}

export async function getHrEmployeeProfile(employeeId: string, branchId?: string | null) {
  const { data, error } = await supabase.rpc("get_hr_employee_profile_v1", {
    p_employee_id: employeeId,
    p_branch_id: branchId || null,
  } as never);
  if (error) throw error;
  return data as any;
}

export async function saveHrEmployeeProfile(employeeId: string, branchId: string | null, profile: HrEmployeeProfilePayload) {
  const { data, error } = await supabase.rpc("save_hr_employee_profile_v1", {
    p_employee_id: employeeId,
    p_branch_id: branchId || null,
    p_profile: profile,
  } as never);
  if (error) throw error;
  return data as any;
}

export async function saveHrDepartment(input: {
  id?: string | null;
  code: string;
  nameAr: string;
  description?: string | null;
  parentDepartmentId?: string | null;
  active?: boolean;
  sortOrder?: number;
}) {
  const { data, error } = await supabase.rpc("save_hr_department_v1", {
    p_department_id: input.id || null,
    p_code: input.code,
    p_name_ar: input.nameAr,
    p_description: input.description || null,
    p_parent_department_id: input.parentDepartmentId || null,
    p_active: input.active ?? true,
    p_sort_order: input.sortOrder ?? 0,
  } as never);
  if (error) throw error;
  return data as unknown as HrStructure;
}

export async function saveHrTeam(input: {
  id?: string | null;
  branchId?: string | null;
  departmentId: string;
  nameAr: string;
  description?: string | null;
  managerUserId?: string | null;
  active?: boolean;
}) {
  const { data, error } = await supabase.rpc("save_hr_team_v1", {
    p_team_id: input.id || null,
    p_branch_id: input.branchId || null,
    p_department_id: input.departmentId,
    p_name_ar: input.nameAr,
    p_description: input.description || null,
    p_manager_user_id: input.managerUserId || null,
    p_active: input.active ?? true,
  } as never);
  if (error) throw error;
  return data as unknown as HrStructure;
}

export async function saveHrJobTitle(input: {
  id?: string | null;
  departmentId?: string | null;
  code: string;
  nameAr: string;
  grade?: string | null;
  defaultWorkMode?: WorkMode;
  active?: boolean;
}) {
  const { data, error } = await supabase.rpc("save_hr_job_title_v1", {
    p_job_title_id: input.id || null,
    p_department_id: input.departmentId || null,
    p_code: input.code,
    p_name_ar: input.nameAr,
    p_grade: input.grade || null,
    p_default_work_mode: input.defaultWorkMode || "onsite",
    p_active: input.active ?? true,
  } as never);
  if (error) throw error;
  return data as unknown as HrStructure;
}
