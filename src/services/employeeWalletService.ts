import { supabase } from "@/integrations/supabase/client";

export type EmployeeWalletAccount = {
  employee_id: string;
  branch_id: string | null;
  benefit_balance: number;
  benefit_monthly_allowance: number;
  credit_limit: number;
  receivable_balance: number;
  credit_available: number;
  payroll_deduction_enabled: boolean;
  active: boolean;
};

export type EmployeeWalletEntry = {
  id: string;
  entry_type: "benefit_topup" | "employee_purchase" | "credit_payment" | "payroll_settlement" | "refund" | "adjustment";
  benefit_delta: number;
  receivable_delta: number;
  amount: number;
  reference_kind?: string | null;
  reference_id?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  actor_user_id?: string | null;
  created_at: string;
};

export type EmployeeWalletResult = { account: EmployeeWalletAccount | null; ledger: EmployeeWalletEntry[] };

const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;

export async function getMyEmployeeWallet(limit = 50): Promise<EmployeeWalletResult> {
  const { data, error } = await rpc("get_my_employee_wallet_v1", { p_limit: limit });
  if (error) throw new Error(error.message || "تعذر تحميل حساب الموظف");
  return data as EmployeeWalletResult;
}

export async function getEmployeeWalletAdmin(employeeId: string, branchId: string, limit = 100): Promise<EmployeeWalletResult> {
  const { data, error } = await rpc("get_employee_wallet_admin_v1", { p_employee_id: employeeId, p_branch_id: branchId, p_limit: limit });
  if (error) throw new Error(error.message || "تعذر تحميل حساب الموظف");
  return data as EmployeeWalletResult;
}

export async function configureEmployeeWallet(params: {
  employeeId: string;
  branchId: string;
  benefitMonthlyAllowance: number;
  creditLimit: number;
  payrollDeductionEnabled: boolean;
  active: boolean;
}) {
  const { data, error } = await rpc("configure_employee_wallet_v1", {
    p_employee_id: params.employeeId,
    p_branch_id: params.branchId,
    p_benefit_monthly_allowance: params.benefitMonthlyAllowance,
    p_credit_limit: params.creditLimit,
    p_payroll_deduction_enabled: params.payrollDeductionEnabled,
    p_active: params.active,
  });
  if (error) throw new Error(error.message || "تعذر تحديث سياسة حساب الموظف");
  return data;
}

export async function postEmployeeWalletAdjustment(params: {
  employeeId: string;
  branchId: string;
  benefitDelta: number;
  receivableDelta: number;
  entryType: "benefit_topup" | "credit_payment" | "adjustment";
  description: string;
  idempotencyKey: string;
}) {
  const { data, error } = await rpc("post_employee_wallet_adjustment_v1", {
    p_employee_id: params.employeeId,
    p_branch_id: params.branchId,
    p_benefit_delta: params.benefitDelta,
    p_receivable_delta: params.receivableDelta,
    p_entry_type: params.entryType,
    p_description: params.description,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw new Error(error.message || "تعذر تسجيل حركة حساب الموظف");
  return data;
}
