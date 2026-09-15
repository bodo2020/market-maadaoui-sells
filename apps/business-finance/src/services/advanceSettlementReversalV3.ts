import { supabase } from '../lib/supabase';

function client() {
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ.');
  return supabase;
}

export async function reverseEmployeeAdvanceSettlement(settlementId: string, reason: string) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error('اكتب سبب عكس التسوية قبل المتابعة.');

  const { data, error } = await client().rpc('reverse_employee_advance_settlement_v2', {
    p_request_id: crypto.randomUUID(),
    p_settlement_id: settlementId,
    p_reason: normalizedReason,
  });

  if (error) {
    const upper = error.message.toUpperCase();
    if (upper.includes('ADVANCE_SETTLEMENT_ALREADY_REVERSED')) throw new Error('تم عكس هذه التسوية بالفعل. حدّث الصفحة.');
    if (upper.includes('INSUFFICIENT_CASH_FOR_ADVANCE_REVERSAL')) throw new Error('رصيد الخزنة الحالي لا يكفي لعكس رد العهدة. يلزم مراجعة المالية.');
    if (upper.includes('INSUFFICIENT_PAYMENT_BALANCE_FOR_ADVANCE_REVERSAL')) throw new Error('رصيد الحساب المالي الحالي لا يكفي لعكس رد العهدة. يلزم مراجعة المالية.');
    if (upper.includes('EXPENSE_ADVANCE_MANAGE_DENIED')) throw new Error('ليس لديك صلاحية عكس تسويات العهد والسلف.');
    if (upper.includes('REVERSAL_REASON_REQUIRED')) throw new Error('سبب العكس إلزامي.');
    throw new Error(error.message || 'تعذر عكس تسوية العهدة.');
  }

  return data as Record<string, unknown>;
}
