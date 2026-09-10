import { supabase } from "@/integrations/supabase/client";
import type { FinanceTreasuryWorkspaceV2 } from "@/services/supabase/financeTreasuryV2Service";

export type FinanceControlSummary = {
  branch_safe_balance: number;
  cashier_drawers_balance: number;
  online_cash_balance: number;
  bank_balance: number;
  gateway_clearing_balance: number;
  operational_cash_total: number;
  liquid_funds_total: number;
  in_transit_amount: number;
  in_transit_count: number;
  funds_under_custody_total: number;
  transfer_exception_count: number;
  active_salary_advance_outstanding: number;
  unlinked_salary_advance_amount: number;
  unlinked_salary_advance_count: number;
  locked_payroll_amount: number;
  pending_treasury_disbursement_amount: number;
  failed_treasury_tasks: number;
  attention_count: number;
};

export type FinanceAdvanceRow = {
  advance_id: string;
  employee_id: string;
  employee_name: string;
  principal_amount: number;
  outstanding_amount: number;
  monthly_deduction: number;
  repayment_months: number;
  status: string;
  paid_at?: string | null;
  payout_source_kind?: string | null;
  payout_account_name?: string | null;
  payout_responsible_user_id?: string | null;
  payout_responsible_user_name?: string | null;
  payout_reference?: string | null;
  source_status: "linked" | "unlinked" | "pending";
};

export type FinancePayrollRunRow = {
  run_id: string;
  month: number;
  year: number;
  status: string;
  total_net: number;
  total_deductions: number;
  payment_source_kind?: string | null;
  payment_account_name?: string | null;
  payment_responsible_user_id?: string | null;
  payment_responsible_user_name?: string | null;
  payment_reference?: string | null;
  payment_requested_at?: string | null;
  paid_at?: string | null;
  delegated_task_id?: string | null;
  delegated_task_status?: string | null;
};

export type FinanceTreasuryTaskRow = {
  task_id: string;
  source_kind: string;
  source_id?: string | null;
  title: string;
  amount: number;
  status: string;
  priority?: string | null;
  responsible_user_id?: string | null;
  responsible_user_name?: string | null;
  created_at: string;
  completed_at?: string | null;
  failure_reason?: string | null;
};

export type FinanceControlCenterV2 = {
  version: number;
  branch_id: string;
  summary: FinanceControlSummary;
  treasury: FinanceTreasuryWorkspaceV2;
  salary_advances: FinanceAdvanceRow[];
  payroll_runs: FinancePayrollRunRow[];
  treasury_tasks: FinanceTreasuryTaskRow[];
  generated_at: string;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function financeError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.");
  if (value.includes("FINANCE_BRANCH_ACCESS_DENIED")) return new Error("ليس لديك وصول مالي لهذا الفرع.");
  if (value.includes("FINANCE_VIEW_DENIED")) return new Error("ليس لديك صلاحية عرض مركز الماليات.");
  return new Error(message || "تعذر تحميل مركز الماليات.");
}

export async function fetchFinanceControlCenterV2(branchId: string, limit = 80): Promise<FinanceControlCenterV2> {
  const { data, error } = await rpc("get_finance_control_center_v2", {
    p_branch_id: branchId,
    p_limit: limit,
  });
  if (error) throw financeError(error.message);
  return data as FinanceControlCenterV2;
}
