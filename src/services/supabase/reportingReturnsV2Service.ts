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

export interface ReportingReturnsSummaryV2 {
  total_requests: number;
  approved_count: number;
  approved_value: number;
  completed_refund_value: number;
  loyalty_restored: number;
  rejected_count: number;
  pending_review_count: number;
  full_return_count: number;
  partial_return_count: number;
  returned_cogs: number | null;
  profit_impact: number | null;
  avg_transfer_minutes: number;
  pending_refund_tasks: number;
  pending_refund_amount: number;
}

export interface ReportingReturnDailyV2 {
  date: string;
  approved_count: number;
  returned_value: number;
  refunded_value: number;
}

export interface ReportingReturnReasonV2 {
  reason: string;
  returns: number;
  value: number;
}

export interface ReportingReturnPaymentV2 {
  code: string;
  name: string;
  returns: number;
  value: number;
  refund_value: number;
}

export interface ReportingReturnCashierV2 {
  cashier_id: string | null;
  cashier_name: string;
  returns: number;
  value: number;
}

export interface ReportingReturnedProductV2 {
  product_id: string | null;
  product_name: string;
  quantity: number;
  value: number;
  returned_cogs: number | null;
  profit_impact: number | null;
}

export interface ReportingRecentReturnV2 {
  id: string;
  source: string;
  document_number: string;
  customer_name: string | null;
  cashier_name: string | null;
  reason: string;
  status: string;
  refund_status: string | null;
  payment_name: string;
  return_type: "full" | "partial" | "n/a" | string;
  total_amount: number;
  money_refund: number;
  loyalty_refund: number;
  item_lines: number;
  profit_impact: number | null;
  event_at: string;
}

export interface ReportingPendingRefundTaskV2 {
  id: string;
  return_id: string | null;
  source_kind: string;
  payment_method_code: string | null;
  payment_method_name: string | null;
  amount: number;
  priority: string;
  status: string;
  title: string;
  due_at: string | null;
  created_at: string;
}

export interface ReportingReturnsV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  permissions: { can_view_profit: boolean };
  summary: ReportingReturnsSummaryV2;
  daily: ReportingReturnDailyV2[];
  reasons: ReportingReturnReasonV2[];
  payments: ReportingReturnPaymentV2[];
  cashiers: ReportingReturnCashierV2[];
  top_products: ReportingReturnedProductV2[];
  recent: ReportingRecentReturnV2[];
  pending_tasks: ReportingPendingRefundTaskV2[];
}

interface RawReturnsV2 {
  version?: RawNumber;
  branch_id?: string;
  from?: string;
  to?: string;
  permissions?: { can_view_profit?: boolean };
  summary?: Record<string, RawNumber>;
  daily?: Array<Record<string, unknown>>;
  reasons?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  cashiers?: Array<Record<string, unknown>>;
  top_products?: Array<Record<string, unknown>>;
  recent?: Array<Record<string, unknown>>;
  pending_tasks?: Array<Record<string, unknown>>;
}

export async function fetchReportingReturnsV2(branchId: string, from: Date, to: Date): Promise<ReportingReturnsV2> {
  const { data, error } = await supabase.rpc("get_reporting_returns_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  } as never);

  if (error) throw error;
  if (!data) throw new Error("REPORTING_RETURNS_EMPTY");

  const raw = data as unknown as RawReturnsV2;
  const summary = raw.summary || {};
  const canViewProfit = Boolean(raw.permissions?.can_view_profit);

  return {
    version: n(raw.version) || 2,
    branch_id: raw.branch_id || branchId,
    from: raw.from || from.toISOString(),
    to: raw.to || to.toISOString(),
    permissions: { can_view_profit: canViewProfit },
    summary: {
      total_requests: n(summary.total_requests),
      approved_count: n(summary.approved_count),
      approved_value: n(summary.approved_value),
      completed_refund_value: n(summary.completed_refund_value),
      loyalty_restored: n(summary.loyalty_restored),
      rejected_count: n(summary.rejected_count),
      pending_review_count: n(summary.pending_review_count),
      full_return_count: n(summary.full_return_count),
      partial_return_count: n(summary.partial_return_count),
      returned_cogs: canViewProfit ? nullableNumber(summary.returned_cogs) : null,
      profit_impact: canViewProfit ? nullableNumber(summary.profit_impact) : null,
      avg_transfer_minutes: n(summary.avg_transfer_minutes),
      pending_refund_tasks: n(summary.pending_refund_tasks),
      pending_refund_amount: n(summary.pending_refund_amount),
    },
    daily: (raw.daily || []).map((row) => ({
      date: String(row.date || ""),
      approved_count: n(row.approved_count),
      returned_value: n(row.returned_value),
      refunded_value: n(row.refunded_value),
    })),
    reasons: (raw.reasons || []).map((row) => ({
      reason: String(row.reason || "بدون سبب محدد"),
      returns: n(row.returns),
      value: n(row.value),
    })),
    payments: (raw.payments || []).map((row) => ({
      code: String(row.code || "other"),
      name: String(row.name || "غير محدد"),
      returns: n(row.returns),
      value: n(row.value),
      refund_value: n(row.refund_value),
    })),
    cashiers: (raw.cashiers || []).map((row) => ({
      cashier_id: row.cashier_id == null ? null : String(row.cashier_id),
      cashier_name: String(row.cashier_name || "غير معروف"),
      returns: n(row.returns),
      value: n(row.value),
    })),
    top_products: (raw.top_products || []).map((row) => ({
      product_id: row.product_id == null ? null : String(row.product_id),
      product_name: String(row.product_name || "منتج غير متاح"),
      quantity: n(row.quantity),
      value: n(row.value),
      returned_cogs: canViewProfit ? nullableNumber(row.returned_cogs) : null,
      profit_impact: canViewProfit ? nullableNumber(row.profit_impact) : null,
    })),
    recent: (raw.recent || []).map((row) => ({
      id: String(row.id || ""),
      source: String(row.source || "unknown"),
      document_number: String(row.document_number || "—"),
      customer_name: row.customer_name == null ? null : String(row.customer_name),
      cashier_name: row.cashier_name == null ? null : String(row.cashier_name),
      reason: String(row.reason || "بدون سبب محدد"),
      status: String(row.status || "unknown"),
      refund_status: row.refund_status == null ? null : String(row.refund_status),
      payment_name: String(row.payment_name || "غير محدد"),
      return_type: String(row.return_type || "n/a"),
      total_amount: n(row.total_amount),
      money_refund: n(row.money_refund),
      loyalty_refund: n(row.loyalty_refund),
      item_lines: n(row.item_lines),
      profit_impact: canViewProfit ? nullableNumber(row.profit_impact) : null,
      event_at: String(row.event_at || ""),
    })),
    pending_tasks: (raw.pending_tasks || []).map((row) => ({
      id: String(row.id || ""),
      return_id: row.return_id == null ? null : String(row.return_id),
      source_kind: String(row.source_kind || "unknown"),
      payment_method_code: row.payment_method_code == null ? null : String(row.payment_method_code),
      payment_method_name: row.payment_method_name == null ? null : String(row.payment_method_name),
      amount: n(row.amount),
      priority: String(row.priority || "normal"),
      status: String(row.status || "pending"),
      title: String(row.title || "مهمة رد مبلغ"),
      due_at: row.due_at == null ? null : String(row.due_at),
      created_at: String(row.created_at || ""),
    })),
  };
}
