import { supabase } from "@/integrations/supabase/client";

export type SupplierPurchasePermissions = {
  can_manage_purchases: boolean;
  can_manage_finance: boolean;
  can_manage_pricing: boolean;
};

export type SupplierSummary = {
  active_suppliers: number;
  payable_total: number;
  supplier_credit_total: number;
  open_purchases: number;
  overdue_purchases: number;
  month_purchases: number;
  legacy_unassigned_purchases?: number;
};

export type SupplierCenterSupplier = {
  id: string;
  code?: string | null;
  name: string;
  active: boolean;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_number?: string | null;
  commercial_registration?: string | null;
  payment_terms_days: number;
  credit_limit?: number | null;
  notes?: string | null;
  branch_balance: number;
  global_balance: number;
  purchases_count: number;
  open_invoices: number;
  last_purchase_at?: string | null;
  primary_representative?: SupplierRepresentative | null;
};

export type SupplierRepresentative = {
  id: string;
  branch_id: string;
  supplier_id: string;
  name: string;
  phone?: string | null;
  role_title?: string | null;
  active: boolean;
  can_receive_payments: boolean;
  payout_method?: string | null;
  payout_destination?: string | null;
  payment_limit?: number | null;
  notes?: string | null;
  is_primary?: boolean;
};

export type SupplierPurchaseItem = {
  id: string;
  product_id: string;
  product_name: string;
  barcode?: string | null;
  quantity: number;
  price: number;
  total: number;
  sale_price?: number | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  shelf_location?: string | null;
  notes?: string | null;
  returned_quantity: number;
};

export type SupplierPurchaseRow = {
  id: string;
  request_id?: string | null;
  supplier_id: string;
  supplier_name: string;
  invoice_number: string;
  date: string;
  due_date?: string | null;
  total: number;
  paid: number;
  returned_total: number;
  outstanding: number;
  status: "posted" | "voided";
  payment_status: "unpaid" | "partial" | "paid" | "voided";
  overdue: boolean;
  items_count: number;
  items: SupplierPurchaseItem[];
  description?: string | null;
  invoice_file_url?: string | null;
  posted_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  inventory_branch_id?: string | null;
  pricing_branch_id?: string | null;
};

export type SupplierPaymentSource = {
  id: string;
  name: string;
  balance: number;
  account_type?: string;
  custodian_user_id?: string | null;
  provider_code?: string;
  method_code?: string | null;
  method_name?: string | null;
  fee_type?: string | null;
  fee_value?: number | null;
  fee_bearer?: string | null;
  require_reference?: boolean | null;
};

export type SupplierPaymentRow = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  purchase_id?: string | null;
  invoice_number?: string | null;
  representative_id?: string | null;
  representative_name?: string | null;
  source_kind: "cash_account" | "payment_account";
  source_account_id: string;
  source_name: string;
  amount: number;
  expected_fee_amount: number;
  actual_fee_amount: number;
  provider_reference?: string | null;
  note?: string | null;
  status: "posted" | "voided";
  created_by_name?: string | null;
  created_at: string;
  voided_at?: string | null;
  void_reason?: string | null;
};

export type SupplierReturnRow = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  purchase_id: string;
  invoice_number: string;
  total: number;
  reason: string;
  note?: string | null;
  status: "posted" | "voided";
  created_at: string;
  created_by_name?: string | null;
};

export type SupplierPurchaseCenterV2 = {
  version: number;
  permissions: SupplierPurchasePermissions;
  summary: SupplierSummary;
  suppliers: SupplierCenterSupplier[];
  purchases: SupplierPurchaseRow[];
  representatives: SupplierRepresentative[];
  payment_sources: {
    cash_accounts: SupplierPaymentSource[];
    payment_accounts: SupplierPaymentSource[];
  };
  recent_payments: SupplierPaymentRow[];
  recent_returns: SupplierReturnRow[];
};

export type PurchaseDraftItem = {
  product_id: string;
  quantity: number;
  price: number;
  sale_price?: number | null;
  batch_number?: string | null;
  expiry_date?: string | null;
  shelf_location?: string | null;
  notes?: string | null;
};

export type SupplierLedgerEntry = {
  id: string;
  created_at: string;
  entry_type: string;
  signed_amount: number;
  running_balance?: number;
  description?: string | null;
  invoice_number?: string | null;
  purchase_id?: string | null;
  representative_name?: string | null;
  metadata?: Record<string, unknown>;
};

export type SupplierLedgerWorkspace = {
  supplier?: { id: string; name: string; balance?: number };
  branch_balance?: number;
  entries: SupplierLedgerEntry[];
};

