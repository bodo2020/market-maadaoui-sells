import { supabase } from "@/integrations/supabase/client";

type RawNumber = number | string | null | undefined;
const n = (value: RawNumber) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumber = (value: unknown) => value == null ? null : n(value as RawNumber);

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function transferError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجّل الدخول مرة أخرى.");
  if (value.includes("TRANSFER_SOURCE_PERMISSION_DENIED") || value.includes("INVENTORY_TRANSFER_DENIED") || value.includes("TRANSFER_DISPATCH_DENIED") || value.includes("TRANSFER_RECEIVE_DENIED") || value.includes("TRANSFER_CANCEL_DENIED")) return new Error("ليس لديك صلاحية تنفيذ تحويل المخزون لهذا الفرع.");
  if (value.includes("TRANSFER_BRANCH_ACCESS_DENIED") || value.includes("INVENTORY_BRANCH_ACCESS_DENIED")) return new Error("ليس لديك صلاحية الوصول إلى مخزون هذا الفرع.");
  if (value.includes("TRANSFER_SHARED_INVENTORY_SOURCE") || value.includes("SAME_INVENTORY_SOURCE")) return new Error("الفرعان يستخدمان نفس مصدر المخزون؛ لا يلزم تحويل داخلي بينهما.");
  if (value.includes("TRANSFER_BRANCH_NOT_FOUND") || value.includes("TARGET_BRANCH_NOT_FOUND")) return new Error("فرع الوجهة غير متاح.");
  if (value.includes("TRANSFER_ITEMS_REQUIRED") || value.includes("TRANSFER_ITEM_COUNT_INVALID") || value.includes("TRANSFER_QUANTITY_INVALID") || value.includes("TRANSFER_PRODUCT_INVALID")) return new Error("راجع المنتجات والكميات قبل إنشاء التحويل.");
  if (value.includes("TRANSFER_DUPLICATE_PRODUCT")) return new Error("نفس المنتج مكرر داخل التحويل. اجمع الكمية في سطر واحد.");
  if (value.includes("TRANSFER_INSUFFICIENT_SOURCE_STOCK") || value.includes("TRANSFER_SOURCE_STOCK_CHANGED") || value.includes("INSUFFICIENT_STOCK")) return new Error("الرصيد الحالي لم يعد كافيًا. حدّث المخزون وراجع الكميات.");
  if (value.includes("TRANSFER_REQUEST_CONFLICT") || value.includes("REQUEST_CONFLICT")) return new Error("طلب التحويل تغيّر بعد الإرسال. حدّث الصفحة وأنشئ طلبًا جديدًا.");
  if (value.includes("TRANSFER_NOT_DISPATCHABLE")) return new Error("التحويل لم يعد في حالة تسمح بالشحن.");
  if (value.includes("TRANSFER_NOT_RECEIVABLE")) return new Error("التحويل لم يعد في حالة تسمح بالاستلام.");
  if (value.includes("TRANSFER_RECEIPT_ITEM_MISSING") || value.includes("TRANSFER_RECEIPT_UNKNOWN_PRODUCT") || value.includes("TRANSFER_RECEIPT_ITEMS_INVALID")) return new Error("بيانات الاستلام غير مكتملة أو تحتوي منتجًا غير موجود في التحويل.");
  if (value.includes("TRANSFER_RECEIPT_QUANTITY_INVALID")) return new Error("راجع الكميات المستلمة؛ يجب أن تكون أرقامًا موجبة أو صفر وبحد أقصى 3 منازل عشرية.");
  if (value.includes("TRANSFER_OVERAGE_SOURCE_STOCK_INSUFFICIENT")) return new Error("تم تسجيل كمية مستلمة أكبر من المشحونة لكن مخزون المصدر لا يكفي لتسوية الزيادة. راجع التحويل.");
  if (value.includes("TRANSFER_CANNOT_CANCEL_AFTER_DISPATCH")) return new Error("لا يمكن إلغاء التحويل بعد شحنه.");
  if (value.includes("TRANSFER_CANCEL_REASON_REQUIRED")) return new Error("اكتب سبب إلغاء واضحًا.");
  if (value.includes("TRANSFER_TASK_CLAIMED_BY_ANOTHER_USER")) return new Error("مهمة التحويل استلمها موظف آخر بالفعل.");
  return new Error(message || "تعذر تنفيذ عملية تحويل المخزون.");
}

export type InventoryTransferStatus = "requested" | "dispatched" | "received" | "received_with_variance" | "cancelled";

export interface InventoryTransferItemV2 {
  id: string;
  product_id: string;
  product_name: string;
  barcode: string | null;
  unit: string;
  quantity: number;
  received_quantity: number | null;
  variance_quantity: number | null;
  source_quantity_snapshot: number | null;
  unit_cost_snapshot: number | null;
}

