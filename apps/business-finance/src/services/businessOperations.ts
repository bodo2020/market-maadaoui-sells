import { supabase } from '../lib/supabase';
import { explainRpcError, resolvePeriod, type BusinessFilters } from './businessFinance';
import type { ReportDocument } from './reportingDetails';

function client() {
  if (!supabase) throw new Error('إعدادات Supabase غير موجودة.');
  return supabase;
}

async function rpc<T = ReportDocument>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, params);
  if (error) throw explainRpcError(error.message);
  return data as T;
}

export async function fetchPayrollWorkspace(branchId: string, month: number, year: number) {
  return rpc<ReportDocument>('get_hr_payroll_workspace_v2', { p_branch_id: branchId, p_month: month, p_year: year });
}

export async function fetchFinanceAccounts(branchId: string) {
  return rpc<ReportDocument>('get_finance_accounts_admin_v2', { p_branch_id: branchId });
}

export async function generatePayroll(branchId: string, month: number, year: number) {
  return rpc('generate_hr_payroll_run_v2', { p_branch_id: branchId, p_month: month, p_year: year });
}

export async function addPayrollAdjustment(payrollItemId: string, type: 'earning' | 'deduction', amount: number, note: string) {
  return rpc('add_hr_payroll_adjustment_v2', {
    p_payroll_item_id: payrollItemId,
    p_adjustment_type: type,
    p_code: type === 'earning' ? 'business_bonus' : 'business_deduction',
    p_amount: amount,
    p_note: note,
  });
}

export async function submitPayroll(runId: string) {
  return rpc('submit_hr_payroll_for_review_v2', { p_run_id: runId });
}

export async function decideHrPayroll(runId: string, decision: 'approved' | 'rejected', note = '') {
  return rpc('decide_hr_payroll_v2', { p_run_id: runId, p_decision: decision, p_note: note || null });
}

export async function decideFinancePayroll(runId: string, decision: 'approved' | 'rejected', note = '') {
  return rpc('decide_finance_payroll_v2', { p_run_id: runId, p_decision: decision, p_note: note || null });
}

export async function delegatePayrollPayment(runId: string, sourceKind: string, sourceAccountId: string, reference: string, note: string) {
  return rpc('delegate_hr_payroll_payment_v4', {
    p_run_id: runId,
    p_source_kind: sourceKind,
    p_source_account_id: sourceAccountId,
    p_reference: reference,
    p_note: note,
  });
}

export async function fetchDebtsWorkspace(branchId: string, limit = 200) {
  return rpc<ReportDocument>('get_business_debts_workspace_v1', { p_branch_id: branchId, p_limit: limit });
}

export async function postCustomerDebt(branchId: string, customerId: string, entryType: 'charge' | 'payment' | 'adjustment_increase' | 'adjustment_decrease' | 'writeoff', amount: number, description: string) {
  return rpc('post_customer_receivable_v1', {
    p_branch_id: branchId,
    p_customer_id: customerId,
    p_entry_type: entryType,
    p_amount: amount,
    p_description: description,
    p_idempotency_key: `business-debt-${crypto.randomUUID()}`,
  });
}

export async function postEmployeeDebt(branchId: string, employeeId: string, delta: number, description: string) {
  return rpc('post_employee_wallet_adjustment_v1', {
    p_employee_id: employeeId,
    p_branch_id: branchId,
    p_benefit_delta: 0,
    p_receivable_delta: delta,
    p_entry_type: delta < 0 ? 'credit_payment' : 'adjustment',
    p_description: description,
    p_idempotency_key: `business-employee-debt-${crypto.randomUUID()}`,
  });
}

export async function searchDebtParties(branchId: string, partyType: 'customer' | 'employee' | 'supplier', search: string) {
  return rpc<ReportDocument>('search_business_debt_parties_v1', {
    p_branch_id: branchId,
    p_party_type: partyType,
    p_search: search || null,
    p_limit: 50,
  });
}

export async function fetchDebtReport(filters: BusinessFilters) {
  const range = resolvePeriod(filters);
  return rpc<ReportDocument>('get_reporting_debts_v1', {
    p_branch_id: filters.branchId,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_limit: 100,
  });
}