type RpcError = { message?: string; details?: string; hint?: string; code?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;

const errorMap: Record<string, string> = {
  AUTH_REQUIRED: "يجب تسجيل الدخول أولاً.",
  PURCHASES_MANAGE_DENIED: "ليس لديك صلاحية إدارة المشتريات لهذا الفرع.",
  FINANCE_MANAGE_DENIED: "ليس لديك صلاحية تنفيذ المدفوعات المالية.",
  FINANCE_MANAGE_REQUIRED_FOR_PAYMENT: "إنشاء فاتورة بدفعة أولى يحتاج صلاحية إدارة المالية.",
  PRICING_MANAGE_REQUIRED: "تعديل سعر البيع يحتاج صلاحية إدارة الأسعار.",
  SUPPLIER_NOT_FOUND_OR_INACTIVE: "المورد غير موجود أو موقوف.",
  SUPPLIER_NAME_REQUIRED: "اسم المورد مطلوب.",
  REP_PAYMENT_NOT_ALLOWED: "هذا المندوب غير مصرح له باستلام المدفوعات.",
  REPRESENTATIVE_PAYMENT_NOT_ALLOWED: "هذا المندوب غير مصرح له باستلام المدفوعات.",
  REPRESENTATIVE_PAYMENT_LIMIT_EXCEEDED: "المبلغ يتجاوز حد الاستلام المسموح للمندوب.",
  PURCHASE_ITEMS_REQUIRED: "أضف صنفاً واحداً على الأقل للفاتورة.",
  INVALID_PURCHASE_ITEM: "راجع الكمية وسعر الشراء للأصناف.",
  EXPIRY_REQUIRED: "تاريخ الصلاحية مطلوب لهذا المنتج.",
  PURCHASE_TOTAL_MUST_BE_POSITIVE: "إجمالي الفاتورة يجب أن يكون أكبر من صفر.",
  INVALID_INITIAL_PAYMENT: "قيمة الدفعة الأولى غير صحيحة.",
  PAYMENT_SOURCE_REQUIRED: "اختر مصدر الدفع.",
  INSUFFICIENT_CASH_ACCOUNT_BALANCE: "الرصيد النقدي في المصدر غير كافٍ.",
  INSUFFICIENT_PAYMENT_ACCOUNT_BALANCE: "رصيد وسيلة الدفع غير كافٍ بعد احتساب العمولة.",
  PAYMENT_EXCEEDS_PURCHASE_OUTSTANDING: "المبلغ أكبر من المتبقي على الفاتورة.",
  PURCHASE_HAS_NO_OUTSTANDING: "لا يوجد مبلغ متبقٍ على هذه الفاتورة.",
  RETURN_EXCEEDS_PURCHASED_QUANTITY: "كمية المرتجع أكبر من الكمية المتاحة للرد.",
  INSUFFICIENT_INVENTORY_FOR_SUPPLIER_RETURN: "المخزون الحالي لا يكفي لتنفيذ مرتجع المورد.",
  PURCHASE_HAS_PAYMENTS_VOID_FIRST: "ألغِ المدفوعات المرتبطة أولاً قبل إلغاء الفاتورة.",
  PURCHASE_HAS_RETURNS_CANNOT_VOID: "لا يمكن إلغاء فاتورة عليها مرتجعات موردين.",
  INSUFFICIENT_INVENTORY_TO_VOID_PURCHASE: "لا يمكن إلغاء الفاتورة لأن جزءاً من مخزونها تم استهلاكه.",
  BATCH_ALREADY_CONSUMED_CANNOT_VOID: "لا يمكن إلغاء الفاتورة لأن دفعة الصلاحية استُهلك جزء منها.",
};

function throwRpc(error: RpcError): never {
  const raw = error?.message || "حدث خطأ غير متوقع";
  const key = Object.keys(errorMap).find((code) => raw.includes(code));
  const message = key ? errorMap[key] : raw;
  const err = new Error(message);
  (err as Error & { code?: string }).code = error?.code;
  throw err;
}

export async function fetchSupplierPurchaseCenterV2(branchId: string, limit = 180) {
  const { data, error } = await rpc("get_supplier_purchase_center_v2", { p_branch_id: branchId, p_limit: limit });
  if (error) throwRpc(error);
  return (data || {}) as SupplierPurchaseCenterV2;
}

export async function saveSupplierV2(branchId: string, input: Partial<SupplierCenterSupplier> & { name: string; id?: string | null }) {
  const { data, error } = await rpc("save_supplier_v2", {
    p_branch_id: branchId,
    p_supplier_id: input.id || null,
    p_name: input.name,
    p_code: input.code || null,
    p_contact_person: input.contact_person || null,
    p_phone: input.phone || null,
    p_email: input.email || null,
    p_address: input.address || null,
    p_tax_number: input.tax_number || null,
    p_commercial_registration: input.commercial_registration || null,
    p_payment_terms_days: Number(input.payment_terms_days || 0),
    p_credit_limit: input.credit_limit == null ? null : Number(input.credit_limit),
    p_notes: input.notes || null,
    p_active: input.active ?? true,
  });
  if (error) throwRpc(error);
  return data as SupplierCenterSupplier;
}

export async function saveSupplierRepresentativeV2(branchId: string, supplierId: string, input: Partial<SupplierRepresentative> & { name: string }) {
  const { data, error } = await rpc("save_supplier_representative_v2", {
    p_branch_id: branchId,
    p_supplier_id: supplierId,
    p_representative_id: input.id || null,
    p_name: input.name,
    p_phone: input.phone || null,
    p_role_title: input.role_title || null,
    p_active: input.active ?? true,
    p_can_receive_payments: input.can_receive_payments ?? false,
    p_payout_method: input.payout_method || null,
    p_payout_destination: input.payout_destination || null,
    p_payment_limit: input.payment_limit == null ? null : Number(input.payment_limit),
    p_notes: input.notes || null,
    p_is_primary: input.is_primary ?? false,
  });
  if (error) throwRpc(error);
  return data as SupplierRepresentative;
}

export async function createPurchaseV2(branchId: string, input: {
  supplier_id: string;
  invoice_number?: string;
  date: string;
  due_date?: string | null;
  description?: string;
  items: PurchaseDraftItem[];
  initial_payment?: number;
  payment_source_kind?: "cash_account" | "payment_account" | null;
  payment_source_account_id?: string | null;
  representative_id?: string | null;
  provider_reference?: string | null;
  actual_fee?: number | null;
  payment_note?: string | null;
  update_sale_prices?: boolean;
}) {
  const { data, error } = await rpc("create_purchase_v2", {
    p_request_id: crypto.randomUUID(),
    p_branch_id: branchId,
    p_supplier_id: input.supplier_id,
    p_invoice_number: input.invoice_number || null,
    p_date: new Date(input.date).toISOString(),
    p_due_date: input.due_date || null,
    p_description: input.description || null,
    p_items: input.items,
    p_initial_payment: Number(input.initial_payment || 0),
    p_payment_source_kind: input.payment_source_kind || null,
    p_payment_source_account_id: input.payment_source_account_id || null,
    p_representative_id: input.representative_id || null,
    p_provider_reference: input.provider_reference || null,
    p_actual_fee: input.actual_fee == null ? null : Number(input.actual_fee),
    p_payment_note: input.payment_note || null,
    p_update_sale_prices: input.update_sale_prices ?? false,
  });
  if (error) throwRpc(error);
  return data as { purchase: SupplierPurchaseRow; items_count: number; idempotent: boolean; inventory_branch_id?: string; pricing_branch_id?: string };
}

export async function paySupplierV2(branchId: string, input: {
  supplier_id: string;
  purchase_id?: string | null;
  source_kind: "cash_account" | "payment_account";
  source_account_id: string;
  amount: number;
  representative_id?: string | null;
  actual_fee?: number | null;
  provider_reference?: string | null;
  note?: string | null;
}) {
  const { data, error } = await rpc("pay_supplier_v2", {
    p_request_id: crypto.randomUUID(),
    p_branch_id: branchId,
    p_supplier_id: input.supplier_id,
    p_purchase_id: input.purchase_id || null,
    p_source_kind: input.source_kind,
    p_source_account_id: input.source_account_id,
    p_amount: Number(input.amount),
    p_representative_id: input.representative_id || null,
    p_actual_fee: input.actual_fee == null ? null : Number(input.actual_fee),
    p_provider_reference: input.provider_reference || null,
    p_note: input.note || null,
  });
  if (error) throwRpc(error);
  return data as Record<string, unknown>;
}

export async function voidSupplierPaymentV2(paymentId: string, reason: string) {
  const { data, error } = await rpc("void_supplier_payment_v2", { p_payment_id: paymentId, p_reason: reason });
  if (error) throwRpc(error);
  return data as SupplierPaymentRow;
}

export async function createSupplierReturnV2(purchaseId: string, items: Array<{ purchase_item_id: string; quantity: number }>, reason: string, note?: string) {
  const { data, error } = await rpc("create_supplier_purchase_return_v2", {
    p_request_id: crypto.randomUUID(), p_purchase_id: purchaseId, p_items: items, p_reason: reason, p_note: note || null,
  });
  if (error) throwRpc(error);
  return data as SupplierReturnRow;
}

export async function voidPurchaseV2(purchaseId: string, reason: string) {
  const { data, error } = await rpc("void_purchase_v2", { p_purchase_id: purchaseId, p_reason: reason });
  if (error) throwRpc(error);
  return data as SupplierPurchaseRow;
}

export async function fetchSupplierLedgerV1(branchId: string, supplierId: string, limit = 300) {
  const { data, error } = await rpc("get_supplier_ledger_v1", { p_branch_id: branchId, p_supplier_id: supplierId, p_limit: limit });
  if (error) throwRpc(error);
  return (data || { entries: [] }) as SupplierLedgerWorkspace;
}
