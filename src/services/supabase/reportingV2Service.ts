import { supabase } from "@/integrations/supabase/client";

export interface ReportingMetricsV2 {
  pos_transactions: number;
  online_transactions: number;
  transactions: number;
  pos_gross_sales: number;
  online_gross_sales: number;
  gross_sales: number;
  product_discounts: number;
  loyalty_discounts: number;
  returns: number;
  return_count: number;
  pos_net_sales: number;
  online_net_sales: number;
  net_sales: number;
  average_ticket: number;
  items_sold: number;
  merchant_payment_fees: number;
  customer_payment_fees: number;
  expenses: number;
  can_view_profit: boolean;
  profit_scope: "pos_only" | string;
  online_profit_complete: boolean;
  pos_net_cogs: number | null;
  pos_gross_profit: number | null;
  pos_profit_after_payment_fees: number | null;
  known_operating_result: number | null;
}

export interface ReportingDailyPointV2 {
  date: string;
  pos_sales: number;
  online_sales: number;
  returns: number;
  net_sales: number;
}

export interface ReportingPaymentV2 {
  code: string;
  name: string;
  method_type: string;
  sale_count: number;
  gross_collected: number;
  refunds: number;
  net_collected: number;
  customer_fees: number;
  merchant_fees: number;
}

export interface ReportingTopProductV2 {
  product_id: string | null;
  product_name: string;
  quantity: number;
  revenue: number;
  profit: number | null;
}

export interface ReportingOverviewV2 {
  version: number;
  branch_id: string;
  branch_name?: string;
  from: string;
  to: string;
  previous_from: string;
  previous_to: string;
  current: ReportingMetricsV2;
  previous: ReportingMetricsV2;
  daily: ReportingDailyPointV2[];
  payments: ReportingPaymentV2[];
  top_products: ReportingTopProductV2[];
  data_quality: {
    pos_source: string;
    pos_profit_source: string;
    returns_source: string;
    online_revenue_source: string;
    online_profit_complete: boolean;
  };
}

const toNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeMetrics = (row: ReportingMetricsV2): ReportingMetricsV2 => ({
  ...row,
  pos_transactions: toNumber(row.pos_transactions),
  online_transactions: toNumber(row.online_transactions),
  transactions: toNumber(row.transactions),
  pos_gross_sales: toNumber(row.pos_gross_sales),
  online_gross_sales: toNumber(row.online_gross_sales),
  gross_sales: toNumber(row.gross_sales),
  product_discounts: toNumber(row.product_discounts),
  loyalty_discounts: toNumber(row.loyalty_discounts),
  returns: toNumber(row.returns),
  return_count: toNumber(row.return_count),
  pos_net_sales: toNumber(row.pos_net_sales),
  online_net_sales: toNumber(row.online_net_sales),
  net_sales: toNumber(row.net_sales),
  average_ticket: toNumber(row.average_ticket),
  items_sold: toNumber(row.items_sold),
  merchant_payment_fees: toNumber(row.merchant_payment_fees),
  customer_payment_fees: toNumber(row.customer_payment_fees),
  expenses: toNumber(row.expenses),
  can_view_profit: Boolean(row.can_view_profit),
  profit_scope: row.profit_scope || "pos_only",
  online_profit_complete: Boolean(row.online_profit_complete),
  pos_net_cogs: toNullableNumber(row.pos_net_cogs),
  pos_gross_profit: toNullableNumber(row.pos_gross_profit),
  pos_profit_after_payment_fees: toNullableNumber(row.pos_profit_after_payment_fees),
  known_operating_result: toNullableNumber(row.known_operating_result),
});

const defaultPaymentName = (code: string, type: string) => {
  const normalized = code.toLowerCase();
  if (normalized === "cash") return "نقدي";
  if (normalized === "card") return "بطاقة بنكية";
  if (normalized === "mixed") return "دفع مختلط";
  if (normalized === "instapay") return "انستا باي";
  if (normalized.includes("vodafone")) return "فودافون كاش";
  if (type === "digital_wallet") return "محفظة رقمية";
  if (type === "bank_transfer") return "تحويل بنكي";
  return "وسيلة دفع";
};

function normalizePayments(rows: ReportingPaymentV2[] = []): ReportingPaymentV2[] {
  const grouped = new Map<string, ReportingPaymentV2>();

  rows.forEach((row) => {
    const code = (row.code || "other").toLowerCase();
    const inferredType =
      code === "cash" ? "cash" :
      code === "card" ? "card" :
      code === "mixed" ? "mixed" :
      row.method_type || "other";
    const fallbackName = defaultPaymentName(code, inferredType);
    const name = !row.name || row.name === "وسيلة دفع" ? fallbackName : row.name;
    const existing = grouped.get(code);

    if (!existing) {
      grouped.set(code, {
        ...row,
        code,
        name,
        method_type: inferredType,
        sale_count: toNumber(row.sale_count),
        gross_collected: toNumber(row.gross_collected),
        refunds: toNumber(row.refunds),
        net_collected: toNumber(row.net_collected),
        customer_fees: toNumber(row.customer_fees),
        merchant_fees: toNumber(row.merchant_fees),
      });
      return;
    }

    existing.sale_count += toNumber(row.sale_count);
    existing.gross_collected += toNumber(row.gross_collected);
    existing.refunds += toNumber(row.refunds);
    existing.net_collected += toNumber(row.net_collected);
    existing.customer_fees += toNumber(row.customer_fees);
    existing.merchant_fees += toNumber(row.merchant_fees);
    if (existing.name === "وسيلة دفع" && name !== "وسيلة دفع") existing.name = name;
    if (existing.method_type === "other" && inferredType !== "other") existing.method_type = inferredType;
  });

  return Array.from(grouped.values()).sort((a, b) => b.gross_collected - a.gross_collected);
}

export async function fetchReportingOverviewV2(
  branchId: string,
  from: Date,
  to: Date,
): Promise<ReportingOverviewV2> {
  const { data, error } = await supabase.rpc("get_reporting_overview_v2", {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (error) throw error;
  if (!data) throw new Error("REPORTING_OVERVIEW_EMPTY");

  const result = data as unknown as ReportingOverviewV2;
  return {
    ...result,
    branch_id: result.branch_id || branchId,
    current: normalizeMetrics(result.current),
    previous: normalizeMetrics(result.previous),
    daily: (result.daily || []).map((point) => ({
      date: point.date,
      pos_sales: toNumber(point.pos_sales),
      online_sales: toNumber(point.online_sales),
      returns: toNumber(point.returns),
      net_sales: toNumber(point.net_sales),
    })),
    payments: normalizePayments(result.payments || []),
    top_products: (result.top_products || []).map((row) => ({
      product_id: row.product_id || null,
      product_name: row.product_name || "منتج",
      quantity: toNumber(row.quantity),
      revenue: toNumber(row.revenue),
      profit: result.current?.can_view_profit ? toNullableNumber(row.profit) : null,
    })),
    data_quality: {
      pos_source: result.data_quality?.pos_source || "pos_invoices_v2",
      pos_profit_source: result.data_quality?.pos_profit_source || "pos_invoice_items.purchase_price_snapshot",
      returns_source: result.data_quality?.returns_source || "approved_pos_returns",
      online_revenue_source: result.data_quality?.online_revenue_source || "delivered_paid_online_orders",
      online_profit_complete: Boolean(result.data_quality?.online_profit_complete),
    },
  };
}
