import { supabase } from "@/integrations/supabase/client";

export interface ProfitabilityWaterfallItemV2 {
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

export interface ProfitabilitySummaryV2 {
  pos_net_sales: number;
  pos_net_cogs: number | null;
  pos_gross_profit: number | null;
  merchant_payment_fees: number;
  expenses: number;
  pos_profit_after_payment_fees: number | null;
  known_operating_result: number | null;
  return_rate?: number;
}

export interface ReportingProfitabilityV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  summary: ProfitabilitySummaryV2;
  waterfall: ProfitabilityWaterfallItemV2[];
  daily: ProfitabilityDailyV2[];
  online_profit_complete: boolean;
  note: string;
}

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullable = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function fetchReportingProfitabilityV2(
  branchId: string,
  from: Date,
  to: Date,
): Promise<ReportingProfitabilityV2> {
  const { data, error } = await supabase.rpc("get_reporting_profitability_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  } as never);

  if (error) throw error;
  if (!data) throw new Error("REPORTING_PROFITABILITY_EMPTY");
  const raw = data as unknown as ReportingProfitabilityV2;

  return {
    ...raw,
    summary: {
      ...raw.summary,
      pos_net_sales: n(raw.summary?.pos_net_sales),
      pos_net_cogs: nullable(raw.summary?.pos_net_cogs),
      pos_gross_profit: nullable(raw.summary?.pos_gross_profit),
      merchant_payment_fees: n(raw.summary?.merchant_payment_fees),
      expenses: n(raw.summary?.expenses),
      pos_profit_after_payment_fees: nullable(raw.summary?.pos_profit_after_payment_fees),
      known_operating_result: nullable(raw.summary?.known_operating_result),
      return_rate: n(raw.summary?.return_rate),
    },
    waterfall: (raw.waterfall || []).map((row) => ({ ...row, value: n(row.value) })),
    daily: (raw.daily || []).map((row) => ({
      ...row,
      net_sales: n(row.net_sales),
      net_cogs: n(row.net_cogs),
      gross_profit: n(row.gross_profit),
      payment_fees: n(row.payment_fees),
      expenses: n(row.expenses),
      known_operating_result: n(row.known_operating_result),
    })),
    online_profit_complete: Boolean(raw.online_profit_complete),
    note: raw.note || "",
  };
}
