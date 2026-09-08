import { supabase } from "@/integrations/supabase/client";

type RawNumber = number | string | null | undefined;

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export interface ReportingInventorySummaryV2 {
  inventory_rows: number;
  linked_catalog_rows: number;
  unlinked_inventory_rows: number;
  positive_stock_rows: number;
  out_of_stock_rows: number;
  low_stock_rows: number;
  overstock_rows: number;
  no_movement_rows: number;
  on_hand_measure: number;
  purchase_value: number;
  retail_value: number;
  potential_margin_value: number;
  purchase_price_coverage_rows: number;
  sale_price_coverage_rows: number;
  period_pos_sold_measure: number;
  period_pos_returned_measure: number;
  stock_turnover_available: boolean;
  stock_turnover_note: string;
}

export interface ReportingInventoryProductV2 {
  product_id: string;
  product_name: string;
  barcode: string | null;
  quantity: number;
  category_name: string;
  threshold?: number;
  purchase_value?: number;
  period_net_sold?: number;
  days_cover?: number | null;
}

export interface ReportingInventoryExpiryV2 {
  batch_id: string;
  product_id: string;
  product_name: string;
  batch_number: string | null;
  expiry_date: string;
  quantity: number;
  days_to_expiry: number;
  purchase_value: number;
}

export interface ReportingInventoryCategoryV2 {
  category_id: string;
  category_name: string;
  sku_rows: number;
  in_stock_rows: number;
  out_of_stock_rows: number;
  purchase_value: number;
  retail_value: number;
}

export interface ReportingInventoryStocktakeV2 {
  records: number;
  products_counted: number;
  difference_units: number;
  absolute_difference_units: number;
  difference_value: number;
  absolute_difference_value: number;
  latest_inventory_date: string | null;
}

export interface ReportingInventoryV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  snapshot_at: string;
  inventory_source_branch_id: string;
  pricing_source_branch_id: string;
  summary: ReportingInventorySummaryV2;
  low_stock: ReportingInventoryProductV2[];
  out_of_stock: ReportingInventoryProductV2[];
  no_movement: ReportingInventoryProductV2[];
  coverage_risk: ReportingInventoryProductV2[];
  near_expiry: ReportingInventoryExpiryV2[];
  categories: ReportingInventoryCategoryV2[];
  stocktake: ReportingInventoryStocktakeV2;
  data_quality: {
    inventory_source?: string;
    price_source?: string;
    movement_source?: string;
    online_item_movement_included?: boolean;
    damaged_products_included?: boolean;
    damaged_reason?: string;
    turnover_available?: boolean;
    turnover_reason?: string;
  };
}

interface RawInventoryV2 {
  version?: RawNumber;
  branch_id?: string;
  from?: string;
  to?: string;
  snapshot_at?: string;
  inventory_source_branch_id?: string;
  pricing_source_branch_id?: string;
  summary?: Record<string, unknown>;
  low_stock?: Array<Record<string, unknown>>;
  out_of_stock?: Array<Record<string, unknown>>;
  no_movement?: Array<Record<string, unknown>>;
  coverage_risk?: Array<Record<string, unknown>>;
  near_expiry?: Array<Record<string, unknown>>;
  categories?: Array<Record<string, unknown>>;
  stocktake?: Record<string, unknown>;
  data_quality?: Record<string, unknown>;
}

const productRow = (row: Record<string, unknown>): ReportingInventoryProductV2 => ({
  product_id: String(row.product_id || ""),
  product_name: String(row.product_name || "منتج غير متاح"),
  barcode: row.barcode == null ? null : String(row.barcode),
  quantity: n(row.quantity),
  category_name: String(row.category_name || "بدون قسم"),
  threshold: row.threshold == null ? undefined : n(row.threshold),
  purchase_value: row.purchase_value == null ? undefined : n(row.purchase_value),
  period_net_sold: row.period_net_sold == null ? undefined : n(row.period_net_sold),
  days_cover: row.days_cover == null ? null : nullableNumber(row.days_cover),
});

