import { supabase } from '@/integrations/supabase/client';

export type FranchiseOperationsAgreement = {
  pricing_policy: 'central' | 'bounded' | 'independent';
  catalog_policy: 'central' | 'curated' | 'independent';
  promotion_policy: 'central' | 'approval_required' | 'independent';
  can_manage_inventory: boolean;
  max_discount_percentage: number;
  requires_order_approval: boolean;
};

export type FranchiseOperationsBranch = {
  id: string;
  name: string;
  code?: string | null;
  active: boolean;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  opens_at?: string | null;
  closes_at?: string | null;
  delivery_fee: number;
  min_order_amount: number;
  estimated_delivery_minutes?: number | null;
};

export type FranchiseOperationsProduct = {
  listing_id: string;
  product_id: string;
  name: string;
  barcode?: string | null;
  image_urls?: string[] | null;
  listing_status: string;
  customer_enabled: boolean;
  sale_price?: number | null;
  offer_price?: number | null;
  is_offer: boolean;
  quantity: number;
  min_stock_level: number;
  alert_enabled: boolean;
};

export type FranchiseOperationsOrder = {
  id: string;
  status: string;
  total: number;
  payment_status: string;
  payment_method?: string | null;
  items: unknown;
  created_at: string;
  updated_at: string;
};

export type FranchiseOperationRequest = {
  id: string;
  request_type: string;
  status: string;
  product_id?: string | null;
  order_id?: string | null;
  payload: Record<string, unknown>;
  task_id?: string | null;
  decision_note?: string | null;
  created_at: string;
  decided_at?: string | null;
  applied_at?: string | null;
  merchant_name?: string | null;
  branch_name?: string | null;
  product_name?: string | null;
};

export type FranchiseOperationsWorkspace = {
  merchant_id: string;
  role: 'owner' | 'admin' | 'manager';
  selected_branch_id: string;
  agreement: FranchiseOperationsAgreement;
  branches: FranchiseOperationsBranch[];
  products: FranchiseOperationsProduct[];
  orders: FranchiseOperationsOrder[];
  requests: FranchiseOperationRequest[];
};

export type FranchiseCatalogSearchItem = {
  product_id: string;
  name: string;
  barcode?: string | null;
  image_urls?: string[] | null;
  default_price: number;
  already_listed: boolean;
};

export type OperationMutationResult = {
  mode?: 'applied' | 'approval_required';
  request_id?: string;
  task_id?: string;
  status?: string;
  [key: string]: unknown;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function operationsError(message?: string) {
  const value = message || '';
  if (value.includes('AUTH_REQUIRED')) return new Error('انتهت جلسة تسجيل الدخول. سجّل الدخول مرة أخرى.');
  if (value.includes('FRANCHISE_PORTAL_ACCESS_DENIED')) return new Error('الحساب الحالي غير مصرح له بإدارة هذا الـFranchise.');
  if (value.includes('FRANCHISE_BRANCH_ACCESS_DENIED')) return new Error('الفرع خارج نطاق صلاحية حسابك.');
  if (value.includes('FRANCHISE_AGREEMENT_INACTIVE')) return new Error('عقد الـFranchise غير نشط حاليًا.');
  if (value.includes('FRANCHISE_INVENTORY_MANAGE_DENIED')) return new Error('العقد الحالي لا يسمح بإدارة المخزون من البوابة.');
  if (value.includes('FRANCHISE_SHARED_INVENTORY_MANAGED_CENTRALLY')) return new Error('مخزون هذا الفرع مركزي ولا يمكن تعديله من حساب الـFranchise.');
  if (value.includes('FRANCHISE_SHARED_PRICING_MANAGED_CENTRALLY')) return new Error('تسعير هذا الفرع مركزي ولا يمكن تعديله من حساب الـFranchise.');
  if (value.includes('FRANCHISE_PRODUCT_NOT_LISTED')) return new Error('المنتج غير مضاف إلى كتالوج هذا الفرع.');
  if (value.includes('INSUFFICIENT_STOCK')) return new Error('الرصيد غير كافٍ لإجراء هذا التعديل.');
  if (value.includes('FRANCHISE_ORDER_TRANSITION_NOT_ALLOWED')) return new Error('انتقال حالة الطلب غير مسموح من بوابة الـFranchise.');
  if (value.includes('ORDER_STATUS_CHANGED')) return new Error('حالة الطلب تغيّرت بالفعل. حدّث الصفحة وحاول مرة أخرى.');
  if (value.includes('BUSINESS_STRUCTURE_MANAGER_REQUIRED')) return new Error('تحتاج صلاحية إدارة شبكة الفروع لاتخاذ هذا القرار.');
  if (value.includes('DECISION_NOTE_REQUIRED')) return new Error('اكتب ملاحظة واضحة قبل تسجيل القرار.');
  return new Error(message || 'تعذر تنفيذ العملية.');
}

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) throw operationsError(error.message);
  return data as T;
}

