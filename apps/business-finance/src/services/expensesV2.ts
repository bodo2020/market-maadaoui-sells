import { supabase } from '../lib/supabase';

export type ExpenseStatus = 'draft' | 'pending_approval' | 'approved' | 'partially_paid' | 'paid' | 'rejected' | 'cancelled' | 'voided';
export type ExpenseAccountingTreatment = 'opex' | 'capex' | 'prepaid' | 'employee_advance';
export type ExpenseSourceKind = 'branch_safe' | 'pos_drawer' | 'bank' | 'payment_account';

export interface ExpenseCategory {
  id: string;
  code: string;
  name_ar: string;
  group_name_ar: string;
  accounting_treatment: ExpenseAccountingTreatment;
  active: boolean;
  approval_required: boolean;
  require_independent_approval: boolean;
  auto_approve_limit: number;
  receipt_required_above: number;
  branch_id?: string | null;
}

export interface ExpensePayment {
  id: string;
  source_kind: ExpenseSourceKind;
  source_account_id: string;
  amount: number;
  fee_amount: number;
  provider_reference?: string | null;
  status: 'active' | 'reversed';
  paid_by: string;
  paid_by_name: string;
  paid_at: string;
  reverse_reason?: string | null;
}

export interface ExpenseDocument {
  id: string;
  document_number: string;
  branch_id: string;
  category_id: string;
  category_code: string;
  category_name: string;
  accounting_treatment: ExpenseAccountingTreatment;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  beneficiary_name?: string | null;
  invoice_number?: string | null;
  tax_amount: number;
  description: string;
  notes?: string | null;
  incurred_at: string;
  receipt_url?: string | null;
  source: 'business' | 'pos' | 'import';
  status: ExpenseStatus;
  requested_by: string;
  requested_by_name: string;
  approved_by?: string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  linked_expense_id?: string | null;
  pos_shift_id?: string | null;
  created_at: string;
  payments: ExpensePayment[];
}

export interface ExpensePayoutSource {
  account_id: string;
  source_kind: Exclude<ExpenseSourceKind, 'pos_drawer'>;
  name: string;
  currency: string;
  balance: number;
  account_type: string;
  provider_code?: string | null;
}

export interface ExpenseWorkspace {
  version: number;
  branch_id: string;
  summary: {
    total_documents: number;
    pending_approval: number;
    approved_unpaid: number;
    partially_paid: number;
    paid: number;
    recognized_amount: number;
    paid_amount: number;
    outstanding_amount: number;
  };
  categories: ExpenseCategory[];
  documents: ExpenseDocument[];
  payout_sources: ExpensePayoutSource[];
  permissions: {
    can_request: boolean;
    can_approve: boolean;
    can_pay: boolean;
    can_manage_categories: boolean;
  };
  generated_at: string;
}

