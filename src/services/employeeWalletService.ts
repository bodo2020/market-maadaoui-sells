import { supabase } from "@/integrations/supabase/client";

export type EmployeeWalletAccount = {
  employee_id: string;
  branch_id: string | null;
  membership_number?: string | null;
  barcode_token?: string | null;
  points_balance?: number;
  lifetime_points_earned?: number;
  lifetime_points_reversed?: number;
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
  entry_type: "benefit_topup" | "employee_purchase" | "credit_payment" | "payroll_settlement" | "refund" | "adjustment" | "points_earn" | "points_reversal";
  benefit_delta: number;
  receivable_delta: number;
  points_delta?: number;
  amount: number;
  reference_kind?: string | null;
  reference_id?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  actor_user_id?: string | null;
  created_at: string;
};

export type EmployeeWalletResult = { account: EmployeeWalletAccount | null; ledger: EmployeeWalletEntry[] };

export type POSEmployeePurchaseCard = {
  employee_id: string;
  name: string;
  username?: string | null;
  employee_code?: string | null;
  membership_number: string;
  barcode_token: string;
  points_balance: number;
  credit_limit: number;
  receivable_balance: number;
  credit_available: number;
  credit_active: boolean;
  payroll_deduction_enabled: boolean;
  branch_id?: string | null;
};

export type EmployeePurchaseProfile = {
  wallet: (EmployeeWalletAccount & { ledger: EmployeeWalletEntry[] }) | null;
  attendance: {
    month_start: string;
    through_date: string;
    scheduled_days: number;
    attended_days: number;
    approved_leave_days: number;
    absent_days: number;
    late_days: number;
    worked_minutes: number;
  };
  payroll: {
    next_pay_date?: string | null;
    pay_day_of_month?: number | null;
    latest?: {
      id: string;
      month: number;
      year: number;
      status: string;
      period_start: string;
      period_end: string;
      paid_at?: string | null;
      base_salary: number;
      gross_amount: number;
      total_deductions: number;
      net_amount: number;
      attended_days: number;
      absent_days: number;
      advance_deduction: number;
    } | null;
  };
  advances: Array<{
    id: string;
    principal_amount: number;
    monthly_deduction: number;
    outstanding_amount: number;
    repayment_months: number;
    status: string;
    paid_at?: string | null;
    settled_at?: string | null;
    created_at: string;
  }>;
  generated_at: string;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;

function walletError(message?: string) {
  const value = message || "";
  if (value.includes("EMPLOYEE_NOT_FOUND")) return new Error("بطاقة الموظف غير معروفة أو الحساب غير نشط.");
  if (value.includes("EMPLOYEE_BRANCH_MISMATCH")) return new Error("الموظف غير مرتبط بالفرع الحالي.");
  if (value.includes("CREDIT_LIMIT_EXCEEDED")) return new Error("المبلغ يتجاوز الآجل المتاح للموظف.");
  if (value.includes("EMPLOYEE_CREDIT_INACTIVE") || value.includes("EMPLOYEE_WALLET_NOT_ACTIVE")) return new Error("حساب الآجل للموظف موقوف حاليًا.");
  return new Error(message || "تعذر تحميل حساب الموظف");
}

export function isEmployeePurchaseBarcode(code: string) {
  return /^297\d{10}$/.test(code.trim());
}

export async function lookupEmployeePurchaseCard(code: string, branchId: string): Promise<POSEmployeePurchaseCard | null> {
  const { data, error } = await rpc("lookup_employee_purchase_card_v1", { p_code: code.trim(), p_branch_id: branchId });
  if (error) throw walletError(error.message);
  return data ? data as POSEmployeePurchaseCard : null;
}

export async function getMyEmployeePurchaseProfile(branchId?: string | null, limit = 30): Promise<EmployeePurchaseProfile> {
  const { data, error } = await rpc("get_my_employee_purchase_profile_v1", { p_branch_id: branchId || null, p_ledger_limit: limit });
  if (error) throw walletError(error.message);
  return data as EmployeePurchaseProfile;
}

export async function getMyEmployeeWallet(limit = 50): Promise<EmployeeWalletResult> {
  const { data, error } = await rpc("get_my_employee_wallet_v1", { p_limit: limit });
  if (error) throw walletError(error.message);
  return data as EmployeeWalletResult;
}

export async function getEmployeeWalletAdmin(employeeId: string, branchId: string, limit = 100): Promise<EmployeeWalletResult> {
  const { data, error } = await rpc("get_employee_wallet_admin_v1", { p_employee_id: employeeId, p_branch_id: branchId, p_limit: limit });
  if (error) throw walletError(error.message);
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
  if (error) throw walletError(error.message);
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
  if (error) throw walletError(error.message);
  return data;
}
