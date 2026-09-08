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
  provider_fees?: number;
  live_account_balance?: number | null;
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

type RawNumber = number | string | null | undefined;

interface RawReportingSnapshotV2 {
  pos?: {
    invoice_count?: RawNumber;
    gross_sales?: RawNumber;
    product_discounts?: RawNumber;
    loyalty_discounts?: RawNumber;
    sales_after_loyalty?: RawNumber;
    customer_fees?: RawNumber;
    merchant_fees?: RawNumber;
    amount_charged?: RawNumber;
    units_sold?: RawNumber;
    weight_sold?: RawNumber;
    line_count?: RawNumber;
    cogs?: RawNumber;
    net_cogs_after_returns?: RawNumber;
    gross_profit_after_returns?: RawNumber;
    profit_after_payment_fees?: RawNumber;
  };
  returns?: {
    count?: RawNumber;
    gross_value?: RawNumber;
    loyalty_restored?: RawNumber;
    customer_refunds?: RawNumber;
    returned_cogs?: RawNumber;
    saved_profit_impact?: RawNumber;
  };
  online?: {
    order_count?: RawNumber;
    order_total?: RawNumber;
    shipping_revenue?: RawNumber;
    merchandise_sales?: RawNumber;
    loyalty_discounts?: RawNumber;
  };
  expenses?: RawNumber;
  net_sales?: RawNumber;
  pos_net_sales?: RawNumber;
  average_pos_ticket?: RawNumber;
  return_rate?: RawNumber;
  net_operating_profit?: RawNumber;
}

interface RawReportingOverviewV2 {
  version?: RawNumber;
  branch?: { id?: string; name?: string };
  permissions?: {
    can_view_profit?: boolean;
    can_view_finance?: boolean;
  };
  period?: {
    from?: string;
    to?: string;
    comparison_from?: string;
    comparison_to?: string;
    timezone?: string;
  };
  current?: RawReportingSnapshotV2;
  previous?: RawReportingSnapshotV2;
  timeline?: Array<{
    date?: string;
    pos_sales?: RawNumber;
    pos_refunds?: RawNumber;
    online_sales?: RawNumber;
    net_sales?: RawNumber;
    invoice_count?: RawNumber;
    online_order_count?: RawNumber;
  }>;
  payment_methods?: Array<{
    method_id?: string | null;
    code?: string;
    name?: string;
    method_type?: string;
    transaction_count?: RawNumber;
    collected?: RawNumber;
    fees?: RawNumber;
    merchant_fees?: RawNumber;
    confirmed_refunds?: RawNumber;
    net_period_movement?: RawNumber;
    live_account_balance?: RawNumber;
  }>;
  top_products?: Array<{
    product_id?: string | null;
    product_name?: string;
    quantity?: RawNumber;
    revenue?: RawNumber;
    profit?: RawNumber;
  }>;
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
        provider_fees: toNumber(row.provider_fees),
        live_account_balance: row.live_account_balance == null ? null : toNumber(row.live_account_balance),
      });
      return;
    }

    existing.sale_count += toNumber(row.sale_count);
    existing.gross_collected += toNumber(row.gross_collected);
    existing.refunds += toNumber(row.refunds);
    existing.net_collected += toNumber(row.net_collected);
    existing.customer_fees += toNumber(row.customer_fees);
    existing.merchant_fees += toNumber(row.merchant_fees);
    existing.provider_fees = toNumber(existing.provider_fees) + toNumber(row.provider_fees);
    if (row.live_account_balance != null) existing.live_account_balance = toNumber(row.live_account_balance);
    if (existing.name === "وسيلة دفع" && name !== "وسيلة دفع") existing.name = name;
    if (existing.method_type === "other" && inferredType !== "other") existing.method_type = inferredType;
  });

  return Array.from(grouped.values()).sort((a, b) => b.gross_collected - a.gross_collected);
}

