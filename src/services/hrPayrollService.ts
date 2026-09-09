import { supabase } from "@/integrations/supabase/client";

export type PayrollStatus = "draft" | "hr_review" | "finance_review" | "locked" | "paid" | "cancelled";

export type CompensationDirectoryItem = {
  employee_id: string;
  employee_name: string;
  employee_code?: string | null;
  employment_status: string;
  contract_type: string;
  compensation_profile_id?: string | null;
  base_salary?: number | null;
  currency: string;
  effective_from?: string | null;
  effective_to?: string | null;
  configured: boolean;
};

export type PayrollRun = {
  id: string;
  branch_id: string;
  month: number;
  year: number;
  period_start: string;
  period_end: string;
  status: PayrollStatus;
  generated_by?: string | null;
  generated_at: string;
  submitted_by?: string | null;
  submitted_at?: string | null;
  hr_reviewed_by?: string | null;
  hr_reviewed_at?: string | null;
  hr_review_note?: string | null;
  finance_reviewed_by?: string | null;
  finance_reviewed_at?: string | null;
  finance_review_note?: string | null;
  locked_by?: string | null;
  locked_at?: string | null;
  paid_by?: string | null;
  paid_at?: string | null;
  payment_reference?: string | null;
  payment_source_kind?: "branch_safe" | "pos_drawer" | "bank" | null;
  payment_cash_account_id?: string | null;
  payment_payment_account_id?: string | null;
  payment_account_name_snapshot?: string | null;
  payment_responsible_user_id?: string | null;
  payment_requested_by?: string | null;
  payment_requested_at?: string | null;
  payment_delegated_task_id?: string | null;
  payment_cash_ledger_id?: string | null;
  payment_payment_ledger_id?: string | null;
  total_base: number;
  total_earnings: number;
  total_deductions: number;
  total_net: number;
};

export type PayrollItem = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code?: string | null;
  base_salary: number;
  scheduled_days: number;
  attended_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  absent_days: number;
  worked_minutes: number;
  late_minutes: number;
  early_departure_minutes: number;
  overtime_candidate_minutes: number;
  overtime_paid_minutes: number;
  overtime_amount: number;
  absence_deduction: number;
  unpaid_leave_deduction: number;
  late_deduction: number;
  early_deduction: number;
  advance_deduction: number;
  manual_earnings: number;
  manual_deductions: number;
  gross_amount: number;
  total_deductions: number;
  net_amount: number;
  schedule_ready: boolean;
  warnings: string[];
  calculation?: Record<string, unknown>;
};

export type PayrollPolicy = {
  salary_divisor_days: number;
  standard_day_minutes: number;
  late_deduction_factor: number;
  early_deduction_factor: number;
  overtime_factor: number;
  auto_overtime_enabled: boolean;
  auto_absence_deduction: boolean;
  paid_leave_types: string[];
};

