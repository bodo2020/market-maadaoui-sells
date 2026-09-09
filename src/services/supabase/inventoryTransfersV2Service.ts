import { supabase } from "@/integrations/supabase/client";

type RawNumber = number | string | null | undefined;
const n = (value: RawNumber) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function transferError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجّل الدخول مرة أخرى.");
  if (value.includes("INVENTORY_TRANSFER_DENIED") || value.includes("INVENTORY_BRANCH_ACCESS_DENIED")) return new Error("ليس لديك صلاحية تحويل مخزون هذا الفرع.");
  if (value.includes("SAME_INVENTORY_SOURCE")) return new Error("الفرعان يستخدمان نفس مصدر المخزون؛ لا يلزم تحويل مخزون بينهما.");
  if (value.includes("TARGET_BRANCH_NOT_FOUND")) return new Error("فرع الوجهة غير متاح.");
  if (value.includes("INVALID_TRANSFER_ITEMS") || value.includes("INVALID_TRANSFER_ITEM")) return new Error("راجع المنتجات والكميات قبل إنشاء التحويل.");
  if (value.includes("INSUFFICIENT_STOCK")) return new Error("الرصيد الحالي لم يعد كافيًا لإتمام التحويل. حدّث البيانات وراجع الكميات.");
  if (value.includes("REQUEST_CONFLICT")) return new Error("طلب التحويل تغيّر بعد الإرسال. حدّث الصفحة وابدأ طلبًا جديدًا.");
  if (value.includes("TRANSFER_NOT_PENDING")) return new Error("التحويل لم يعد في حالة انتظار الشحن.");
  if (value.includes("TRANSFER_NOT_IN_TRANSIT")) return new Error("التحويل لم يعد في حالة شحن ولم يعد قابلًا للاستلام.");
  if (value.includes("INVALID_RECEIVED_QUANTITY")) return new Error("راجع الكمية المستلمة؛ يجب أن تكون بين صفر والكمية المشحونة.");
  if (value.includes("TRANSFER_RECEIPT_ITEM_COUNT_MISMATCH") || value.includes("TRANSFER_RECEIPT_UNKNOWN_ITEM")) return new Error("بيانات الاستلام غير مكتملة. حدّث التحويل وحاول مرة أخرى.");
  if (value.includes("ONLY_PENDING_TRANSFER_CAN_BE_CANCELLED")) return new Error("لا يمكن إلغاء التحويل بعد شحنه.");
  if (value.includes("CANCELLATION_REASON_REQUIRED")) return new Error("اكتب سبب إلغاء التحويل.");
  if (value.includes("TRANSFER_TASK_CLAIMED_BY_ANOTHER_USER")) return new Error("مهمة التحويل استلمها موظف آخر بالفعل.");
  return new Error(message || "تعذر تنفيذ عملية تحويل المخزون.");
}

export type InventoryTransferStatus = "pending" | "in_transit" | "completed" | "cancelled";

export interface InventoryTransferItemV2 {
  id: string;
  product_id: string;
  product_name: string;
  barcode: string | null;
  unit_of_measure: string;
  quantity: number;
  dispatched_quantity: number | null;
  received_quantity: number | null;
  variance_quantity: number | null;
  source_quantity_before: number | null;
  source_quantity_after: number | null;
  target_quantity_before: number | null;
  target_quantity_after: number | null;
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
  source_inventory_branch_id: string;
  target_inventory_branch_id: string;
  status: InventoryTransferStatus;
  transfer_type: string;
  notes: string | null;
  expected_arrival_date: string | null;
  actual_arrival_date: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  dispatched_by: string | null;
  dispatched_by_name: string | null;
  dispatched_at: string | null;
  received_by: string | null;
  received_by_name: string | null;
  received_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: InventoryTransferItemV2[];
}

export interface InventoryTransferTargetBranchV2 {
  id: string;
  name: string;
  inventory_branch_id: string;
}

