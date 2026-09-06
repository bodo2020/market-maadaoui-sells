import { supabase } from '@/integrations/supabase/client';
import type { Order } from '@/types';

const stages: Order['status'][] = ['pending','confirmed','preparing','ready','shipped','delivered'];
export const nextOrderStatus = (status: Order['status']) => stages[stages.indexOf(status)+1];
export function allowedOrderStatuses(status: Order['status']): Order['status'][] {
  if (status === 'delivered' || status === 'cancelled') return [status];
  return [status, nextOrderStatus(status), ...(status === 'shipped' ? [] : ['cancelled' as const])].filter(Boolean);
}
async function processOrder(args: Record<string, string | null>) {
  const { data, error } = await supabase.rpc('process_online_order' as never, args as never);
  if (error) {
    const messages: Record<string,string> = {
      INSUFFICIENT_STOCK: 'مخزون الفرع غير كافٍ. راجع الكميات قبل التسليم.',
      ORDER_STATUS_CHANGED: 'حالة الطلب اتغيّرت. حدّث الصفحة وراجعها قبل المتابعة.',
      INVALID_STATUS_TRANSITION: 'كمّل مراحل الطلب بالترتيب.',
      ORDER_BRANCH_REQUIRED: 'لازم يتحدد فرع الطلب قبل المتابعة.',
      ORDER_MANAGER_REQUIRED: 'الإجراء ده محتاج صلاحية مدير الطلبات.',
      PAYMENT_NOT_ALLOWED: 'لا يمكن تأكيد دفع طلب ملغي أو مسترد.',
      USE_RETURN_PROCESS: 'الطلب خرج للتوصيل؛ استخدم مسار المرتجعات.'
    };
    throw new Error(messages[error.message] || 'تعذّر تأكيد العملية. حدّث الطلب وأعد المحاولة.');
  }
  return data as unknown as Order;
}
export const changeOnlineOrderStatus = (id: string, expected: Order['status'], target: Order['status']) =>
  processOrder({p_order_id:id,p_action:'status',p_expected_status:expected,p_target_status:target});
export const confirmOnlineOrderPayment = (id: string, method: string, reference: string) =>
  processOrder({p_order_id:id,p_action:'payment',p_payment_method:method,p_payment_reference:reference.trim() || null});
