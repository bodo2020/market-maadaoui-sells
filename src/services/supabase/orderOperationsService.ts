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
    dispatch_blocked_reason?: string | null;
    reprice_status?: string | null;
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


export type OrderGroupDispatchDriver = {
  id: string;
  name: string;
  availability: string;
  active_orders: number;
  distance_km: number | null;
  travel_minutes: number;
  score: number;
  last_location_at: string | null;
};

export type OrderGroupDispatchRecommendation = {
  group_id: string;
  route_id?: string | null;
  route_status?: string | null;
  lead_order_id?: string | null;
  active_store_count?: number;
  ready_store_count?: number;
  missing_eta_count?: number;
  all_active_ready?: boolean;
  prediction_complete?: boolean;
  predicted_group_ready_at?: string | null;
  dispatch_at?: string | null;
  dispatch_in_minutes?: number | null;
  dispatch_now?: boolean;
  can_assign?: boolean;
  dispatch_priority?: number;
  reason?: string;
  buffer_minutes?: number;
  route_distance_km?: number | null;
  route_estimated_minutes?: number | null;
  reprice_status?: string | null;
  first_pickup?: {
    branch_id?: string | null;
    branch_name?: string | null;
  } | null;
  recommended_driver?: OrderGroupDispatchDriver | null;
  assigned_driver?: {
    id: string;
    name?: string | null;
  } | null;
  candidates?: OrderGroupDispatchDriver[];
};

export type OrderGroupDispatchBoardPayload = {
  branch_id: string;
  items: OrderGroupDispatchRecommendation[];
  generated_at: string;
};

export async function fetchOrderGroupDispatchBoard(branchId: string, limit = 20) {
  const { data, error } = await (supabase.rpc as any)('get_order_group_dispatch_board_v1', {
    p_hub_branch_id: branchId,
    p_limit: limit,
  });
  if (error) {
    const messages: Record<string, string> = {
      AUTH_REQUIRED: 'سجّل الدخول مرة أخرى.',
      DISPATCH_VIEW_DENIED: 'الحساب الحالي لا يملك صلاحية عرض توصيات التوزيع.',
    };
    throw new Error(messages[error.message] || 'تعذر تحميل توصيات Smart Dispatch.');
  }
  return (data || { branch_id: branchId, items: [], generated_at: new Date().toISOString() }) as OrderGroupDispatchBoardPayload;
}

export type OrderGroupDispatchMode = 'shadow' | 'assisted' | 'auto';

export type OrderGroupDispatchPolicy = {
  branch_id: string;
  mode: OrderGroupDispatchMode;
  can_manage: boolean;
  policy_actor_id?: string | null;
  policy_actor_name?: string | null;
  actor_valid: boolean;
  updated_at?: string | null;
};

export async function fetchOrderGroupDispatchPolicy(branchId: string) {
  const { data, error } = await (supabase.rpc as any)('get_order_group_dispatch_policy_v1', {
    p_branch_id: branchId,
  });
  if (error) {
    const messages: Record<string, string> = {
      AUTH_REQUIRED: 'سجّل الدخول مرة أخرى.',
      DISPATCH_VIEW_DENIED: 'الحساب الحالي لا يملك صلاحية عرض سياسة التوزيع.',
    };
    throw new Error(messages[error.message] || 'تعذر تحميل سياسة Smart Dispatch.');
  }
  return (data || {
    branch_id: branchId,
    mode: 'assisted',
    can_manage: false,
    actor_valid: true,
  }) as OrderGroupDispatchPolicy;
}

export async function setOrderGroupDispatchPolicy(branchId: string, mode: OrderGroupDispatchMode) {
  const { data, error } = await (supabase.rpc as any)('set_order_group_dispatch_policy_v1', {
    p_branch_id: branchId,
    p_mode: mode,
  });
  if (error) {
    const messages: Record<string, string> = {
      AUTH_REQUIRED: 'سجّل الدخول مرة أخرى.',
      DISPATCH_MANAGE_DENIED: 'الحساب الحالي لا يملك صلاحية تغيير سياسة التوزيع.',
      INVALID_DISPATCH_MODE: 'وضع Smart Dispatch غير صالح.',
    };
    throw new Error(messages[error.message] || 'تعذر حفظ سياسة Smart Dispatch.');
  }
  return data as {
    ok: boolean;
    branch_id: string;
    mode: OrderGroupDispatchMode;
    policy_actor_id: string;
    actor_valid: boolean;
    updated_at: string;
  };
}