function normalizeSnapshot(
  snapshot: RawReportingSnapshotV2 | undefined,
  canViewProfit: boolean,
): ReportingMetricsV2 {
  const pos = snapshot?.pos || {};
  const online = snapshot?.online || {};
  const returns = snapshot?.returns || {};

  const posTransactions = toNumber(pos.invoice_count);
  const onlineTransactions = toNumber(online.order_count);
  const transactions = posTransactions + onlineTransactions;
  const posGrossSales = toNumber(pos.sales_after_loyalty ?? pos.gross_sales);
  const onlineGrossSales = toNumber(online.order_total);
  const netSales = toNumber(snapshot?.net_sales);

  return {
    pos_transactions: posTransactions,
    online_transactions: onlineTransactions,
    transactions,
    pos_gross_sales: posGrossSales,
    online_gross_sales: onlineGrossSales,
    gross_sales: posGrossSales + onlineGrossSales,
    product_discounts: toNumber(pos.product_discounts),
    loyalty_discounts: toNumber(pos.loyalty_discounts) + toNumber(online.loyalty_discounts),
    returns: toNumber(returns.customer_refunds),
    return_count: toNumber(returns.count),
    pos_net_sales: toNumber(snapshot?.pos_net_sales),
    online_net_sales: onlineGrossSales,
    net_sales: netSales,
    average_ticket: transactions > 0 ? netSales / transactions : 0,
    items_sold: toNumber(pos.units_sold) + toNumber(pos.weight_sold),
    merchant_payment_fees: toNumber(pos.merchant_fees),
    customer_payment_fees: toNumber(pos.customer_fees),
    expenses: toNumber(snapshot?.expenses),
    can_view_profit: canViewProfit,
    profit_scope: "pos_only",
    online_profit_complete: false,
    pos_net_cogs: canViewProfit ? toNullableNumber(pos.net_cogs_after_returns) : null,
    pos_gross_profit: canViewProfit ? toNullableNumber(pos.gross_profit_after_returns) : null,
    pos_profit_after_payment_fees: canViewProfit ? toNullableNumber(pos.profit_after_payment_fees) : null,
    known_operating_result: canViewProfit ? toNullableNumber(snapshot?.net_operating_profit) : null,
  };
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

  const raw = data as unknown as RawReportingOverviewV2;
  const canViewProfit = Boolean(raw.permissions?.can_view_profit);

  const payments = (raw.payment_methods || []).map<ReportingPaymentV2>((row) => {
    const providerFees = toNumber(row.fees);
    const merchantFees = toNumber(row.merchant_fees);
    return {
      code: row.code || row.method_id || "other",
      name: row.name || "وسيلة دفع",
      method_type: row.method_type || "other",
      sale_count: toNumber(row.transaction_count),
      gross_collected: toNumber(row.collected),
      refunds: toNumber(row.confirmed_refunds),
      net_collected: toNumber(row.net_period_movement),
      customer_fees: Math.max(providerFees - merchantFees, 0),
      merchant_fees: merchantFees,
      provider_fees: providerFees,
      live_account_balance: row.live_account_balance == null ? null : toNumber(row.live_account_balance),
    };
  });

  const daily = (raw.timeline || []).map<ReportingDailyPointV2>((point) => ({
    date: point.date || "",
    pos_sales: toNumber(point.pos_sales),
    online_sales: toNumber(point.online_sales),
    returns: toNumber(point.pos_refunds),
    net_sales: toNumber(point.net_sales),
  }));

  const topProducts = (raw.top_products || []).map<ReportingTopProductV2>((row) => ({
    product_id: row.product_id || null,
    product_name: row.product_name || "منتج",
    quantity: toNumber(row.quantity),
    revenue: toNumber(row.revenue),
    profit: canViewProfit ? toNullableNumber(row.profit) : null,
  }));

  return {
    version: toNumber(raw.version) || 2,
    branch_id: raw.branch?.id || branchId,
    from: raw.period?.from || from.toISOString(),
    to: raw.period?.to || to.toISOString(),
    previous_from: raw.period?.comparison_from || "",
    previous_to: raw.period?.comparison_to || "",
    current: normalizeSnapshot(raw.current, canViewProfit),
    previous: normalizeSnapshot(raw.previous, canViewProfit),
    daily,
    payments: normalizePayments(payments),
    top_products: topProducts,
    data_quality: {
      pos_source: "pos_invoices_v2",
      pos_profit_source: "invoice_item_purchase_price_snapshots",
      returns_source: "approved_completed_returns",
      online_revenue_source: "delivered_paid_online_orders",
      online_profit_complete: false,
    },
  };
}