export interface InventoryTransferWorkspaceV2 {
  branch_id: string;
  inventory_branch_id: string;
  permissions: { can_transfer: boolean };
  summary: { pending: number; in_transit_out: number; in_transit_in: number; completed_30d: number };
  target_branches: InventoryTransferTargetBranchV2[];
  transfers: InventoryTransferV2[];
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
  const nullable = (value: unknown) => value == null ? null : n(value as RawNumber);
  return {
    id: String(raw.id || ""),
    product_id: String(raw.product_id || ""),
    product_name: String(raw.product_name || "منتج غير متاح"),
    barcode: raw.barcode == null ? null : String(raw.barcode),
    unit_of_measure: String(raw.unit_of_measure || "قطعة"),
    quantity: n(raw.quantity as RawNumber),
    dispatched_quantity: nullable(raw.dispatched_quantity),
    received_quantity: nullable(raw.received_quantity),
    variance_quantity: nullable(raw.variance_quantity),
    source_quantity_before: nullable(raw.source_quantity_before),
    source_quantity_after: nullable(raw.source_quantity_after),
    target_quantity_before: nullable(raw.target_quantity_before),
    target_quantity_after: nullable(raw.target_quantity_after),
    source_quantity_snapshot: nullable(raw.source_quantity_snapshot),
    unit_cost_snapshot: nullable(raw.unit_cost_snapshot),
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
    source_inventory_branch_id: String(raw.source_inventory_branch_id || ""),
    target_inventory_branch_id: String(raw.target_inventory_branch_id || ""),
    status: String(raw.status || "pending") as InventoryTransferStatus,
    transfer_type: String(raw.transfer_type || "manual"),
    notes: raw.notes == null ? null : String(raw.notes),
    expected_arrival_date: raw.expected_arrival_date == null ? null : String(raw.expected_arrival_date),
    actual_arrival_date: raw.actual_arrival_date == null ? null : String(raw.actual_arrival_date),
    created_by: raw.created_by == null ? null : String(raw.created_by),
    created_by_name: raw.created_by_name == null ? null : String(raw.created_by_name),
    created_at: String(raw.created_at || ""),
    dispatched_by: raw.dispatched_by == null ? null : String(raw.dispatched_by),
    dispatched_by_name: raw.dispatched_by_name == null ? null : String(raw.dispatched_by_name),
    dispatched_at: raw.dispatched_at == null ? null : String(raw.dispatched_at),
    received_by: raw.received_by == null ? null : String(raw.received_by),
    received_by_name: raw.received_by_name == null ? null : String(raw.received_by_name),
    received_at: raw.received_at == null ? null : String(raw.received_at),
    cancelled_by: raw.cancelled_by == null ? null : String(raw.cancelled_by),
    cancelled_at: raw.cancelled_at == null ? null : String(raw.cancelled_at),
    cancellation_reason: raw.cancellation_reason == null ? null : String(raw.cancellation_reason),
    items: Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]).map(parseItem) : [],
  };
}

export async function fetchInventoryTransferWorkspaceV2(branchId: string, limit = 100): Promise<InventoryTransferWorkspaceV2> {
  const { data, error } = await rpc("get_inventory_transfer_workspace_v2", { p_branch_id: branchId, p_limit: limit });
  if (error) throw transferError(error.message);
  const raw = (data || {}) as Record<string, unknown>;
  const summary = (raw.summary || {}) as Record<string, unknown>;
  const permissions = (raw.permissions || {}) as Record<string, unknown>;
  return {
    branch_id: String(raw.branch_id || branchId),
    inventory_branch_id: String(raw.inventory_branch_id || branchId),
    permissions: { can_transfer: Boolean(permissions.can_transfer) },
    summary: {
      pending: n(summary.pending as RawNumber),
      in_transit_out: n(summary.in_transit_out as RawNumber),
      in_transit_in: n(summary.in_transit_in as RawNumber),
      completed_30d: n(summary.completed_30d as RawNumber),
    },
    target_branches: Array.isArray(raw.target_branches) ? (raw.target_branches as Record<string, unknown>[]).map((row) => ({
      id: String(row.id || ""), name: String(row.name || "فرع"), inventory_branch_id: String(row.inventory_branch_id || row.id || ""),
    })) : [],
    transfers: Array.isArray(raw.transfers) ? (raw.transfers as Record<string, unknown>[]).map(parseTransfer) : [],
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
  requestId: string; fromBranchId: string; toBranchId: string;
  items: Array<{ product_id: string; quantity: number }>;
  notes?: string; expectedArrivalDate?: string | null;
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
  return parseTransfer((data || {}) as Record<string, unknown>);
}

export async function dispatchInventoryTransferV2(transferId: string, requestId: string) {
  const { data, error } = await rpc("dispatch_inventory_transfer_v2", { p_transfer_id: transferId, p_request_id: requestId });
  if (error) throw transferError(error.message);
  return parseTransfer((data || {}) as Record<string, unknown>);
}

export async function receiveInventoryTransferV2(
  transferId: string,
  requestId: string,
  items: Array<{ item_id: string; received_quantity: number }>,
  note?: string,
) {
  const { data, error } = await rpc("receive_inventory_transfer_v2", {
    p_transfer_id: transferId, p_request_id: requestId, p_items: items, p_note: note?.trim() || null,
  });
  if (error) throw transferError(error.message);
  return parseTransfer((data || {}) as Record<string, unknown>);
}

export async function cancelInventoryTransferV2(transferId: string, reason: string) {
  const { data, error } = await rpc("cancel_inventory_transfer_v2", { p_transfer_id: transferId, p_reason: reason.trim() });
  if (error) throw transferError(error.message);
  return parseTransfer((data || {}) as Record<string, unknown>);
}