export type OrderGroupDispatchHealthIssue = {
  group_id: string;
  display_id: string;
  status: 'retrying' | 'needs_attention' | 'recovered' | 'healthy' | string;
  consecutive_failures: number;
  last_error_code?: string | null;
  last_error_message?: string | null;
  last_attempt_at?: string | null;
  last_success_at?: string | null;
  next_retry_at?: string | null;
  recovery_task_id?: string | null;
  task_status?: string | null;
  task_priority?: string | null;
  lead_order_id?: string | null;
};

export type OrderGroupDispatchHealthPayload = {
  branch_id: string;
  policy: {
    mode: OrderGroupDispatchMode;
    actor_id?: string | null;
    actor_valid: boolean;
    auto_paused_reason?: string | null;
    auto_paused_at?: string | null;
    updated_at?: string | null;
  };
  summary: {
    failing_groups?: number;
    needs_attention?: number;
    retrying?: number;
    recovered_last_24h?: number;
    open_tasks?: number;
    last_failure_at?: string | null;
  };
  issues: OrderGroupDispatchHealthIssue[];
  generated_at: string;
};

export async function fetchOrderGroupDispatchHealth(branchId: string, limit = 20) {
  const { data, error } = await (supabase.rpc as any)('get_order_group_dispatch_health_v1', {
    p_branch_id: branchId,
    p_limit: limit,
  });
  if (error) {
    const messages: Record<string, string> = {
      AUTH_REQUIRED: 'سجّل الدخول مرة أخرى.',
      DISPATCH_VIEW_DENIED: 'الحساب الحالي لا يملك صلاحية عرض صحة Smart Dispatch.',
    };
    throw new Error(messages[error.message] || 'تعذر تحميل حالة Smart Dispatch.');
  }
  return (data || {
    branch_id: branchId,
    policy: { mode: 'assisted', actor_valid: true },
    summary: {},
    issues: [],
    generated_at: new Date().toISOString(),
  }) as OrderGroupDispatchHealthPayload;
}

