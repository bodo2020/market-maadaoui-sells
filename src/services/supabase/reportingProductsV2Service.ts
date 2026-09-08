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

export interface ReportingProductsSummaryV2 {
  products_sold: number;
  products_returned: number;
  item_revenue_before_loyalty: number;
  loyalty_allocated: number;
  recognized_revenue: number;
  returns_before_loyalty: number;
  return_loyalty_adjustment: number;
  returns: number;
  net_revenue: number;
  net_measure: number;
  unit_qty: number;
  bulk_qty: number;
  weight_qty: number;
  discounts: number;
  net_cogs: number | null;
  net_profit: number | null;
  margin_percent: number | null;
  authoritative_pos_net_revenue: number;
  reconciliation_difference: number;
}

export interface ReportingProductRowV2 {
  product_id: string;
  product_name: string;
  barcode: string | null;
  category_name: string;
  subcategory_name: string;
  invoices: number;
  sold_measure: number;
  net_measure: number;
  unit_qty: number;
  bulk_qty: number;
  weight_qty: number;
  discounts: number;
  item_revenue_before_loyalty: number;
  loyalty_allocated: number;
  recognized_revenue: number;
  returns: number;
  net_revenue: number;
  net_cogs: number | null;
  net_profit: number | null;
  margin_percent: number | null;
  contribution_percent: number;
  previous_net_revenue: number;
  revenue_change_percent: number | null;
}

export interface ReportingProductCategoryV2 {
  category_id: string;
  category_name: string;
  products: number;
  net_measure: number;
  net_revenue: number;
  net_profit: number | null;
  margin_percent: number | null;
  contribution_percent: number;
}

export interface ReportingProductSlowMoverV2 {
  product_id: string;
  product_name: string;
  barcode: string | null;
  invoices: number;
  sold_measure: number;
  recognized_revenue: number;
  stock_quantity: number;
}

export interface ReportingProductNoMovementV2 {
  product_id: string;
  product_name: string;
  barcode: string | null;
  stock_quantity: number;
  purchase_value: number;
  category_name: string;
}

export interface ReportingProductsV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  previous_from: string;
  previous_to: string;
  permissions: { can_view_profit: boolean };
  summary: ReportingProductsSummaryV2;
  products: ReportingProductRowV2[];
  categories: ReportingProductCategoryV2[];
  slow_movers: ReportingProductSlowMoverV2[];
  no_movement: ReportingProductNoMovementV2[];
  data_quality: {
    sales_source?: string;
    returns_source?: string;
    profit_source?: string;
    category_source?: string;
    invoice_reconciliation?: string;
    reconciliation_difference?: number;
    online_product_level_included?: boolean;
    online_reason?: string;
  };
}

interface RawProductsV2 {
  version?: RawNumber;
  branch_id?: string;
  from?: string;
  to?: string;
  previous_from?: string;
  previous_to?: string;
  permissions?: { can_view_profit?: boolean };
  summary?: Record<string, unknown>;
  products?: Array<Record<string, unknown>>;
  categories?: Array<Record<string, unknown>>;
  slow_movers?: Array<Record<string, unknown>>;
  no_movement?: Array<Record<string, unknown>>;
  data_quality?: Record<string, unknown>;
}