export interface InventoryTransferV2 {
  id: string;
  transfer_number: string;
  from_branch_id: string;
  from_branch_name: string;
  to_branch_id: string;
  to_branch_name: string;
  status: InventoryTransferStatus;
  notes: string | null;
  created_at: string;
  requested_at: string | null;
  expected_arrival_date: string | null;
  dispatched_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  dispatch_note: string | null;
  receive_note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  dispatched_by: string | null;
  dispatched_by_name: string | null;
  received_by: string | null;
  received_by_name: string | null;
  direction: "outgoing" | "incoming";
  items: InventoryTransferItemV2[];
  items_count: number;
  total_measure: number;
  total_cost_value: number;
  has_variance: boolean;
  can_dispatch: boolean;
  can_receive: boolean;
  can_cancel: boolean;
}

export interface InventoryTransferTargetBranchV2 {
  id: string;
  name: string;
  inventory_source_branch_id: string;
}

export interface InventoryTransferWorkspaceV2 {
  version: number;
  branch_id: string;
  permissions: { can_transfer: boolean };
  summary: {
    requested: number;
    dispatched: number;
    received: number;
    received_with_variance: number;
    cancelled: number;
  };
  target_branches: InventoryTransferTargetBranchV2[];
  transfers: InventoryTransferV2[];
  data_quality: { legacy_transfer_rows: number; shared_inventory_targets_excluded: boolean };
}

export interface InventoryTransferProductV2 {
  product_id: string;
  name: string;
  barcode: string | null;
  quantity: number;
  unit_of_measure: string;
  shelf_location: string | null;
  image_url: string | null;
}

function parseItem(raw: Record<string, unknown>): InventoryTransferItemV2 {
  return {
    id: String(raw.id || ""),
    product_id: String(raw.product_id || ""),
    product_name: String(raw.product_name || "منتج غير متاح"),
    barcode: raw.barcode == null ? null : String(raw.barcode),
    unit: String(raw.unit || "قطعة"),
    quantity: n(raw.quantity as RawNumber),
    received_quantity: nullableNumber(raw.received_quantity),
    variance_quantity: nullableNumber(raw.variance_quantity),
    source_quantity_snapshot: nullableNumber(raw.source_quantity_snapshot),
    unit_cost_snapshot: nullableNumber(raw.unit_cost_snapshot),
  };
}

function parseTransfer(raw: Record<string, unknown>): InventoryTransferV2 {
  return {
    id: String(raw.id || ""),
    transfer_number: String(raw.transfer_number || `TR-${String(raw.id || "").slice(0, 8)}`),
    from_branch_id: String(raw.from_branch_id || ""),
    from_branch_name: String(raw.from_branch_name || "فرع غير متاح"),
    to_branch_id: String(raw.to_branch_id || ""),
    to_branch_name: String(raw.to_branch_name || "فرع غير متاح"),
    status: String(raw.status || "requested") as InventoryTransferStatus,
    notes: raw.notes == null ? null : String(raw.notes),
    created_at: String(raw.created_at || ""),
    requested_at: raw.requested_at == null ? null : String(raw.requested_at),
    expected_arrival_date: raw.expected_arrival_date == null ? null : String(raw.expected_arrival_date),
    dispatched_at: raw.dispatched_at == null ? null : String(raw.dispatched_at),
    received_at: raw.received_at == null ? null : String(raw.received_at),
    cancelled_at: raw.cancelled_at == null ? null : String(raw.cancelled_at),
    cancel_reason: raw.cancel_reason == null ? null : String(raw.cancel_reason),
    dispatch_note: raw.dispatch_note == null ? null : String(raw.dispatch_note),
    receive_note: raw.receive_note == null ? null : String(raw.receive_note),
    created_by: raw.created_by == null ? null : String(raw.created_by),
    created_by_name: raw.created_by_name == null ? null : String(raw.created_by_name),
    dispatched_by: raw.dispatched_by == null ? null : String(raw.dispatched_by),
    dispatched_by_name: raw.dispatched_by_name == null ? null : String(raw.dispatched_by_name),
    received_by: raw.received_by == null ? null : String(raw.received_by),
    received_by_name: raw.received_by_name == null ? null : String(raw.received_by_name),
    direction: raw.direction === "incoming" ? "incoming" : "outgoing",
    items: Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]).map(parseItem) : [],
    items_count: n(raw.items_count as RawNumber),
    total_measure: n(raw.total_measure as RawNumber),
    total_cost_value: n(raw.total_cost_value as RawNumber),
    has_variance: Boolean(raw.has_variance),
    can_dispatch: Boolean(raw.can_dispatch),
    can_receive: Boolean(raw.can_receive),
    can_cancel: Boolean(raw.can_cancel),
  };
}

