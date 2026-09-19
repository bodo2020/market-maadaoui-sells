import { supabase } from '@/integrations/supabase/client';
import type { Order } from '@/types';

const stages: Order['status'][] = ['pending','confirmed','preparing','ready','shipped','delivered'];
export const nextOrderStatus = (status: Order['status']) => stages[stages.indexOf(status)+1];
export function allowedOrderStatuses(status: Order['status']): Order['status'][] {
  if (status === 'delivered' || status === 'cancelled') return [status];
  return [status, nextOrderStatus(status), ...(status === 'shipped' ? [] : ['cancelled' as const])].filter(Boolean);
}

export type OrderGroupStoreOperation = {
  order_id: string;
  source_kind: 'owned' | 'marketplace';
  branch_id: string;
  branch_name: string;
  merchant_id: string;
  merchant_name: string;
  pickup_sequence: number | null;
  status: string;
  fulfillment_state: string | null;
  predicted_ready_at: string | null;
  ready_at: string | null;
  eta_risk: 'on_track' | 'at_risk' | 'late' | string;
  eta_live: string | null;
  updated_at: string | null;
};

export type OrderGroupControlTowerItem = {
  group_id: string;
  display_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  total: number;
  payment_method: string | null;
  payment_status: string;
  stores_count: number;
  partner_stores_count: number;
  route_distance_km: number | null;
  route_duration_minutes: number | null;
  customer_name: string;
  customer_phone: string;
  lead_order_id: string | null;
  operations: {
    stores_total?: number;
    stores_active?: number;
    pending?: number;
    confirmed?: number;
    preparing?: number;
    ready?: number;
    shipped?: number;
    delivered?: number;
    cancelled?: number;
    all_active_ready?: boolean;
    ready_for_dispatch?: boolean;
    partially_cancelled?: boolean;
    sla_risk?: 'on_track' | 'at_risk' | 'late' | string;
    late_stores?: number;
    at_risk_stores?: number;
    promised_ready_at?: string | null;
    live_ready_at?: string | null;
  };
  route: {
    id: string;
    status: string;
    assigned_driver_id: string | null;
    assigned_driver_name: string | null;
    distance_km: number | null;
    estimated_minutes: number | null;
  } | null;
  stores: OrderGroupStoreOperation[];
};

export type OrderGroupControlTowerPayload = {
  branch_id: string;
  summary: {
    active_groups?: number;
    pending?: number;
    confirmed?: number;
    preparing?: number;
    ready?: number;
    on_route?: number;
    at_risk?: number;
    late?: number;
    partially_cancelled?: number;
  };
  groups: OrderGroupControlTowerItem[];
  generated_at: string;
};

export async function fetchOrderGroupControlTower(branchId: string, limit = 100) {
  const { data, error } = await (supabase.rpc as any)('get_order_group_control_tower_v1', {
    p_hub_branch_id: branchId,
    p_limit: limit,
  });
  if (error) {
    const messages: Record<string, string> = {
      AUTH_REQUIRED: 'سجّل الدخول مرة أخرى.',
      BRANCH_REQUIRED: 'اختر الفرع المسؤول عن التوصيل.',
      ORDER_VIEW_DENIED: 'الحساب الحالي لا يملك صلاحية عرض مركز تشغيل الطلبات.',
    };
    throw new Error(messages[error.message] || 'تعذر تحميل الطلبات المجمعة.');
  }
  return (data || { branch_id: branchId, summary: {}, groups: [], generated_at: new Date().toISOString() }) as OrderGroupControlTowerPayload;
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