export async function fetchReportingInventoryV2(branchId: string, from: Date, to: Date): Promise<ReportingInventoryV2> {
  const { data, error } = await supabase.rpc("get_reporting_inventory_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  } as never);

  if (error) throw error;
  if (!data) throw new Error("REPORTING_INVENTORY_EMPTY");

  const raw = data as unknown as RawInventoryV2;
  const summary = raw.summary || {};
  const stocktake = raw.stocktake || {};

  return {
    version: n(raw.version) || 2,
    branch_id: raw.branch_id || branchId,
    from: raw.from || from.toISOString(),
    to: raw.to || to.toISOString(),
    snapshot_at: raw.snapshot_at || new Date().toISOString(),
    inventory_source_branch_id: raw.inventory_source_branch_id || branchId,
    pricing_source_branch_id: raw.pricing_source_branch_id || branchId,
    summary: {
      inventory_rows: n(summary.inventory_rows),
      linked_catalog_rows: n(summary.linked_catalog_rows),
      unlinked_inventory_rows: n(summary.unlinked_inventory_rows),
      positive_stock_rows: n(summary.positive_stock_rows),
      out_of_stock_rows: n(summary.out_of_stock_rows),
      low_stock_rows: n(summary.low_stock_rows),
      overstock_rows: n(summary.overstock_rows),
      no_movement_rows: n(summary.no_movement_rows),
      on_hand_measure: n(summary.on_hand_measure),
      purchase_value: n(summary.purchase_value),
      retail_value: n(summary.retail_value),
      potential_margin_value: n(summary.potential_margin_value),
      purchase_price_coverage_rows: n(summary.purchase_price_coverage_rows),
      sale_price_coverage_rows: n(summary.sale_price_coverage_rows),
      period_pos_sold_measure: n(summary.period_pos_sold_measure),
      period_pos_returned_measure: n(summary.period_pos_returned_measure),
      stock_turnover_available: Boolean(summary.stock_turnover_available),
      stock_turnover_note: String(summary.stock_turnover_note || ""),
    },
    low_stock: (raw.low_stock || []).map(productRow),
    out_of_stock: (raw.out_of_stock || []).map(productRow),
    no_movement: (raw.no_movement || []).map(productRow),
    coverage_risk: (raw.coverage_risk || []).map(productRow),
    near_expiry: (raw.near_expiry || []).map((row) => ({
      batch_id: String(row.batch_id || ""),
      product_id: String(row.product_id || ""),
      product_name: String(row.product_name || "منتج غير متاح"),
      batch_number: row.batch_number == null ? null : String(row.batch_number),
      expiry_date: String(row.expiry_date || ""),
      quantity: n(row.quantity),
      days_to_expiry: n(row.days_to_expiry),
      purchase_value: n(row.purchase_value),
    })),
    categories: (raw.categories || []).map((row) => ({
      category_id: String(row.category_id || ""),
      category_name: String(row.category_name || "بدون قسم"),
      sku_rows: n(row.sku_rows),
      in_stock_rows: n(row.in_stock_rows),
      out_of_stock_rows: n(row.out_of_stock_rows),
      purchase_value: n(row.purchase_value),
      retail_value: n(row.retail_value),
    })),
    stocktake: {
      records: n(stocktake.records),
      products_counted: n(stocktake.products_counted),
      difference_units: n(stocktake.difference_units),
      absolute_difference_units: n(stocktake.absolute_difference_units),
      difference_value: n(stocktake.difference_value),
      absolute_difference_value: n(stocktake.absolute_difference_value),
      latest_inventory_date: stocktake.latest_inventory_date == null ? null : String(stocktake.latest_inventory_date),
    },
    data_quality: {
      inventory_source: raw.data_quality?.inventory_source == null ? undefined : String(raw.data_quality.inventory_source),
      price_source: raw.data_quality?.price_source == null ? undefined : String(raw.data_quality.price_source),
      movement_source: raw.data_quality?.movement_source == null ? undefined : String(raw.data_quality.movement_source),
      online_item_movement_included: raw.data_quality?.online_item_movement_included == null ? undefined : Boolean(raw.data_quality.online_item_movement_included),
      damaged_products_included: raw.data_quality?.damaged_products_included == null ? undefined : Boolean(raw.data_quality.damaged_products_included),
      damaged_reason: raw.data_quality?.damaged_reason == null ? undefined : String(raw.data_quality.damaged_reason),
      turnover_available: raw.data_quality?.turnover_available == null ? undefined : Boolean(raw.data_quality.turnover_available),
      turnover_reason: raw.data_quality?.turnover_reason == null ? undefined : String(raw.data_quality.turnover_reason),
    },
  };
}
