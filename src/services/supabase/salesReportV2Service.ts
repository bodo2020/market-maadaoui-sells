import { supabase } from "@/integrations/supabase/client";

export type SalesReportChannel = "all" | "pos" | "online";

export interface SalesReportSummaryV2 {
  pos_transactions: number;
  online_transactions: number;
  transactions: number;
  pos_sales_before_loyalty: number;
  online_sales: number;
  product_discounts: number;
  loyalty_discounts: number;
  refunds: number;
  return_count: number;
  net_sales: number;
  average_ticket: number;
  pos_item_lines: number;
}

export interface SalesReportHourlyV2 {
  hour: number;
  transactions: number;
  sales: number;
  refunds: number;
  net_sales: number;
}

export interface SalesReportCashierV2 {
  cashier_id: string | null;
  cashier_name: string;
  transactions: number;
  sales: number;
  refunds: number;
  net_sales: number;
  average_ticket: number;
}

export interface SalesReportPaymentV2 {
  code: string;
  name: string;
  method_type: string;
  transactions: number;
  sales: number;
}

export interface SalesReportRowV2 {
  channel: "pos" | "online";
  id: string;
  document_number: string;
  occurred_at: string;
  cashier_id: string | null;
  cashier_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  payment_code: string;
  payment_name: string;
  gross_amount: number;
  product_discount: number;
  loyalty_discount: number;
  recognized_sale: number;
  refunds: number;
  net_sale: number;
  item_count: number;
}

export interface SalesReportPaginationV2 {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface SalesReportV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  filters: {
    channel: SalesReportChannel;
    cashier_id: string | null;
    payment_code: string | null;
    search: string | null;
  };
  summary: SalesReportSummaryV2;
  hourly: SalesReportHourlyV2[];
  cashiers: SalesReportCashierV2[];
  payment_methods: SalesReportPaymentV2[];
  rows: SalesReportRowV2[];
  pagination: SalesReportPaginationV2;
}

export interface SalesReportFiltersV2 {
  channel?: SalesReportChannel;
  cashierId?: string | null;
  paymentCode?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

const number = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const text = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value : fallback;

export async function fetchSalesReportV2(
  branchId: string,
  from: Date,
  to: Date,
  filters: SalesReportFiltersV2 = {},
): Promise<SalesReportV2> {
  const { data, error } = await supabase.rpc("get_reporting_sales_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_channel: filters.channel || "all",
    p_cashier_id: filters.cashierId || null,
    p_payment_code: filters.paymentCode || null,
    p_search: filters.search?.trim() || null,
    p_limit: Math.min(Math.max(filters.limit || 50, 1), 200),
    p_offset: Math.max(filters.offset || 0, 0),
  } as never);

  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("SALES_REPORT_EMPTY");

  const raw = data as unknown as Record<string, any>;
  const summary = raw.summary || {};
  const pagination = raw.pagination || {};

  return {
    version: number(raw.version) || 2,
    branch_id: text(raw.branch_id, branchId),
    from: text(raw.from, from.toISOString()),
    to: text(raw.to, to.toISOString()),
    filters: {
      channel: (["all", "pos", "online"].includes(raw.filters?.channel) ? raw.filters.channel : "all") as SalesReportChannel,
      cashier_id: raw.filters?.cashier_id ? String(raw.filters.cashier_id) : null,
      payment_code: raw.filters?.payment_code ? String(raw.filters.payment_code) : null,
      search: raw.filters?.search ? String(raw.filters.search) : null,
    },
    summary: {
      pos_transactions: number(summary.pos_transactions),
      online_transactions: number(summary.online_transactions),
      transactions: number(summary.transactions),
      pos_sales_before_loyalty: number(summary.pos_sales_before_loyalty),
      online_sales: number(summary.online_sales),
      product_discounts: number(summary.product_discounts),
      loyalty_discounts: number(summary.loyalty_discounts),
      refunds: number(summary.refunds),
      return_count: number(summary.return_count),
      net_sales: number(summary.net_sales),
      average_ticket: number(summary.average_ticket),
      pos_item_lines: number(summary.pos_item_lines),
    },
    hourly: (Array.isArray(raw.hourly) ? raw.hourly : []).map((row: Record<string, unknown>) => ({
      hour: number(row.hour),
      transactions: number(row.transactions),
      sales: number(row.sales),
      refunds: number(row.refunds),
      net_sales: number(row.net_sales),
    })),
    cashiers: (Array.isArray(raw.cashiers) ? raw.cashiers : []).map((row: Record<string, unknown>) => ({
      cashier_id: row.cashier_id ? String(row.cashier_id) : null,
      cashier_name: text(row.cashier_name, "كاشير"),
      transactions: number(row.transactions),
      sales: number(row.sales),
      refunds: number(row.refunds),
      net_sales: number(row.net_sales),
      average_ticket: number(row.average_ticket),
    })),
    payment_methods: (Array.isArray(raw.payment_methods) ? raw.payment_methods : []).map((row: Record<string, unknown>) => ({
      code: text(row.code, "other"),
      name: text(row.name, "وسيلة دفع"),
      method_type: text(row.method_type, "other"),
      transactions: number(row.transactions),
      sales: number(row.sales),
    })),
    rows: (Array.isArray(raw.rows) ? raw.rows : []).map((row: Record<string, unknown>) => ({
      channel: row.channel === "online" ? "online" : "pos",
      id: text(row.id),
      document_number: text(row.document_number),
      occurred_at: text(row.occurred_at),
      cashier_id: row.cashier_id ? String(row.cashier_id) : null,
      cashier_name: row.cashier_name ? String(row.cashier_name) : null,
      customer_name: row.customer_name ? String(row.customer_name) : null,
      customer_phone: row.customer_phone ? String(row.customer_phone) : null,
      payment_code: text(row.payment_code, "other"),
      payment_name: text(row.payment_name, "وسيلة دفع"),
      gross_amount: number(row.gross_amount),
      product_discount: number(row.product_discount),
      loyalty_discount: number(row.loyalty_discount),
      recognized_sale: number(row.recognized_sale),
      refunds: number(row.refunds),
      net_sale: number(row.net_sale),
      item_count: number(row.item_count),
    })),
    pagination: {
      total: number(pagination.total),
      limit: number(pagination.limit) || 50,
      offset: number(pagination.offset),
      has_more: Boolean(pagination.has_more),
    },
  };
}
