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

const toNumber = (value: unknown) => Number(value || 0);

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
    payments: normalizePayments(result.payments || []),
    daily: result.daily || [],
    top_products: result.top_products || [],
  };
}