export function fetchFranchiseOperationsWorkspace(
  merchantId: string,
  branchId?: string | null,
  search?: string | null,
  limit = 120,
) {
  return call<FranchiseOperationsWorkspace>('get_franchise_operations_workspace_v1', {
    p_merchant_id: merchantId,
    p_branch_id: branchId || null,
    p_search: search?.trim() || null,
    p_limit: limit,
  });
}

export function searchFranchiseCatalog(merchantId: string, branchId: string, search: string, limit = 30) {
  return call<FranchiseCatalogSearchItem[]>('search_franchise_catalog_v1', {
    p_merchant_id: merchantId,
    p_branch_id: branchId,
    p_search: search,
    p_limit: limit,
  });
}

export function adjustFranchiseInventory(input: {
  merchantId: string;
  branchId: string;
  productId: string;
  delta: number;
  reasonCode: string;
  note: string;
  requestId?: string;
}) {
  return call<OperationMutationResult>('adjust_franchise_inventory_v1', {
    p_request_id: input.requestId || crypto.randomUUID(),
    p_merchant_id: input.merchantId,
    p_branch_id: input.branchId,
    p_product_id: input.productId,
    p_delta: input.delta,
    p_reason_code: input.reasonCode,
    p_note: input.note,
  });
}

export function setFranchisePrice(input: {
  merchantId: string;
  branchId: string;
  productId: string;
  salePrice: number;
  offerPrice?: number | null;
  isOffer: boolean;
  note?: string | null;
}) {
  return call<OperationMutationResult>('set_franchise_price_v1', {
    p_merchant_id: input.merchantId,
    p_branch_id: input.branchId,
    p_product_id: input.productId,
    p_sale_price: input.salePrice,
    p_offer_price: input.offerPrice ?? null,
    p_is_offer: input.isOffer,
    p_note: input.note?.trim() || null,
  });
}

export function requestFranchiseCatalogChange(input: {
  merchantId: string;
  branchId: string;
  productId: string;
  action: 'add' | 'remove';
  salePrice?: number | null;
  note?: string | null;
}) {
  return call<OperationMutationResult>('request_franchise_catalog_change_v1', {
    p_merchant_id: input.merchantId,
    p_branch_id: input.branchId,
    p_product_id: input.productId,
    p_action: input.action,
    p_sale_price: input.salePrice ?? null,
    p_note: input.note?.trim() || null,
  });
}

export function requestFranchiseBranchSettings(input: {
  merchantId: string;
  branchId: string;
  settings: Record<string, unknown>;
  note?: string | null;
}) {
  return call<OperationMutationResult>('request_franchise_branch_settings_v1', {
    p_merchant_id: input.merchantId,
    p_branch_id: input.branchId,
    p_settings: input.settings,
    p_note: input.note?.trim() || null,
  });
}

export function advanceFranchiseOrder(input: {
  merchantId: string;
  orderId: string;
  targetStatus: string;
  note?: string | null;
}) {
  return call<OperationMutationResult>('advance_franchise_order_v1', {
    p_merchant_id: input.merchantId,
    p_order_id: input.orderId,
    p_target_status: input.targetStatus,
    p_note: input.note?.trim() || null,
  });
}

export function cancelMyFranchiseOperationRequest(requestId: string) {
  return call<FranchiseOperationRequest>('cancel_my_franchise_operation_request_v1', { p_request_id: requestId });
}

export function fetchFranchiseOperationRequest(requestId: string) {
  return call<FranchiseOperationRequest>('get_franchise_operation_request_v1', { p_request_id: requestId });
}

export function decideFranchiseOperation(requestId: string, decision: 'approve' | 'reject', note: string) {
  return call<FranchiseOperationRequest & { decision: string; idempotent: boolean }>('decide_franchise_operation_v1', {
    p_request_id: requestId,
    p_decision: decision,
    p_note: note,
  });
}