function client() {
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ.');
  return supabase;
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeWorkspace(raw: unknown): ExpenseWorkspace {
  const data = (raw || {}) as Record<string, unknown>;
  const summary = (data.summary || {}) as Record<string, unknown>;
  const permissions = (data.permissions || {}) as Record<string, unknown>;
  return {
    version: asNumber(data.version),
    branch_id: String(data.branch_id || ''),
    summary: {
      total_documents: asNumber(summary.total_documents),
      pending_approval: asNumber(summary.pending_approval),
      approved_unpaid: asNumber(summary.approved_unpaid),
      partially_paid: asNumber(summary.partially_paid),
      paid: asNumber(summary.paid),
      recognized_amount: asNumber(summary.recognized_amount),
      paid_amount: asNumber(summary.paid_amount),
      outstanding_amount: asNumber(summary.outstanding_amount),
    },
    categories: Array.isArray(data.categories) ? data.categories as ExpenseCategory[] : [],
    documents: Array.isArray(data.documents) ? (data.documents as ExpenseDocument[]).map((item) => ({
      ...item,
      amount: asNumber(item.amount),
      paid_amount: asNumber(item.paid_amount),
      remaining_amount: asNumber(item.remaining_amount),
      tax_amount: asNumber(item.tax_amount),
      payments: Array.isArray(item.payments) ? item.payments.map((payment) => ({
        ...payment,
        amount: asNumber(payment.amount),
        fee_amount: asNumber(payment.fee_amount),
      })) : [],
    })) : [],
    payout_sources: Array.isArray(data.payout_sources) ? (data.payout_sources as ExpensePayoutSource[]).map((source) => ({ ...source, balance: asNumber(source.balance) })) : [],
    permissions: {
      can_request: permissions.can_request === true,
      can_approve: permissions.can_approve === true,
      can_pay: permissions.can_pay === true,
      can_manage_categories: permissions.can_manage_categories === true,
    },
    generated_at: String(data.generated_at || new Date().toISOString()),
  };
}

export async function fetchExpenseWorkspace(branchId: string, status?: ExpenseStatus | null) {
  const { data, error } = await client().rpc('get_expense_workspace_v2', {
    p_branch_id: branchId,
    p_status: status || null,
    p_limit: 200,
  });
  if (error) throw friendlyExpenseError(error.message);
  return normalizeWorkspace(data);
}

export interface CreateExpenseInput {
  branchId: string;
  categoryId: string;
  amount: number;
  description: string;
  beneficiaryName?: string;
  invoiceNumber?: string;
  taxAmount?: number;
  incurredAt?: string;
  receiptUrl?: string;
  notes?: string;
  submit?: boolean;
}

export async function createExpenseRequest(input: CreateExpenseInput) {
  const { data, error } = await client().rpc('create_expense_request_v2', {
    p_request_id: crypto.randomUUID(),
    p_branch_id: input.branchId,
    p_category_id: input.categoryId,
    p_amount: input.amount,
    p_description: input.description,
    p_beneficiary_name: input.beneficiaryName || null,
    p_invoice_number: input.invoiceNumber || null,
    p_tax_amount: input.taxAmount || 0,
    p_incurred_at: input.incurredAt || new Date().toISOString(),
    p_receipt_url: input.receiptUrl || null,
    p_notes: input.notes || null,
    p_submit: input.submit !== false,
  });
  if (error) throw friendlyExpenseError(error.message);
  return data as ExpenseDocument;
}

export async function decideExpenseRequest(documentId: string, decision: 'approve' | 'reject', note?: string) {
  const { data, error } = await client().rpc('decide_expense_request_v2', {
    p_document_id: documentId,
    p_decision: decision,
    p_note: note || null,
  });
  if (error) throw friendlyExpenseError(error.message);
  return data as ExpenseDocument;
}

export interface PayExpenseInput {
  documentId: string;
  source: ExpensePayoutSource;
  amount: number;
  actualFee?: number;
  providerReference?: string;
  note?: string;
}

export async function payExpense(input: PayExpenseInput) {
  const { data, error } = await client().rpc('pay_expense_v2', {
    p_request_id: crypto.randomUUID(),
    p_document_id: input.documentId,
    p_source_kind: input.source.source_kind,
    p_source_account_id: input.source.account_id,
    p_amount: input.amount,
    p_actual_fee: input.actualFee || 0,
    p_provider_reference: input.providerReference || null,
    p_note: input.note || null,
  });
  if (error) throw friendlyExpenseError(error.message);
  return data;
}

export async function reverseExpensePayment(paymentId: string, reason: string) {
  const { data, error } = await client().rpc('reverse_expense_payment_v2', {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) throw friendlyExpenseError(error.message);
  return data;
}

export async function voidExpenseRequest(documentId: string, reason: string) {
  const { data, error } = await client().rpc('void_expense_request_v2', {
    p_document_id: documentId,
    p_reason: reason,
  });
  if (error) throw friendlyExpenseError(error.message);
  return data;
}

export function friendlyExpenseError(message: string) {
  const code = message.toUpperCase();
  if (code.includes('EXPENSE_REQUEST_DENIED')) return new Error('ليس لديك صلاحية إنشاء طلب مصروف لهذا الفرع.');
  if (code.includes('EXPENSE_APPROVE_DENIED')) return new Error('ليس لديك صلاحية اعتماد المصروفات.');
  if (code.includes('EXPENSE_PAY_DENIED')) return new Error('ليس لديك صلاحية صرف المصروفات.');
  if (code.includes('EXPENSE_SELF_APPROVAL_DENIED')) return new Error('هذا البند يتطلب اعتماد شخص آخر، ولا يمكن اعتماد طلبك بنفسك.');
  if (code.includes('EXPENSE_RECEIPT_REQUIRED')) return new Error('هذا المصروف يتطلب إرفاق رابط إثبات/إيصال وفق سياسة البند.');
  if (code.includes('INSUFFICIENT_EXPENSE_SOURCE_BALANCE')) return new Error('الرصيد المتاح في مصدر الصرف لا يكفي لتنفيذ الدفعة.');
  if (code.includes('REVERSE_EXPENSE_PAYMENTS_FIRST')) return new Error('اعكس دفعات المصروف النشطة أولًا قبل إلغاء المستند.');
  if (code.includes('EXPENSE_NOT_PENDING_APPROVAL')) return new Error('المصروف لم يعد في حالة انتظار الاعتماد.');
  if (code.includes('EXPENSE_NOT_PAYABLE')) return new Error('المصروف غير جاهز للصرف حاليًا.');
  if (code.includes('INVALID_EXPENSE_PAYMENT_AMOUNT')) return new Error('قيمة الدفعة غير صحيحة أو أكبر من المتبقي.');
  if (code.includes('EMPLOYEE_ADVANCE_USE_DEDICATED_FLOW')) return new Error('العهد والسلف لها مسار تسوية مستقل ولا تُصرف كمصروف تشغيل عادي.');
  return new Error(message || 'تعذر تنفيذ عملية المصروف.');
}