export async function fetchReportingProductsV2(
  branchId: string,
  from: Date,
  to: Date,
  limit = 100,
): Promise<ReportingProductsV2> {
  const { data, error } = await supabase.rpc("get_reporting_products_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_limit: limit,
  } as never);

  if (error) throw error;
  if (!data) throw new Error("REPORTING_PRODUCTS_EMPTY");

  const raw = data as unknown as RawProductsV2;
  const summary = raw.summary || {};

  return {
    version: n(raw.version) || 2,
    branch_id: raw.branch_id || branchId,
    from: raw.from || from.toISOString(),
    to: raw.to || to.toISOString(),
    previous_from: raw.previous_from || from.toISOString(),
    previous_to: raw.previous_to || from.toISOString(),
    permissions: { can_view_profit: Boolean(raw.permissions?.can_view_profit) },
    summary: {
      products_sold: n(summary.products_sold),
      products_returned: n(summary.products_returned),
      item_revenue_before_loyalty: n(summary.item_revenue_before_loyalty),
      loyalty_allocated: n(summary.loyalty_allocated),
      recognized_revenue: n(summary.recognized_revenue),
      returns_before_loyalty: n(summary.returns_before_loyalty),
      return_loyalty_adjustment: n(summary.return_loyalty_adjustment),
      returns: n(summary.returns),
      net_revenue: n(summary.net_revenue),
      net_measure: n(summary.net_measure),
      unit_qty: n(summary.unit_qty),
      bulk_qty: n(summary.bulk_qty),
      weight_qty: n(summary.weight_qty),
      discounts: n(summary.discounts),
      net_cogs: nullableNumber(summary.net_cogs),
      net_profit: nullableNumber(summary.net_profit),
      margin_percent: nullableNumber(summary.margin_percent),
      authoritative_pos_net_revenue: n(summary.authoritative_pos_net_revenue),
      reconciliation_difference: n(summary.reconciliation_difference),
    },
    products: (raw.products || []).map((row) => ({
      product_id: String(row.product_id || ""),
      product_name: String(row.product_name || "منتج غير متاح"),
      barcode: row.barcode == null ? null : String(row.barcode),
      category_name: String(row.category_name || "بدون قسم"),
      subcategory_name: String(row.subcategory_name || "بدون قسم فرعي"),
      invoices: n(row.invoices),
      sold_measure: n(row.sold_measure),
      net_measure: n(row.net_measure),
      unit_qty: n(row.unit_qty),
      bulk_qty: n(row.bulk_qty),
      weight_qty: n(row.weight_qty),
      discounts: n(row.discounts),
      item_revenue_before_loyalty: n(row.item_revenue_before_loyalty),
      loyalty_allocated: n(row.loyalty_allocated),
      recognized_revenue: n(row.recognized_revenue),
      returns: n(row.returns),
      net_revenue: n(row.net_revenue),
      net_cogs: nullableNumber(row.net_cogs),
      net_profit: nullableNumber(row.net_profit),
      margin_percent: nullableNumber(row.margin_percent),
      contribution_percent: n(row.contribution_percent),
      previous_net_revenue: n(row.previous_net_revenue),
      revenue_change_percent: nullableNumber(row.revenue_change_percent),
    })),
    categories: (raw.categories || []).map((row) => ({
      category_id: String(row.category_id || ""),
      category_name: String(row.category_name || "بدون قسم"),
      products: n(row.products),
      net_measure: n(row.net_measure),
      net_revenue: n(row.net_revenue),
      net_profit: nullableNumber(row.net_profit),
      margin_percent: nullableNumber(row.margin_percent),
      contribution_percent: n(row.contribution_percent),
    })),
    slow_movers: (raw.slow_movers || []).map((row) => ({
      product_id: String(row.product_id || ""),
      product_name: String(row.product_name || "منتج غير متاح"),
      barcode: row.barcode == null ? null : String(row.barcode),
      invoices: n(row.invoices),
      sold_measure: n(row.sold_measure),
      recognized_revenue: n(row.recognized_revenue),
      stock_quantity: n(row.stock_quantity),
    })),
    no_movement: (raw.no_movement || []).map((row) => ({
      product_id: String(row.product_id || ""),
      product_name: String(row.product_name || "منتج غير متاح"),
      barcode: row.barcode == null ? null : String(row.barcode),
      stock_quantity: n(row.stock_quantity),
      purchase_value: n(row.purchase_value),
      category_name: String(row.category_name || "بدون قسم"),
    })),
    data_quality: {
      sales_source: raw.data_quality?.sales_source == null ? undefined : String(raw.data_quality.sales_source),
      returns_source: raw.data_quality?.returns_source == null ? undefined : String(raw.data_quality.returns_source),
      profit_source: raw.data_quality?.profit_source == null ? undefined : String(raw.data_quality.profit_source),
      category_source: raw.data_quality?.category_source == null ? undefined : String(raw.data_quality.category_source),
      invoice_reconciliation: raw.data_quality?.invoice_reconciliation == null ? undefined : String(raw.data_quality.invoice_reconciliation),
      reconciliation_difference: raw.data_quality?.reconciliation_difference == null ? undefined : n(raw.data_quality.reconciliation_difference),
      online_product_level_included: raw.data_quality?.online_product_level_included == null ? undefined : Boolean(raw.data_quality.online_product_level_included),
      online_reason: raw.data_quality?.online_reason == null ? undefined : String(raw.data_quality.online_reason),
    },
  };
}
