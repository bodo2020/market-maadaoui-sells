import { supabase } from '../lib/supabase';
import type { ExpenseAccountingTreatment, ExpenseCategory } from './expensesV2';

export interface SaveExpenseCategoryInput {
  branchId: string;
  categoryId?: string | null;
  code: string;
  nameAr: string;
  groupNameAr: string;
  accountingTreatment: ExpenseAccountingTreatment;
  active: boolean;
  approvalRequired: boolean;
  requireIndependentApproval: boolean;
  autoApproveLimit: number;
  receiptRequiredAbove: number;
  notes?: string;
}

function client() {
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ.');
  return supabase;
}

export async function saveExpenseCategoryPolicy(input: SaveExpenseCategoryInput) {
  const { data, error } = await client().rpc('upsert_expense_category_v2', {
    p_branch_id: input.branchId,
    p_category_id: input.categoryId || null,
    p_code: input.code.trim(),
    p_name_ar: input.nameAr.trim(),
    p_group_name_ar: input.groupNameAr.trim(),
    p_accounting_treatment: input.accountingTreatment,
    p_active: input.active,
    p_approval_required: input.approvalRequired,
    p_require_independent_approval: input.requireIndependentApproval,
    p_auto_approve_limit: Math.max(0, input.autoApproveLimit || 0),
    p_receipt_required_above: Math.max(0, input.receiptRequiredAbove || 0),
    p_notes: input.notes?.trim() || null,
  });
  if (error) {
    const code = error.message.toUpperCase();
    if (code.includes('EXPENSE_CATEGORY_MANAGE_DENIED')) throw new Error('ليس لديك صلاحية إدارة بنود وسياسات المصروفات.');
    if (code.includes('EXPENSE_CATEGORY_DETAILS_REQUIRED')) throw new Error('اسم وكود بند المصروف مطلوبان.');
    if (code.includes('INVALID_ACCOUNTING_TREATMENT')) throw new Error('المعالجة المحاسبية المختارة غير صالحة.');
    if (code.includes('DUPLICATE') || code.includes('UNIQUE')) throw new Error('يوجد بند آخر بنفس الكود في هذا الفرع.');
    throw new Error(error.message || 'تعذر حفظ سياسة بند المصروف.');
  }
  return data as ExpenseCategory;
}
