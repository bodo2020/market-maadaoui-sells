import { supabase } from "@/integrations/supabase/client";

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export type InventoryControlStatus =
  | "all"
  | "healthy"
  | "low_stock"
  | "out_of_stock"
  | "overstock"
  | "no_movement"
  | "coverage_risk"
  | "alerts";

export type InventoryAdjustmentReason =
  | "manual_correction"
  | "receiving_correction"
  | "damage"
  | "breakage"
  | "loss"
  | "internal_use"
  | "opening_balance"
  | "other";

export interface InventoryControlSummaryV2 {
  sku_rows: number;
  linked_catalog_rows: number;
  unlinked_inventory_rows: number;
  positive_stock_rows: number;
  out_of_stock_rows: number;
  low_stock_rows: number;
  overstock_rows: number;
  alerting_rows: number;
  no_movement_rows: number;
  coverage_risk_rows: number;
  on_hand_measure: number;
  purchase_value: number;
  retail_value: number;
  potential_margin_value: number;
  active_audit_sessions: number;
  pending_audit_tasks: number;
  movement_ledger_rows: number;
  movement_ledger_started_at: string | null;
}

export interface InventoryControlProductV2 {
  product_id: string;
  linked_product: boolean;
  product_name: string;
  barcode: string | null;
  image_url: string | null;
  quantity: number;
  unit_of_measure: string;
  shelf_location: string | null;
  category_id: string | null;
  category_name: string;
  min_stock_level: number;
  max_stock_level: number | null;
  alert_enabled: boolean;
  purchase_price: number | null;
  sale_price: number | null;
  purchase_value: number;
  retail_value: number;
  sold_30d: number;
  returned_30d: number;
  net_sold_30d: number;
  days_cover: number | null;
  last_sale_at: string | null;
  last_audit_at: string | null;
  stock_status: Exclude<InventoryControlStatus, "all" | "alerts">;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  is_overstock: boolean;
  is_no_movement: boolean;
}

export interface InventoryMovementV2 {
  id: string;
  product_id: string;
  product_name: string;
  barcode: string | null;
  quantity_before: number;
  quantity_after: number;
  quantity_delta: number;
  actor_id: string | null;
  actor_name: string | null;
  changed_at: string;
  source: string;
  reason_code: string | null;
  note: string | null;
  operations_task_id: string | null;
  request_id: string | null;
}

export interface InventoryControlCategoryV2 {
  id: string;
  name: string;
  products: number;
}

export interface InventoryControlCenterV2 {
  version: number;
  branch_id: string;
  branch_name: string;
  inventory_source_branch_id: string;
  inventory_source_branch_name: string;
  pricing_source_branch_id: string;
  summary: InventoryControlSummaryV2;
  total_filtered: number;
  limit: number;
  offset: number;
  products: InventoryControlProductV2[];
  categories: InventoryControlCategoryV2[];
  recent_movements: InventoryMovementV2[];
  permissions: {
    can_manage: boolean;
    can_transfer: boolean;
    can_manage_sessions: boolean;
  };
  data_quality: {
    sales_window_days: number;
    movement_ledger_started_at: string | null;
    movement_ledger_is_historical_complete: boolean;
  };
}

export interface InventoryStockPolicyResultV2 {
  product_id: string;
  min_stock_level: number;
  max_stock_level: number | null;
  alert_enabled: boolean;
  updated_at: string | null;
}

export interface InventoryAdjustmentResultV2 {
  request_id: string;
  product_id: string;
  quantity_before: number;
  quantity_after: number;
  quantity_delta: number;
  reason_code: InventoryAdjustmentReason | string;
  note: string;
  idempotent: boolean;
}

function inventoryControlError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجّل الدخول مرة أخرى.");
  if (value.includes("INVENTORY_BRANCH_ACCESS_DENIED") || value.includes("BRANCH_ACCESS_DENIED")) return new Error("الفرع الحالي خارج نطاق صلاحيتك.");
  if (value.includes("INVENTORY_VIEW_DENIED")) return new Error("ليس لديك صلاحية عرض مركز المخزون.");
  if (value.includes("INVENTORY_MANAGE_DENIED")) return new Error("ليس لديك صلاحية تعديل المخزون.");
  if (value.includes("INVENTORY_ROW_MISSING")) return new Error("المنتج لا يملك رصيد مخزون في مصدر المخزون الحالي.");
  if (value.includes("INSUFFICIENT_STOCK")) return new Error("التسوية ستجعل الرصيد أقل من صفر، لذلك لم يتم تنفيذها.");
  if (value.includes("INVALID_MIN_STOCK_LEVEL")) return new Error("أدخل حدًا أدنى صحيحًا للمخزون.");
  if (value.includes("INVALID_MAX_STOCK_LEVEL")) return new Error("الحد الأقصى يجب أن يكون صحيحًا وألا يقل عن الحد الأدنى.");
  if (value.includes("INVALID_INVENTORY_ADJUSTMENT_REASON")) return new Error("اختر سببًا صحيحًا للتسوية.");
  if (value.includes("INVENTORY_ADJUSTMENT_NOTE_REQUIRED")) return new Error("اكتب ملاحظة واضحة للتسوية لا تقل عن 3 أحرف.");
  if (value.includes("INVALID_STOCK_CHANGE")) return new Error("أدخل تغييرًا صحيحًا للكمية بحد أقصى 3 منازل عشرية.");
  if (value.includes("REQUEST_CONFLICT")) return new Error("تعذر إعادة استخدام طلب التسوية لأن بياناته تغيرت. حدّث الصفحة وحاول من جديد.");
  if (value.includes("INVALID_INVENTORY_FILTER")) return new Error("فلتر حالة المخزون غير صحيح.");
  return new Error(message || "تعذر تنفيذ عملية المخزون.");
}

