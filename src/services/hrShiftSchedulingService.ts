import { supabase } from "@/integrations/supabase/client";

export type HrShiftTemplate = {
  id: string;
  name_ar: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  late_grace_minutes: number;
  early_departure_grace_minutes: number;
  active: boolean;
  active_assignments: number;
};

export type HrShiftAssignment = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code?: string | null;
  shift_template_id: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  weekdays: number[];
  effective_from: string;
  effective_to?: string | null;
  active: boolean;
  template_active: boolean;
};

export type HrShiftEmployee = {
  employee_id: string;
  employee_name: string;
  employee_code?: string | null;
  employment_status: string;
  work_mode: string;
  active_assignment_count: number;
};

export type HrShiftScheduler = {
  version: number;
  branch_id: string;
  templates: HrShiftTemplate[];
  assignments: HrShiftAssignment[];
  employees: HrShiftEmployee[];
  generated_at: string;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function shiftError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.");
  if (value.includes("HR_BRANCH_ACCESS_DENIED")) return new Error("الفرع الحالي خارج نطاق صلاحيتك.");
  if (value.includes("SHIFT_VIEW_DENIED")) return new Error("ليس لديك صلاحية عرض جداول الورديات.");
  if (value.includes("SHIFT_MANAGE_DENIED")) return new Error("ليس لديك صلاحية إدارة الورديات.");
  if (value.includes("SHIFT_NAME_REQUIRED")) return new Error("اكتب اسمًا واضحًا للوردية.");
  if (value.includes("SHIFT_TEMPLATE_TIMES_INVALID")) return new Error("وقت بداية ونهاية الوردية غير صحيح.");
  if (value.includes("SHIFT_TEMPLATE_LIMITS_INVALID")) return new Error("راجع مدة الراحة وفترات السماح.");
  if (value.includes("SHIFT_TEMPLATE_NAME_EXISTS")) return new Error("يوجد قالب وردية بنفس الاسم في هذا الفرع.");
  if (value.includes("SHIFT_TEMPLATE_IN_USE")) return new Error("لا يمكن تعطيل القالب قبل إنهاء إسناداته النشطة.");
  if (value.includes("SHIFT_TEMPLATE_NOT_FOUND_OR_INACTIVE") || value.includes("SHIFT_TEMPLATE_NOT_FOUND")) return new Error("قالب الوردية غير موجود أو غير نشط.");
  if (value.includes("SHIFT_EMPLOYEE_NOT_FOUND")) return new Error("الموظف غير موجود ضمن الفرع الحالي.");
  if (value.includes("SHIFT_WEEKDAYS_REQUIRED")) return new Error("اختر يوم عمل واحدًا على الأقل.");
  if (value.includes("SHIFT_EFFECTIVE_FROM_REQUIRED")) return new Error("حدد تاريخ بداية سريان الوردية.");
  if (value.includes("SHIFT_EFFECTIVE_RANGE_INVALID")) return new Error("تاريخ نهاية السريان يسبق تاريخ البداية.");
  if (value.includes("SHIFT_ASSIGNMENT_CONFLICT")) return new Error("يوجد إسناد وردية متداخل لنفس الموظف في أحد الأيام والفترة المختارة.");
  if (value.includes("SHIFT_ASSIGNMENT_NOT_FOUND")) return new Error("إسناد الوردية غير موجود.");
  return new Error(message || "تعذر تنفيذ عملية الورديات.");
}

export async function getHrShiftScheduler(branchId: string): Promise<HrShiftScheduler> {
  const { data, error } = await rpc("get_hr_shift_scheduler_v1", { p_branch_id: branchId });
  if (error) throw shiftError(error.message);
  const raw = data as Partial<HrShiftScheduler> | null;
  return {
    version: Number(raw?.version || 1),
    branch_id: String(raw?.branch_id || branchId),
    templates: Array.isArray(raw?.templates) ? raw!.templates as HrShiftTemplate[] : [],
    assignments: Array.isArray(raw?.assignments) ? raw!.assignments as HrShiftAssignment[] : [],
    employees: Array.isArray(raw?.employees) ? raw!.employees as HrShiftEmployee[] : [],
    generated_at: String(raw?.generated_at || new Date().toISOString()),
  };
}

export async function saveHrShiftTemplate(params: {
  branchId: string;
  templateId?: string | null;
  nameAr: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  lateGraceMinutes: number;
  earlyDepartureGraceMinutes: number;
  active: boolean;
}) {
  const { data, error } = await rpc("save_hr_shift_template_v1", {
    p_branch_id: params.branchId,
    p_template_id: params.templateId || null,
    p_name_ar: params.nameAr.trim(),
    p_start_time: params.startTime,
    p_end_time: params.endTime,
    p_break_minutes: params.breakMinutes,
    p_late_grace_minutes: params.lateGraceMinutes,
    p_early_departure_grace_minutes: params.earlyDepartureGraceMinutes,
    p_active: params.active,
  });
  if (error) throw shiftError(error.message);
  return data as { ok: boolean; template: HrShiftTemplate };
}

export async function saveHrShiftAssignment(params: {
  branchId: string;
  assignmentId?: string | null;
  employeeId: string;
  shiftTemplateId: string;
  weekdays: number[];
  effectiveFrom: string;
  effectiveTo?: string | null;
  active: boolean;
}) {
  const { data, error } = await rpc("save_hr_shift_assignment_v1", {
    p_branch_id: params.branchId,
    p_assignment_id: params.assignmentId || null,
    p_employee_id: params.employeeId,
    p_shift_template_id: params.shiftTemplateId,
    p_weekdays: params.weekdays,
    p_effective_from: params.effectiveFrom,
    p_effective_to: params.effectiveTo || null,
    p_active: params.active,
  });
  if (error) throw shiftError(error.message);
  return data as { ok: boolean; assignment: HrShiftAssignment };
}