export type PayrollWorkspace = {
  version: number;
  branch_id: string;
  month: number;
  year: number;
  run: PayrollRun | null;
  items: PayrollItem[];
  policy: PayrollPolicy;
  compensation: { branch_id: string; items: CompensationDirectoryItem[] };
  generated_at: string;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function payrollError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.");
  if (value.includes("HR_BRANCH_ACCESS_DENIED")) return new Error("الفرع الحالي خارج نطاق صلاحيتك.");
  if (value.includes("PAYROLL_VIEW_DENIED")) return new Error("ليس لديك صلاحية عرض الرواتب.");
  if (value.includes("PAYROLL_COMPENSATION_DENIED")) return new Error("ليس لديك صلاحية تعديل راتب الموظف.");
  if (value.includes("PAYROLL_GENERATE_DENIED")) return new Error("ليس لديك صلاحية إنشاء مسير الرواتب.");
  if (value.includes("PAYROLL_ADJUSTMENT_DENIED")) return new Error("ليس لديك صلاحية إضافة تسوية على المسير.");
  if (value.includes("PAYROLL_SUBMIT_DENIED")) return new Error("ليس لديك صلاحية إرسال المسير للمراجعة.");
  if (value.includes("PAYROLL_HR_REVIEW_DENIED")) return new Error("ليس لديك صلاحية مراجعة HR للمسير.");
  if (value.includes("PAYROLL_FINANCE_REVIEW_DENIED")) return new Error("ليس لديك صلاحية المراجعة المالية للمسير.");
  if (value.includes("PAYROLL_PAYMENT_DENIED")) return new Error("ليس لديك صلاحية تسجيل صرف الرواتب.");
  if (value.includes("PAYROLL_COMPENSATION_INCOMPLETE")) return new Error("لا يمكن إرسال المسير قبل إدخال راتب أساسي لكل الموظفين المشمولين.");
  if (value.includes("PAYROLL_RUN_NOT_EDITABLE")) return new Error("المسير لم يعد قابلًا لإعادة الحساب بعد دخوله دورة المراجعة.");
  if (value.includes("PAYROLL_RUN_NOT_DRAFT")) return new Error("المسير ليس في حالة مسودة.");
  if (value.includes("PAYROLL_NOT_IN_HR_REVIEW")) return new Error("المسير ليس في مرحلة مراجعة الموارد البشرية.");
  if (value.includes("PAYROLL_NOT_IN_FINANCE_REVIEW")) return new Error("المسير ليس في مرحلة المراجعة المالية.");
  if (value.includes("PAYROLL_NOT_LOCKED")) return new Error("يجب اعتماد وقفل المسير ماليًا قبل تسجيل الصرف.");
  if (value.includes("PAYROLL_PAYMENT_REFERENCE_REQUIRED")) return new Error("أدخل مرجع صرف واضحًا.");
  if (value.includes("LEGACY_SALARY_CONFLICT")) return new Error("يوجد راتب قديم لنفس الموظف والشهر. راجعه قبل قفل المسير حتى لا يتم استبداله.");
  if (value.includes("INVALID_BASE_SALARY")) return new Error("قيمة الراتب الأساسي غير صحيحة.");
  if (value.includes("INVALID_PAYROLL_ADJUSTMENT")) return new Error("راجع نوع وقيمة وسبب التسوية.");
  if (value.includes("PAYROLL_REJECTION_NOTE_REQUIRED")) return new Error("اكتب سبب الإرجاع قبل رفض المسير.");
  if (value.includes("PAYROLL_DELEGATION_REQUIRED")) return new Error("صرف الرواتب يجب أن يمر عبر خزنة أو حساب مسؤول عهدة، وليس Paid مباشر.");
  return new Error(message || "تعذر تنفيذ عملية الرواتب.");
}

export async function getPayrollWorkspace(branchId: string, month: number, year: number): Promise<PayrollWorkspace> {
  const { data, error } = await rpc("get_hr_payroll_workspace_v2", { p_branch_id: branchId, p_month: month, p_year: year });
  if (error) throw payrollError(error.message);
  return data as PayrollWorkspace;
}

export async function saveCompensationProfile(employeeId: string, branchId: string, baseSalary: number, effectiveFrom: string) {
  const { data, error } = await rpc("save_hr_compensation_profile_v1", {
    p_employee_id: employeeId,
    p_branch_id: branchId,
    p_base_salary: baseSalary,
    p_effective_from: effectiveFrom,
  });
  if (error) throw payrollError(error.message);
  return data as { ok: boolean };
}

export async function generatePayrollRun(branchId: string, month: number, year: number): Promise<PayrollWorkspace> {
  const { data, error } = await rpc("generate_hr_payroll_run_v2", { p_branch_id: branchId, p_month: month, p_year: year });
  if (error) throw payrollError(error.message);
  return data as PayrollWorkspace;
}

export async function addPayrollAdjustment(itemId: string, type: "earning" | "deduction", code: string, amount: number, note: string) {
  const { data, error } = await rpc("add_hr_payroll_adjustment_v2", {
    p_payroll_item_id: itemId,
    p_adjustment_type: type,
    p_code: code,
    p_amount: amount,
    p_note: note,
  });
  if (error) throw payrollError(error.message);
  return data as { ok: boolean; adjustment_id: string };
}

export async function submitPayrollForHrReview(runId: string) {
  const { data, error } = await rpc("submit_hr_payroll_for_review_v2", { p_run_id: runId });
  if (error) throw payrollError(error.message);
  return data as { ok: boolean; run: PayrollRun };
}

export async function decideHrPayroll(runId: string, decision: "approved" | "rejected", note?: string) {
  const { data, error } = await rpc("decide_hr_payroll_v2", { p_run_id: runId, p_decision: decision, p_note: note || null });
  if (error) throw payrollError(error.message);
  return data as { ok: boolean; run: PayrollRun };
}

export async function decideFinancePayroll(runId: string, decision: "approved" | "rejected", note?: string) {
  const { data, error } = await rpc("decide_finance_payroll_v2", { p_run_id: runId, p_decision: decision, p_note: note || null });
  if (error) throw payrollError(error.message);
  return data as { ok: boolean; run: PayrollRun };
}

export async function markPayrollPaid(runId: string, paymentReference: string) {
  const { data, error } = await rpc("mark_hr_payroll_paid_v2", { p_run_id: runId, p_payment_reference: paymentReference });
  if (error) throw payrollError(error.message);
  return data as { ok: boolean; idempotent: boolean; run: PayrollRun };
}