function normalizeMovement(row: Record<string, unknown>): InventoryMovementV2 {
  return {
    id: String(row.id || ""),
    product_id: String(row.product_id || ""),
    product_name: String(row.product_name || "منتج غير مرتبط"),
    barcode: row.barcode == null ? null : String(row.barcode),
    quantity_before: numberValue(row.quantity_before),
    quantity_after: numberValue(row.quantity_after),
    quantity_delta: numberValue(row.quantity_delta),
    actor_id: row.actor_id == null ? null : String(row.actor_id),
    actor_name: row.actor_name == null ? null : String(row.actor_name),
    changed_at: String(row.changed_at || ""),
    source: String(row.source || "inventory_quantity_update"),
    reason_code: row.reason_code == null ? null : String(row.reason_code),
    note: row.note == null ? null : String(row.note),
    operations_task_id: row.operations_task_id == null ? null : String(row.operations_task_id),
    request_id: row.request_id == null ? null : String(row.request_id),
  };
}

function normalizeProduct(row: Record<string, unknown>): InventoryControlProductV2 {
  return {
    product_id: String(row.product_id || ""),
    linked_product: Boolean(row.linked_product),
    product_name: String(row.product_name || "منتج غير مرتبط"),
    barcode: row.barcode == null ? null : String(row.barcode),
    image_url: row.image_url == null ? null : String(row.image_url),
    quantity: numberValue(row.quantity),
    unit_of_measure: String(row.unit_of_measure || "قطعة"),
    shelf_location: row.shelf_location == null ? null : String(row.shelf_location),
    category_id: row.category_id == null ? null : String(row.category_id),
    category_name: String(row.category_name || "بدون قسم"),
    min_stock_level: numberValue(row.min_stock_level),
    max_stock_level: nullableNumber(row.max_stock_level),
    alert_enabled: Boolean(row.alert_enabled),
    purchase_price: nullableNumber(row.purchase_price),
    sale_price: nullableNumber(row.sale_price),
    purchase_value: numberValue(row.purchase_value),
    retail_value: numberValue(row.retail_value),
    sold_30d: numberValue(row.sold_30d),
    returned_30d: numberValue(row.returned_30d),
    net_sold_30d: numberValue(row.net_sold_30d),
    days_cover: nullableNumber(row.days_cover),
    last_sale_at: row.last_sale_at == null ? null : String(row.last_sale_at),
    last_audit_at: row.last_audit_at == null ? null : String(row.last_audit_at),
    stock_status: String(row.stock_status || "healthy") as InventoryControlProductV2["stock_status"],
    is_low_stock: Boolean(row.is_low_stock),
    is_out_of_stock: Boolean(row.is_out_of_stock),
    is_overstock: Boolean(row.is_overstock),
    is_no_movement: Boolean(row.is_no_movement),
  };
}

