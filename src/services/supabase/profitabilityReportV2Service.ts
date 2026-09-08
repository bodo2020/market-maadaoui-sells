import { supabase } from "@/integrations/supabase/client";
import type { ReportingMetricsV2 } from "@/services/supabase/reportingV2Service";

export interface ProfitabilityWaterfallV2 {
  key: string;
  label: string;
  value: number;
}

export interface ProfitabilityDailyV2 {
  date: string;
  net_sales: number;
  net_cogs: number;
  gross_profit: number;
  payment_fees: number;
  expenses: number;
  known_operating_result: number;
}

export interface ProfitabilityReportV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  summary: ReportingMetricsV2;
  waterfall: ProfitabilityWaterfallV2[];
  daily: ProfitabilityDailyV2[];
  online_profit_complete: boolean;
  note: string;
}

const number = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function fetchProfitabilityReportV2(
  branchId: string,
  from: Date,
  to: Date,
): Promise<ProfitabilityReportV2> {
  const { data, error } = await supabase.rpc("get_reporting_profitability_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  } as never);

  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("PROFITABILITY_REPORT_EMPTY");

  const raw = data as unknown as Record<string, any>;
  const summary = raw.summary || {};

  return {
    version: number(raw.version) || 2,
    branch_id: String(raw.branch_id || branchId),
    from: String(raw.from || from.toISOString()),
    to: String(raw.to || to.toISOString()),
    summary: {
      pos_transactions: number(summary.pos_transactions),
      online_transactions: number(summary.online_transactions),
      transactions: number(summary.transactions),
      pos_gross_sales: number(summary.pos_gross_sales),
      online_gross_sales: number(summary.online_gross_sales),
      gross_sales: number(summary.gross_sales),
      product_discounts: number(summary.product_discounts),
      loyalty_discounts: number(summary.loyalty_discounts),
      returns: number(summary.returns),
      return_count: number(summary.return_count),
      pos_net_sales: number(summary.pos_net_sales),
      online_net_sales: number(summary.online_net_sales),
      net_sales: number(summary.net_sales),
      average_ticket: number(summary.average_ticket),
      items_sold: number(summary.items_sold),
      merchant_payment_fees: number(summary.merchant_payment_fees),
      customer_payment_fees: number(summary.customer_payment_fees),
      expenses: number(summary.expenses),
      can_view_profit: Boolean(summary.can_view_profit),
      profit_scope: String(summary.profit_scope || "pos_only"),
      online_profit_complete: Boolean(summary.online_profit_complete),
      pos_net_cogs: nullableNumber(summary.pos_net_cogs),
      pos_gross_profit: nullableNumber(summary.pos_gross_profit),
      pos_profit_after_payment_fees: nullableNumber(summary.pos_profit_after_payment_fees),
      known_operating_result: nullableNumber(summary.known_operating_result),
    },
    waterfall: (Array.isArray(raw.waterfall) ? raw.waterfall : []).map((row: Record<string, unknown>) => ({
      key: String(row.key || "metric"),
      label: String(row.label || "بند"),
      value: number(row.value),
    })),
    daily: (Array.isArray(raw.daily) ? raw.daily : []).map((row: Record<string, unknown>) => ({
      date: String(row.date || ""),
      net_sales: number(row.net_sales),
      net_cogs: number(row.net_cogs),
      gross_profit: number(row.gross_profit),
      payment_fees: number(row.payment_fees),
      expenses: number(row.expenses),
      known_operating_result: number(row.known_operating_result),
    })),
    online_profit_complete: Boolean(raw.online_profit_complete),
    note: String(raw.note || ""),
  };
}