export type OrderGroupPickupIssue = {
  id: string;
  group_id: string;
  display_id: string;
  route_id: string;
  stop_id: string;
  stop_order: number;
  order_id: string;
  branch_id: string | null;
  branch_name: string | null;
  merchant_name: string | null;
  driver_user_id: string;
  driver_name: string | null;
  issue_type: 'store_closed' | 'order_not_ready' | 'order_mismatch' | 'pickup_access' | 'other' | string;
  note: string;
  status: 'open' | 'resolved' | 'cancelled' | string;
  task_id: string | null;
  task_status: string | null;
  task_priority: string | null;
  reported_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

export type OrderGroupPickupIssueBoardPayload = {
  branch_id: string;
  summary: {
    open?: number;
    resolved_last_24h?: number;
  };
  issues: OrderGroupPickupIssue[];
  generated_at: string;
};

export async function fetchOrderGroupPickupIssueBoard(branchId: string, limit = 50) {
  const { data, error } = await (supabase.rpc as any)('get_order_group_pickup_issue_board_v1', {
    p_branch_id: branchId,
    p_limit: limit,
  });
  if (error) {
    const messages: Record<string, string> = {
      AUTH_REQUIRED: 'سجّل الدخول مرة أخرى.',
      PICKUP_ISSUE_VIEW_DENIED: 'الحساب الحالي لا يملك صلاحية عرض مشاكل نقاط الاستلام.',
    };
    throw new Error(messages[error.message] || 'تعذر تحميل مشاكل نقاط الاستلام.');
  }
  return (data || {
    branch_id: branchId,
    summary: {},
    issues: [],
    generated_at: new Date().toISOString(),
  }) as OrderGroupPickupIssueBoardPayload;
}

export async function resolveOrderGroupPickupIssue(issueId: string, note?: string) {
  const { data, error } = await (supabase.rpc as any)('resolve_order_group_pickup_issue_v1', {
    p_issue_id: issueId,
    p_note: note?.trim() || null,
  });
  if (error) {
    const messages: Record<string, string> = {
      AUTH_REQUIRED: 'سجّل الدخول مرة أخرى.',
      PICKUP_ISSUE_NOT_FOUND: 'مشكلة نقطة الاستلام لم تعد موجودة.',
      PICKUP_ISSUE_NOT_OPEN: 'المشكلة اتقفلت بالفعل.',
      PICKUP_ISSUE_RESOLVE_DENIED: 'الحساب الحالي لا يملك صلاحية حل مشكلة نقطة الاستلام.',
      PICKUP_ISSUE_RESOLUTION_NOTE_INVALID: 'ملاحظة الحل يجب أن تكون من 3 إلى 500 حرف.',
    };
    throw new Error(messages[error.message] || 'تعذر حل مشكلة نقطة الاستلام.');
  }
  return data as {
    ok: boolean;
    idempotent: boolean;
    issue_id: string;
    group_id?: string;
    route_id?: string;
    stop_id?: string;
    status: 'resolved';
  };
}

export async function assignRecommendedOrderGroupDelivery(groupId: string) {
  const { data, error } = await (supabase.rpc as any)('assign_recommended_order_group_delivery_v1', {
    p_group_id: groupId,
    p_force: false,
  });
  if (error) {
    const messages: Record<string, string> = {
      AUTH_REQUIRED: 'سجّل الدخول مرة أخرى.',
      ORDER_GROUP_NOT_FOUND: 'الطلب المجمّع غير موجود.',
      DISPATCH_MANAGE_DENIED: 'الحساب الحالي لا يملك صلاحية تعيين المندوب.',
      GROUP_ROUTE_NOT_FOUND: 'مسار التوصيل غير جاهز.',
      GROUP_ROUTE_NOT_ASSIGNABLE: 'مسار التوصيل بدأ بالفعل أو لا يقبل تعيينًا جديدًا.',
      GROUP_REPRICE_REQUIRED: 'لازم يكتمل تحديث السعر والمسار قبل تعيين المندوب.',
      NO_AVAILABLE_DRIVER: 'لا يوجد مندوب متاح بموقع حديث حاليًا.',
      GROUP_READINESS_PREDICTION_INCOMPLETE: 'بيانات جاهزية بعض المتاجر غير مكتملة.',
      GROUP_DISPATCH_TOO_EARLY: 'لسه بدري على تحريك المندوب حسب جاهزية المتاجر.',
      GROUP_NO_ACTIVE_ORDERS: 'لا توجد طلبات نشطة داخل المجموعة.',
      GROUP_DISPATCH_POLICY_SHADOW: 'Smart Dispatch مضبوط على Shadow؛ التعيين اليدوي من التوصية متوقف.',
    };
    throw new Error(messages[error.message] || 'تعذر تعيين المندوب المقترح للمجموعة.');
  }
  return data as {
    ok: boolean;
    idempotent: boolean;
    group_id: string;
    route_id: string;
    delivery_user_id: string;
    recommendation?: OrderGroupDispatchRecommendation;
    assignment_count?: number;
    assignment?: {
      assignment_count?: number;
    };
  };
}

export async function repriceOrderGroup(groupId: string) {
  const { data, error } = await supabase.functions.invoke('order-group-reprice', {
    body: { group_id: groupId },
  });
  if (error || (data as { error?: string } | null)?.error) {
    const code = (data as { error?: string } | null)?.error || error?.message || '';
    const messages: Record<string, string> = {
      AUTH_REQUIRED: 'سجّل الدخول مرة أخرى.',
      ORDER_GROUP_REQUIRED: 'رقم الطلب المجمّع غير صالح.',
      ORDER_GROUP_OPERATION_DENIED: 'الحساب الحالي لا يملك صلاحية إعادة تسعير الطلب.',
      ORDER_GROUP_REPRICE_NOT_REQUIRED: 'الطلب لا يحتاج إعادة تسعير حاليًا.',
      ROAD_QUOTE_REQUIRED: 'تعذر تثبيت مسار التوصيل الجديد.',
      ROUTE_REPRICE_FAILED: 'تعذر حساب المسار الجديد. حاول مرة أخرى.',
      ORDER_GROUP_REPRICE_FAILED: 'تعذرت إعادة تسعير الطلب المجمّع.',
    };
    throw new Error(messages[code] || 'تعذر تحديث سعر ومسار الطلب المجمّع.');
  }
  return data as {
    ok: boolean;
    group_id: string;
    request_id: string;
    result?: { new_total?: number; status?: string };
  };
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