export async function fetchInventoryControlCenterV2(
  branchId: string,
  options: {
    search?: string;
    status?: InventoryControlStatus;
    categoryId?: string | null;
    limit?: number;
    offset?: number;
  } = {},
): Promise<InventoryControlCenterV2> {
  const { data, error } = await rpc("get_inventory_control_center_v2", {
    p_branch_id: branchId,
    p_search: options.search?.trim() || null,
    p_status: options.status || "all",
    p_category_id: options.categoryId || null,
    p_limit: options.limit || 50,
    p_offset: options.offset || 0,
  });
  if (error) throw inventoryControlError(error.message);
  if (!data || typeof data !== "object") throw new Error("تعذر تحميل بيانات مركز المخزون.");

  const raw = data as Record<string, unknown>;
  const summary = (raw.summary || {}) as Record<string, unknown>;
  const permissions = (raw.permissions || {}) as Record<string, unknown>;
  const quality = (raw.data_quality || {}) as Record<string, unknown>;

  return {
    version: numberValue(raw.version) || 2,
    branch_id: String(raw.branch_id || branchId),
    branch_name: String(raw.branch_name || ""),
    inventory_source_branch_id: String(raw.inventory_source_branch_id || branchId),
    inventory_source_branch_name: String(raw.inventory_source_branch_name || raw.branch_name || ""),
    pricing_source_branch_id: String(raw.pricing_source_branch_id || branchId),
    summary: {
      sku_rows: numberValue(summary.sku_rows),
      linked_catalog_rows: numberValue(summary.linked_catalog_rows),
      unlinked_inventory_rows: numberValue(summary.unlinked_inventory_rows),
      positive_stock_rows: numberValue(summary.positive_stock_rows),
      out_of_stock_rows: numberValue(summary.out_of_stock_rows),
      low_stock_rows: numberValue(summary.low_stock_rows),
      overstock_rows: numberValue(summary.overstock_rows),
      alerting_rows: numberValue(summary.alerting_rows),
      no_movement_rows: numberValue(summary.no_movement_rows),
      coverage_risk_rows: numberValue(summary.coverage_risk_rows),
      on_hand_measure: numberValue(summary.on_hand_measure),
      purchase_value: numberValue(summary.purchase_value),
      retail_value: numberValue(summary.retail_value),
      potential_margin_value: numberValue(summary.potential_margin_value),
      active_audit_sessions: numberValue(summary.active_audit_sessions),
      pending_audit_tasks: numberValue(summary.pending_audit_tasks),
      movement_ledger_rows: numberValue(summary.movement_ledger_rows),
      movement_ledger_started_at: summary.movement_ledger_started_at == null ? null : String(summary.movement_ledger_started_at),
    },
    total_filtered: numberValue(raw.total_filtered),
    limit: numberValue(raw.limit) || options.limit || 50,
    offset: numberValue(raw.offset),
    products: Array.isArray(raw.products) ? raw.products.map((row) => normalizeProduct(row as Record<string, unknown>)) : [],
    categories: Array.isArray(raw.categories)
      ? raw.categories.map((row) => {
          const value = row as Record<string, unknown>;
          return { id: String(value.id || ""), name: String(value.name || "بدون قسم"), products: numberValue(value.products) };
        })
      : [],
    recent_movements: Array.isArray(raw.recent_movements)
      ? raw.recent_movements.map((row) => normalizeMovement(row as Record<string, unknown>))
      : [],
    permissions: {
      can_manage: Boolean(permissions.can_manage),
      can_transfer: Boolean(permissions.can_transfer),
      can_manage_sessions: Boolean(permissions.can_manage_sessions),
    },
    data_quality: {
      sales_window_days: numberValue(quality.sales_window_days) || 30,
      movement_ledger_started_at: quality.movement_ledger_started_at == null ? null : String(quality.movement_ledger_started_at),
      movement_ledger_is_historical_complete: Boolean(quality.movement_ledger_is_historical_complete),
    },
  };
}

export async function fetchInventoryProductMovementsV2(branchId: string, productId: string, limit = 100) {
  const { data, error } = await rpc("get_inventory_product_movements_v2", {
    p_branch_id: branchId,
    p_product_id: productId,
    p_limit: limit,
  });
  if (error) throw inventoryControlError(error.message);
  return Array.isArray(data) ? data.map((row) => normalizeMovement(row as Record<string, unknown>)) : [];
}

export async function setInventoryStockPolicyV2(
  branchId: string,
  productId: string,
  minStockLevel: number,
  maxStockLevel: number | null,
  alertEnabled: boolean,
): Promise<InventoryStockPolicyResultV2> {
  const { data, error } = await rpc("set_inventory_stock_policy_v2", {
    p_branch_id: branchId,
    p_product_id: productId,
    p_min_stock_level: minStockLevel,
    p_max_stock_level: maxStockLevel,
    p_alert_enabled: alertEnabled,
  });
  if (error) throw inventoryControlError(error.message);
  const raw = (data || {}) as Record<string, unknown>;
  return {
    product_id: String(raw.product_id || productId),
    min_stock_level: numberValue(raw.min_stock_level),
    max_stock_level: nullableNumber(raw.max_stock_level),
    alert_enabled: Boolean(raw.alert_enabled),
    updated_at: raw.updated_at == null ? null : String(raw.updated_at),
  };
}

export async function adjustInventoryStockV2(
  requestId: string,
  branchId: string,
  productId: string,
  delta: number,
  reasonCode: InventoryAdjustmentReason,
  note: string,
): Promise<InventoryAdjustmentResultV2> {
  const { data, error } = await rpc("adjust_inventory_stock_v2", {
    p_request_id: requestId,
    p_branch_id: branchId,
    p_product_id: productId,
    p_delta: delta,
    p_reason_code: reasonCode,
    p_note: note.trim(),
  });
  if (error) throw inventoryControlError(error.message);
  const raw = (data || {}) as Record<string, unknown>;
  return {
    request_id: String(raw.request_id || requestId),
    product_id: String(raw.product_id || productId),
    quantity_before: numberValue(raw.quantity_before),
    quantity_after: numberValue(raw.quantity_after),
    quantity_delta: numberValue(raw.quantity_delta),
    reason_code: String(raw.reason_code || reasonCode),
    note: String(raw.note || note),
    idempotent: Boolean(raw.idempotent),
  };
}
