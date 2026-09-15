import { supabase } from '../lib/supabase';
import { friendlyExpenseError, type ExpenseCategory, type ExpenseDocument, type ExpensePayoutSource } from './expensesV2';

const RECEIPT_BUCKET = 'expense-receipts-v2';
const RECEIPT_PREFIX = `storage://${RECEIPT_BUCKET}/`;
const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;
const RECEIPT_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function client() {
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ.');
  return supabase;
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function validateExpenseReceipt(file: File) {
  if (!RECEIPT_MIME_EXT[file.type]) throw new Error('الإثبات يجب أن يكون صورة JPG/PNG/WEBP أو ملف PDF.');
  if (file.size > MAX_RECEIPT_BYTES) throw new Error('حجم ملف الإثبات يجب ألا يتجاوز 15 ميجابايت.');
}

export async function uploadExpenseReceipt(branchId: string, file: File) {
  validateExpenseReceipt(file);
  const { data: userData, error: userError } = await client().auth.getUser();
  if (userError || !userData.user) throw new Error('انتهت جلسة المستخدم. سجّل الدخول ثم حاول مرة أخرى.');
  const extension = RECEIPT_MIME_EXT[file.type];
  const path = `${branchId}/${userData.user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client().storage.from(RECEIPT_BUCKET).upload(path, file, {
    upsert: false,
    cacheControl: '3600',
    contentType: file.type,
  });
  if (error) throw new Error(`تعذر رفع الإثبات: ${error.message}`);
  return `${RECEIPT_PREFIX}${path}`;
}

function parseReceiptToken(value: string) {
  if (!value.startsWith(RECEIPT_PREFIX)) return null;
  const path = value.slice(RECEIPT_PREFIX.length);
  return path ? { bucket: RECEIPT_BUCKET, path } : null;
}

export async function resolveExpenseReceiptUrl(value?: string | null) {
  if (!value) return null;
  const storage = parseReceiptToken(value);
  if (!storage) return value;
  const { data, error } = await client().storage.from(storage.bucket).createSignedUrl(storage.path, 300);
  if (error) throw new Error('تعذر فتح ملف الإثبات حاليًا.');
  return data.signedUrl;
}

export async function removeExpenseReceipt(value?: string | null) {
  if (!value) return;
  const storage = parseReceiptToken(value);
  if (!storage) return;
  const { error } = await client().storage.from(storage.bucket).remove([storage.path]);
  if (error) throw new Error(`تعذر حذف ملف الإثبات: ${error.message}`);
}

export async function submitExpenseDraft(documentId: string, receiptUrl?: string | null, note?: string) {
  const { data, error } = await client().rpc('submit_expense_draft_v3', {
    p_document_id: documentId,
    p_receipt_url: receiptUrl || null,
    p_note: note || null,
  });
  if (error) throw expenseControlError(error.message);
  return data as ExpenseDocument;
}

export interface ExpenseBudgetRow {
  id: string;
  branch_id: string;
  category_id?: string | null;
  category_name: string;
  group_name_ar: string;
  period_month: string;
  budget_amount: number;
  actual_amount: number;
  remaining_amount: number;
  usage_percent: number;
  alert_80: boolean;
  alert_100: boolean;
  notes?: string | null;
}

export interface ExpenseBudgetWorkspace {
  version: number;
  branch_id: string;
  period_month: string;
  summary: {
    period_month: string;
    budget_amount: number;
    actual_amount: number;
    remaining_amount: number;
    usage_percent: number;
  };
  budgets: ExpenseBudgetRow[];
  categories: Array<Pick<ExpenseCategory, 'id' | 'code' | 'name_ar' | 'group_name_ar'>>;
  permissions: { can_manage: boolean };
}

export async function fetchExpenseBudgetWorkspace(branchId: string, month?: string) {
  const { data, error } = await client().rpc('get_expense_budget_workspace_v2', {
    p_branch_id: branchId,
    p_period_month: month || null,
  });
  if (error) throw expenseControlError(error.message);
  const raw = (data || {}) as Record<string, any>;
  const summary = (raw.summary || {}) as Record<string, any>;
  return {
    ...raw,
    summary: {
      ...summary,
      budget_amount: asNumber(summary.budget_amount),
      actual_amount: asNumber(summary.actual_amount),
      remaining_amount: asNumber(summary.remaining_amount),
      usage_percent: asNumber(summary.usage_percent),
    },
    budgets: Array.isArray(raw.budgets) ? raw.budgets.map((item: Record<string, any>) => ({
      ...item,
      budget_amount: asNumber(item.budget_amount),
      actual_amount: asNumber(item.actual_amount),
      remaining_amount: asNumber(item.remaining_amount),
      usage_percent: asNumber(item.usage_percent),
    })) : [],
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    permissions: { can_manage: raw.permissions?.can_manage === true },
  } as ExpenseBudgetWorkspace;
}

export async function upsertExpenseBudget(input: {
  id?: string | null;
  branchId: string;
  categoryId?: string | null;
  periodMonth: string;
  budgetAmount: number;
  alert80?: boolean;
  alert100?: boolean;
  notes?: string;
}) {
  const { data, error } = await client().rpc('upsert_expense_budget_v2', {
    p_id: input.id || null,
    p_branch_id: input.branchId,
    p_category_id: input.categoryId || null,
    p_period_month: input.periodMonth,
    p_budget_amount: input.budgetAmount,
    p_alert_80: input.alert80 !== false,
    p_alert_100: input.alert100 !== false,
    p_notes: input.notes || null,
  });
  if (error) throw expenseControlError(error.message);
  return data;
}

export type RecurringCadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringExpenseRule {
  id: string;
  branch_id: string;
  category_id: string;
  category_name: string;
  accounting_treatment: string;
  amount: number;
  tax_amount: number;
  description: string;
  beneficiary_name?: string | null;
  notes?: string | null;
  cadence: RecurringCadence;
  next_run_date: string;
  end_date?: string | null;
  auto_submit: boolean;
  active: boolean;
  last_generated_at?: string | null;
  generated_count: number;
}

export interface RecurringExpenseWorkspace {
  version: number;
  branch_id: string;
  today: string;
  rules: RecurringExpenseRule[];
  categories: ExpenseCategory[];
  permissions: { can_manage: boolean };
}

export async function fetchRecurringExpenseWorkspace(branchId: string) {
  const { data, error } = await client().rpc('get_expense_recurring_workspace_v2', { p_branch_id: branchId });
  if (error) throw expenseControlError(error.message);
  const raw = (data || {}) as Record<string, any>;
  return {
    ...raw,
    rules: Array.isArray(raw.rules) ? raw.rules.map((item: Record<string, any>) => ({
      ...item,
      amount: asNumber(item.amount),
      tax_amount: asNumber(item.tax_amount),
      generated_count: asNumber(item.generated_count),
    })) : [],
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    permissions: { can_manage: raw.permissions?.can_manage === true },
  } as RecurringExpenseWorkspace;
}

export async function upsertRecurringExpenseRule(input: {
  id?: string | null;
  branchId: string;
  categoryId: string;
  amount: number;
  description: string;
  beneficiaryName?: string;
  taxAmount?: number;
  cadence: RecurringCadence;
  nextRunDate: string;
  endDate?: string;
  autoSubmit: boolean;
  active: boolean;
  notes?: string;
}) {
  const { data, error } = await client().rpc('upsert_expense_recurring_rule_v2', {
    p_id: input.id || null,
    p_branch_id: input.branchId,
    p_category_id: input.categoryId,
    p_amount: input.amount,
    p_description: input.description,
    p_beneficiary_name: input.beneficiaryName || null,
    p_tax_amount: input.taxAmount || 0,
    p_cadence: input.cadence,
    p_next_run_date: input.nextRunDate,
    p_end_date: input.endDate || null,
    p_auto_submit: input.autoSubmit,
    p_active: input.active,
    p_notes: input.notes || null,
  });
  if (error) throw expenseControlError(error.message);
  return data;
}

export async function runDueRecurringExpenses(branchId: string) {
  const { data, error } = await client().rpc('run_due_recurring_expenses_v2', { p_branch_id: branchId });
  if (error) throw expenseControlError(error.message);
  return data as { generated: number; branch_id: string; ran_at: string };
}

export interface EmployeeAdvanceSettlement {
  id: string;
  settlement_type: 'expense_receipt' | 'cash_return';
  amount: number;
  category_id?: string | null;
  description: string;
  receipt_url?: string | null;
  invoice_number?: string | null;
  source_kind?: string | null;
  source_account_id?: string | null;
  provider_reference?: string | null;
  status: 'active' | 'reversed';
  settled_at: string;
}

export interface EmployeeAdvanceDocument {
  id: string;
  document_number: string;
  employee_id: string;
  employee_name: string;
  amount: number;
  paid_amount: number;
  settled_amount: number;
  advance_outstanding: number;
  undisbursed_amount: number;
  settlement_status: 'not_disbursed' | 'open' | 'settled';
  description: string;
  notes?: string | null;
  status: string;
  created_at: string;
  approved_at?: string | null;
  settlements: EmployeeAdvanceSettlement[];
}

export interface EmployeeAdvanceWorkspace {
  version: number;
  branch_id: string;
  summary: {
    requested_amount: number;
    disbursed_amount: number;
    unsettled_amount: number;
    open_advances: number;
  };
  documents: EmployeeAdvanceDocument[];
  employees: Array<{ user_id: string; employee_code: string; name: string; primary_branch_id?: string | null }>;
  payout_sources: ExpensePayoutSource[];
  expense_categories: Array<{ id: string; name_ar: string; group_name_ar: string; receipt_required_above: number }>;
  permissions: { can_manage: boolean };
}

export async function fetchEmployeeAdvanceWorkspace(branchId: string) {
  const { data, error } = await client().rpc('get_employee_advance_workspace_v2', { p_branch_id: branchId, p_limit: 200 });
  if (error) throw expenseControlError(error.message);
  const raw = (data || {}) as Record<string, any>;
  const summary = (raw.summary || {}) as Record<string, any>;
  return {
    ...raw,
    summary: {
      requested_amount: asNumber(summary.requested_amount),
      disbursed_amount: asNumber(summary.disbursed_amount),
      unsettled_amount: asNumber(summary.unsettled_amount),
      open_advances: asNumber(summary.open_advances),
    },
    documents: Array.isArray(raw.documents) ? raw.documents.map((item: Record<string, any>) => ({
      ...item,
      amount: asNumber(item.amount),
      paid_amount: asNumber(item.paid_amount),
      settled_amount: asNumber(item.settled_amount),
      advance_outstanding: asNumber(item.advance_outstanding),
      undisbursed_amount: asNumber(item.undisbursed_amount),
      settlements: Array.isArray(item.settlements) ? item.settlements.map((settlement: Record<string, any>) => ({ ...settlement, amount: asNumber(settlement.amount) })) : [],
    })) : [],
    employees: Array.isArray(raw.employees) ? raw.employees : [],
    payout_sources: Array.isArray(raw.payout_sources) ? raw.payout_sources.map((source: Record<string, any>) => ({ ...source, balance: asNumber(source.balance) })) : [],
    expense_categories: Array.isArray(raw.expense_categories) ? raw.expense_categories.map((category: Record<string, any>) => ({ ...category, receipt_required_above: asNumber(category.receipt_required_above) })) : [],
    permissions: { can_manage: raw.permissions?.can_manage === true },
  } as EmployeeAdvanceWorkspace;
}

export async function createEmployeeAdvanceRequest(input: { branchId: string; employeeId: string; amount: number; purpose: string; dueDate?: string; notes?: string }) {
  const { data, error } = await client().rpc('create_employee_advance_request_v2', {
    p_request_id: crypto.randomUUID(),
    p_branch_id: input.branchId,
    p_employee_id: input.employeeId,
    p_amount: input.amount,
    p_purpose: input.purpose,
    p_due_date: input.dueDate || null,
    p_notes: input.notes || null,
  });
  if (error) throw expenseControlError(error.message);
  return data;
}

export async function disburseEmployeeAdvance(input: { documentId: string; source: ExpensePayoutSource; amount: number; actualFee?: number; providerReference?: string; note?: string }) {
  const { data, error } = await client().rpc('disburse_employee_advance_v2', {
    p_request_id: crypto.randomUUID(),
    p_document_id: input.documentId,
    p_source_kind: input.source.source_kind,
    p_source_account_id: input.source.account_id,
    p_amount: input.amount,
    p_actual_fee: input.actualFee || 0,
    p_provider_reference: input.providerReference || null,
    p_note: input.note || null,
  });
  if (error) throw expenseControlError(error.message);
  return data;
}

export async function settleEmployeeAdvanceExpense(input: { documentId: string; categoryId: string; amount: number; description: string; receiptUrl?: string | null; invoiceNumber?: string; note?: string }) {
  const { data, error } = await client().rpc('settle_employee_advance_expense_v2', {
    p_request_id: crypto.randomUUID(),
    p_document_id: input.documentId,
    p_category_id: input.categoryId,
    p_amount: input.amount,
    p_description: input.description,
    p_receipt_url: input.receiptUrl || null,
    p_invoice_number: input.invoiceNumber || null,
    p_note: input.note || null,
  });
  if (error) throw expenseControlError(error.message);
  return data;
}

export async function settleEmployeeAdvanceReturn(input: { documentId: string; source: ExpensePayoutSource; amount: number; providerReference?: string; note?: string }) {
  const { data, error } = await client().rpc('settle_employee_advance_return_v2', {
    p_request_id: crypto.randomUUID(),
    p_document_id: input.documentId,
    p_source_kind: input.source.source_kind,
    p_source_account_id: input.source.account_id,
    p_amount: input.amount,
    p_provider_reference: input.providerReference || null,
    p_note: input.note || null,
  });
  if (error) throw expenseControlError(error.message);
  return data;
}

export interface ExpenseAnomaly {
  type: 'duplicate_invoice' | 'near_duplicate' | 'unusual_amount';
  severity: 'high' | 'normal';
  document_id: string;
  document_number: string;
  amount: number;
  category_name: string;
  beneficiary_name?: string | null;
  invoice_number?: string | null;
  created_at: string;
  message: string;
  related_documents: string[];
}

export interface ExpenseAnomalyWorkspace {
  version: number;
  branch_id: string;
  days: number;
  summary: { total: number; high: number; normal: number };
  anomalies: ExpenseAnomaly[];
  generated_at: string;
}

export async function fetchExpenseAnomalies(branchId: string, days = 120) {
  const { data, error } = await client().rpc('get_expense_anomalies_v2', { p_branch_id: branchId, p_days: days });
  if (error) throw expenseControlError(error.message);
  const raw = (data || {}) as Record<string, any>;
  const summary = (raw.summary || {}) as Record<string, any>;
  return {
    ...raw,
    summary: { total: asNumber(summary.total), high: asNumber(summary.high), normal: asNumber(summary.normal) },
    anomalies: Array.isArray(raw.anomalies) ? raw.anomalies.map((item: Record<string, any>) => ({ ...item, amount: asNumber(item.amount), related_documents: Array.isArray(item.related_documents) ? item.related_documents : [] })) : [],
  } as ExpenseAnomalyWorkspace;
}

export function expenseControlError(message: string) {
  const upper = message.toUpperCase();
  if (upper.includes('EXPENSE_BUDGET_MANAGE_DENIED')) return new Error('ليس لديك صلاحية إدارة موازنات المصروفات.');
  if (upper.includes('EXPENSE_RECURRING_MANAGE_DENIED')) return new Error('ليس لديك صلاحية إدارة المصروفات الدورية.');
  if (upper.includes('EXPENSE_ADVANCE_MANAGE_DENIED')) return new Error('ليس لديك صلاحية إدارة العهد والسلف.');
  if (upper.includes('EXPENSE_DRAFT_SUBMIT_DENIED')) return new Error('ليس لديك صلاحية إرسال هذه المسودة للاعتماد.');
  if (upper.includes('EXPENSE_NOT_DRAFT')) return new Error('المستند لم يعد مسودة. حدّث الصفحة وحاول مرة أخرى.');
  if (upper.includes('EMPLOYEE_NOT_ELIGIBLE')) return new Error('الموظف غير نشط أو غير مرتبط بهذا الفرع حاليًا.');
  if (upper.includes('EMPLOYEE_ADVANCE_NOT_DISBURSABLE')) return new Error('العهدة ليست في حالة تسمح بالصرف.');
  if (upper.includes('INVALID_ADVANCE_SETTLEMENT_AMOUNT')) return new Error('قيمة التسوية غير صحيحة أو أكبر من رصيد العهدة غير المسوّى.');
  if (upper.includes('ADVANCE_SETTLEMENT_CATEGORY_INVALID')) return new Error('اختر بند مصروف تشغيلي صالح لتسوية العهدة.');
  if (upper.includes('INVALID_ADVANCE_RETURN_SOURCE')) return new Error('اختر خزنة أو حسابًا ماليًا صالحًا لرد متبقي العهدة.');
  if (upper.includes('INVALID_EMPLOYEE_ADVANCE')) return new Error('بيانات طلب العهدة غير مكتملة أو القيمة غير صحيحة.');
  if (upper.includes('INVALID_RECURRING_EXPENSE')) return new Error('راجع قيمة المصروف الدوري، التكرار، وتواريخ البداية والنهاية.');
  if (upper.includes('INVALID_EXPENSE_BUDGET')) return new Error('راجع شهر الموازنة وقيمتها.');
  return friendlyExpenseError(message);
}
