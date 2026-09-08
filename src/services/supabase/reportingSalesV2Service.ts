import { supabase } from "@/integrations/supabase/client";

export type ReportingSalesChannel = "all" | "pos" | "online";

export interface ReportingSalesSummaryV2 {
  pos_transactions: number;
  online_transactions: number;
  transactions: number;
  pos_sales: number;
  online_sales: number;
  gross_sales: number;
  refunds: number;
  net_sales: number;
  return_count: number;
  product_discounts: number;
  loyalty_discounts: number;
  merchant_payment_fees: number;
  customer_payment_fees: number;
  average_ticket: number;
}

export interface ReportingSalesHourlyV2 {
  hour: number;
  transactions: number;
  sales: number;
  refunds: number;
  net_sales: number;
}

export interface ReportingCashierV2 {
  cashier_id: string | null;
  cashier_name: string;
  invoices: number;
  gross_sales: number;
  refunds: number;
  net_sales: number;
  returns: number;
  average_ticket: number;
  discounts: number;
  loyalty_discounts: number;
  merchant_fees: number;
}

export interface ReportingSalesPaymentV2 {
  code: string;
  name: string;
  method_type: string;
  transactions: number;
  gross_collected: number;
  refunds: number;
  merchant_fees: number;
  net_collected: number;
}

export interface ReportingRecentSaleV2 {
  channel: "pos" | "online" | string;
  entity_id: string;
  reference: string;
  occurred_at: string;
  actor_name: string;
  payment_name: string;
  amount: number;
}

export interface ReportingSalesV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  filters: {
    channel: ReportingSalesChannel;
    cashier_id: string | null;
    payment_code: string | null;
  };
  summary: ReportingSalesSummaryV2;
  hourly: ReportingSalesHourlyV2[];
  cashiers: ReportingCashierV2[];
  payments: ReportingSalesPaymentV2[];
  recent: ReportingRecentSaleV2[];
}

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function fetchReportingSalesV2(params: {
  branchId: string;
  from: Date;
  to: Date;
  channel?: ReportingSalesChannel;
  cashierId?: string | null;
  paymentCode?: string | null;
}): Promise<ReportingSalesV2> {
  const { branchId, from, to, channel = "all", cashierId = null, paymentCode = null } = params;
  const { data, error } = await supabase.rpc("get_reporting_sales_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_channel: channel,
    p_cashier_id: cashierId,
    p_payment_code: paymentCode,
  } as never);

  if (error) throw error;
  if (!data) throw new Error("REPORTING_SALES_EMPTY");
  const raw = data as unknown as ReportingSalesV2;

  return {
    ...raw,
    summary: {
      ...raw.summary,
      pos_transactions: n(raw.summary?.pos_transactions),
      online_transactions: n(raw.summary?.online_transactions),
      transactions: n(raw.summary?.transactions),
      pos_sales: n(raw.summary?.pos_sales),
      online_sales: n(raw.summary?.online_sales),
      gross_sales: n(raw.summary?.gross_sales),
      refunds: n(raw.summary?.refunds),
      net_sales: n(raw.summary?.net_sales),
      return_count: n(raw.summary?.return_count),
      product_discounts: n(raw.summary?.product_discounts),
      loyalty_discounts: n(raw.summary?.loyalty_discounts),
      merchant_payment_fees: n(raw.summary?.merchant_payment_fees),
      customer_payment_fees: n(raw.summary?.customer_payment_fees),
      average_ticket: n(raw.summary?.average_ticket),
    },
    hourly: (raw.hourly || []).map((row) => ({
      ...row,
      hour: n(row.hour),
      transactions: n(row.transactions),
      sales: n(row.sales),
      refunds: n(row.refunds),
      net_sales: n(row.net_sales),
    })),
    cashiers: (raw.cashiers || []).map((row) => ({
      ...row,
      invoices: n(row.invoices),
      gross_sales: n(row.gross_sales),
      refunds: n(row.refunds),
      net_sales: n(row.net_sales),
      returns: n(row.returns),
      average_ticket: n(row.average_ticket),
      discounts: n(row.discounts),
      loyalty_discounts: n(row.loyalty_discounts),
      merchant_fees: n(row.merchant_fees),
    })),
    payments: (raw.payments || []).map((row) => ({
      ...row,
      transactions: n(row.transactions),
      gross_collected: n(row.gross_collected),
      refunds: n(row.refunds),
      merchant_fees: n(row.merchant_fees),
      net_collected: n(row.net_collected),
    })),
    recent: (raw.recent || []).map((row) => ({ ...row, amount: n(row.amount) })),
  };
}
