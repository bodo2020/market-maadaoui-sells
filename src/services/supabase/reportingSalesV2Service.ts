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
  average_ticket: number;
  pos_item_lines: number;
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
  average_ticket: number;
}

export interface ReportingSalesPaymentV2 {
  code: string;
  name: string;
  method_type: string;
  transactions: number;
  gross_collected: number;
}

export interface ReportingRecentSaleV2 {
  channel: "pos" | "online" | string;
  entity_id: string;
  reference: string;
  occurred_at: string;
  actor_name: string;
  payment_name: string;
  amount: number;
  gross_amount: number;
  refunds: number;
  item_count: number;
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
    search?: string | null;
  };
  summary: ReportingSalesSummaryV2;
  hourly: ReportingSalesHourlyV2[];
  cashiers: ReportingCashierV2[];
  payments: ReportingSalesPaymentV2[];
  recent: ReportingRecentSaleV2[];
  pagination: { total: number; limit: number; offset: number; has_more: boolean };
}

type RawNumber = number | string | null | undefined;

interface RawSalesReportV2 {
  version?: RawNumber;
  branch_id?: string;
  from?: string;
  to?: string;
  filters?: ReportingSalesV2["filters"];
  summary?: {
    pos_transactions?: RawNumber;
    online_transactions?: RawNumber;
    transactions?: RawNumber;
    pos_sales_before_loyalty?: RawNumber;
    online_sales?: RawNumber;
    product_discounts?: RawNumber;
    loyalty_discounts?: RawNumber;
    refunds?: RawNumber;
    return_count?: RawNumber;
    net_sales?: RawNumber;
    average_ticket?: RawNumber;
    pos_item_lines?: RawNumber;
  };
  hourly?: Array<{ hour?: RawNumber; transactions?: RawNumber; sales?: RawNumber; refunds?: RawNumber; net_sales?: RawNumber }>;
  cashiers?: Array<{ cashier_id?: string | null; cashier_name?: string; transactions?: RawNumber; sales?: RawNumber; refunds?: RawNumber; net_sales?: RawNumber; average_ticket?: RawNumber }>;
  payment_methods?: Array<{ code?: string; name?: string; method_type?: string; transactions?: RawNumber; sales?: RawNumber }>;
  rows?: Array<{
    channel?: string;
    id?: string;
    document_number?: string;
    occurred_at?: string;
    cashier_name?: string | null;
    customer_name?: string | null;
    payment_name?: string;
    gross_amount?: RawNumber;
    refunds?: RawNumber;
    net_sale?: RawNumber;
    item_count?: RawNumber;
  }>;
  pagination?: { total?: RawNumber; limit?: RawNumber; offset?: RawNumber; has_more?: boolean };
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
  search?: string | null;
}): Promise<ReportingSalesV2> {
  const { branchId, from, to, channel = "all", cashierId = null, paymentCode = null, search = null } = params;
  const { data, error } = await supabase.rpc("get_reporting_sales_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_channel: channel,
    p_cashier_id: cashierId,
    p_payment_code: paymentCode,
    p_search: search,
    p_limit: 50,
    p_offset: 0,
  } as never);

  if (error) throw error;
  if (!data) throw new Error("REPORTING_SALES_EMPTY");
  const raw = data as unknown as RawSalesReportV2;
  const summary = raw.summary || {};
  const loyalty = n(summary.loyalty_discounts);
  const posBeforeLoyalty = n(summary.pos_sales_before_loyalty);
  const posRecognized = Math.max(posBeforeLoyalty - loyalty, 0);
  const onlineSales = n(summary.online_sales);

  return {
    version: n(raw.version) || 2,
    branch_id: raw.branch_id || branchId,
    from: raw.from || from.toISOString(),
    to: raw.to || to.toISOString(),
    filters: raw.filters || { channel, cashier_id: cashierId, payment_code: paymentCode, search },
    summary: {
      pos_transactions: n(summary.pos_transactions),
      online_transactions: n(summary.online_transactions),
      transactions: n(summary.transactions),
      pos_sales: posRecognized,
      online_sales: onlineSales,
      gross_sales: posRecognized + onlineSales,
      refunds: n(summary.refunds),
      net_sales: n(summary.net_sales),
      return_count: n(summary.return_count),
      product_discounts: n(summary.product_discounts),
      loyalty_discounts: loyalty,
      average_ticket: n(summary.average_ticket),
      pos_item_lines: n(summary.pos_item_lines),
    },
    hourly: (raw.hourly || []).map((row) => ({
      hour: n(row.hour),
      transactions: n(row.transactions),
      sales: n(row.sales),
      refunds: n(row.refunds),
      net_sales: n(row.net_sales),
    })),
    cashiers: (raw.cashiers || []).map((row) => ({
      cashier_id: row.cashier_id || null,
      cashier_name: row.cashier_name || "كاشير",
      invoices: n(row.transactions),
      gross_sales: n(row.sales),
      refunds: n(row.refunds),
      net_sales: n(row.net_sales),
      average_ticket: n(row.average_ticket),
    })),
    payments: (raw.payment_methods || []).map((row) => ({
      code: row.code || "other",
      name: row.name || "وسيلة دفع",
      method_type: row.method_type || "other",
      transactions: n(row.transactions),
      gross_collected: n(row.sales),
    })),
    recent: (raw.rows || []).map((row) => ({
      channel: row.channel || "pos",
      entity_id: row.id || row.document_number || "unknown",
      reference: row.document_number || row.id || "—",
      occurred_at: row.occurred_at || "",
      actor_name: row.cashier_name || row.customer_name || (row.channel === "online" ? "طلب أونلاين" : "كاشير"),
      payment_name: row.payment_name || "غير محدد",
      amount: n(row.net_sale),
      gross_amount: n(row.gross_amount),
      refunds: n(row.refunds),
      item_count: n(row.item_count),
    })),
    pagination: {
      total: n(raw.pagination?.total),
      limit: n(raw.pagination?.limit) || 50,
      offset: n(raw.pagination?.offset),
      has_more: Boolean(raw.pagination?.has_more),
    },
  };
}