export async function fetchInventoryTransferWorkspaceV2(
  branchId: string,
  status: "active" | "requested" | "dispatched" | "received" | "variance" | "cancelled" | "all" = "active",
  limit = 100,
): Promise<InventoryTransferWorkspaceV2> {
  const { data, error } = await rpc("get_inventory_transfer_workspace_v2", { p_branch_id: branchId, p_status: status, p_limit: limit });
  if (error) throw transferError(error.message);
  const raw = (data || {}) as Record<string, unknown>;
  const summary = (raw.summary || {}) as Record<string, unknown>;
  const permissions = (raw.permissions || {}) as Record<string, unknown>;
  const quality = (raw.data_quality || {}) as Record<string, unknown>;
  return {
    version: n(raw.version as RawNumber) || 2,
    branch_id: String(raw.branch_id || branchId),
    permissions: { can_transfer: Boolean(permissions.can_transfer) },
    summary: {
      requested: n(summary.requested as RawNumber),
      dispatched: n(summary.dispatched as RawNumber),
      received: n(summary.received as RawNumber),
      received_with_variance: n(summary.received_with_variance as RawNumber),
      cancelled: n(summary.cancelled as RawNumber),
    },
    target_branches: Array.isArray(raw.target_branches) ? (raw.target_branches as Record<string, unknown>[]).map((row) => ({
      id: String(row.id || ""),
      name: String(row.name || "فرع"),
      inventory_source_branch_id: String(row.inventory_source_branch_id || row.id || ""),
    })) : [],
    transfers: Array.isArray(raw.transfers) ? (raw.transfers as Record<string, unknown>[]).map(parseTransfer) : [],
    data_quality: {
      legacy_transfer_rows: n(quality.legacy_transfer_rows as RawNumber),
      shared_inventory_targets_excluded: Boolean(quality.shared_inventory_targets_excluded),
    },
  };
}

export async function searchInventoryTransferProductsV2(branchId: string, search = "", limit = 30): Promise<InventoryTransferProductV2[]> {
  const { data, error } = await rpc("search_inventory_transfer_products_v2", { p_branch_id: branchId, p_search: search.trim() || null, p_limit: limit });
  if (error) throw transferError(error.message);
  return Array.isArray(data) ? (data as Record<string, unknown>[]).map((row) => ({
    product_id: String(row.product_id || ""),
    name: String(row.name || "منتج"),
    barcode: row.barcode == null ? null : String(row.barcode),
    quantity: n(row.quantity as RawNumber),
    unit_of_measure: String(row.unit_of_measure || "قطعة"),
    shelf_location: row.shelf_location == null ? null : String(row.shelf_location),
    image_url: row.image_url == null ? null : String(row.image_url),
  })) : [];
}

export async function createInventoryTransferV2(input: {
  requestId: string;
  fromBranchId: string;
  toBranchId: string;
  items: Array<{ product_id: string; quantity: number }>;
  notes?: string;
  expectedArrivalDate?: string | null;
}) {
  const { data, error } = await rpc("create_inventory_transfer_v2", {
    p_request_id: input.requestId,
    p_from_branch_id: input.fromBranchId,
    p_to_branch_id: input.toBranchId,
    p_items: input.items,
    p_notes: input.notes?.trim() || null,
    p_expected_arrival_date: input.expectedArrivalDate || null,
  });
  if (error) throw transferError(error.message);
  return (data || {}) as { id: string; transfer_number: string; status: InventoryTransferStatus; task_id?: string; idempotent?: boolean };
}

export async function dispatchInventoryTransferV2(transferId: string, note?: string) {
  const { data, error } = await rpc("dispatch_inventory_transfer_v2", { p_transfer_id: transferId, p_note: note?.trim() || null });
  if (error) throw transferError(error.message);
  return (data || {}) as { id: string; transfer_number: string; status: InventoryTransferStatus; receive_task_id?: string; idempotent?: boolean };
}

export async function receiveInventoryTransferV2(
  transferId: string,
  items: Array<{ product_id: string; quantity: number }>,
  note?: string,
) {
  const { data, error } = await rpc("receive_inventory_transfer_v2", {
    p_transfer_id: transferId,
    p_receipt_items: items,
    p_note: note?.trim() || null,
  });
  if (error) throw transferError(error.message);
  return (data || {}) as { id: string; transfer_number: string; status: InventoryTransferStatus; has_variance?: boolean; variance_task_id?: string; idempotent?: boolean };
}

export async function cancelInventoryTransferV2(transferId: string, reason: string) {
  const { data, error } = await rpc("cancel_inventory_transfer_v2", { p_transfer_id: transferId, p_reason: reason.trim() });
  if (error) throw transferError(error.message);
  return (data || {}) as { id: string; transfer_number?: string; status: InventoryTransferStatus; idempotent?: boolean };
}
