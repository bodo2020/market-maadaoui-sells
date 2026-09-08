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

export interface ReportingPaymentsSummaryV2 {
  transactions: number;
  gross_collected: number;
  payment_fees: number;
  customer_fees: number;
  merchant_fees: number;
  refund_count: number;
  refunds: number;
  pending_refund_count: number;
  pending_refund_amount: number;
  net_period_movement: number;
  settled_net: number | null;
  live_electronic_balance: number | null;
}

export interface ReportingPaymentMethodV2 {
  code: string;
  name: string;
  method_type: string;
  active: boolean;
  fee_type: string | null;
  fee_value: number | null;
  fee_bearer: string | null;
  transactions: number;
  gross_collected: number;
  payment_fees: number;
  customer_fees: number;
  merchant_fees: number;
  refund_count: number;
  refunds: number;
  pending_refund_count: number;
  pending_refund_amount: number;
  net_period_movement: number;
  settlement_count: number | null;
  settled_gross: number | null;
  settlement_fees: number | null;
  settled_net: number | null;
  latest_settlement_at: string | null;
  live_account_balance: number | null;
  unsettled_balance: number | null;
}

export interface ReportingPaymentDailyV2 {
  date: string;
  gross_collected: number;
  payment_fees: number;
  refunds: number;
  net_movement: number;
}

export interface ReportingSettlementV2 {
  id: string;
  payment_method: string;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  provider_reference: string | null;
  settled_at: string;
  note: string | null;
}

export interface ReportingPaymentsV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  permissions: { can_view_finance: boolean };
  summary: ReportingPaymentsSummaryV2;
  methods: ReportingPaymentMethodV2[];
  daily: ReportingPaymentDailyV2[];
  recent_settlements: ReportingSettlementV2[];
}

interface RawPaymentsV2 {
  version?: RawNumber;
  branch_id?: string;
  from?: string;
  to?: string;
  permissions?: { can_view_finance?: boolean };
  summary?: Record<string, RawNumber>;
  methods?: Array<Record<string, unknown>>;
  daily?: Array<Record<string, unknown>>;
  recent_settlements?: Array<Record<string, unknown>>;
}

export async function fetchReportingPaymentsV2(branchId: string, from: Date, to: Date): Promise<ReportingPaymentsV2> {
  const { data, error } = await supabase.rpc("get_reporting_payments_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  } as never);

  if (error) throw error;
  if (!data) throw new Error("REPORTING_PAYMENTS_EMPTY");

  const raw = data as unknown as RawPaymentsV2;
  const summary = raw.summary || {};

  return {
    version: n(raw.version) || 2,
    branch_id: raw.branch_id || branchId,
    from: raw.from || from.toISOString(),
    to: raw.to || to.toISOString(),
    permissions: { can_view_finance: Boolean(raw.permissions?.can_view_finance) },
    summary: {
      transactions: n(summary.transactions),
      gross_collected: n(summary.gross_collected),
      payment_fees: n(summary.payment_fees),
      customer_fees: n(summary.customer_fees),
      merchant_fees: n(summary.merchant_fees),
      refund_count: n(summary.refund_count),
      refunds: n(summary.refunds),
      pending_refund_count: n(summary.pending_refund_count),
      pending_refund_amount: n(summary.pending_refund_amount),
      net_period_movement: n(summary.net_period_movement),
      settled_net: nullableNumber(summary.settled_net),
      live_electronic_balance: nullableNumber(summary.live_electronic_balance),
    },
    methods: (raw.methods || []).map((row) => ({
      code: String(row.code || "other"),
      name: String(row.name || "وسيلة دفع"),
      method_type: String(row.method_type || "other"),
      active: Boolean(row.active),
      fee_type: row.fee_type == null ? null : String(row.fee_type),
      fee_value: nullableNumber(row.fee_value),
      fee_bearer: row.fee_bearer == null ? null : String(row.fee_bearer),
      transactions: n(row.transactions),
      gross_collected: n(row.gross_collected),
      payment_fees: n(row.payment_fees),
      customer_fees: n(row.customer_fees),
      merchant_fees: n(row.merchant_fees),
      refund_count: n(row.refund_count),
      refunds: n(row.refunds),
      pending_refund_count: n(row.pending_refund_count),
      pending_refund_amount: n(row.pending_refund_amount),
      net_period_movement: n(row.net_period_movement),
      settlement_count: nullableNumber(row.settlement_count),
      settled_gross: nullableNumber(row.settled_gross),
      settlement_fees: nullableNumber(row.settlement_fees),
      settled_net: nullableNumber(row.settled_net),
      latest_settlement_at: row.latest_settlement_at == null ? null : String(row.latest_settlement_at),
      live_account_balance: nullableNumber(row.live_account_balance),
      unsettled_balance: nullableNumber(row.unsettled_balance),
    })),
    daily: (raw.daily || []).map((row) => ({
      date: String(row.date || ""),
      gross_collected: n(row.gross_collected),
      payment_fees: n(row.payment_fees),
      refunds: n(row.refunds),
      net_movement: n(row.net_movement),
    })),
    recent_settlements: (raw.recent_settlements || []).map((row) => ({
      id: String(row.id || ""),
      payment_method: String(row.payment_method || "غير محدد"),
      gross_amount: n(row.gross_amount),
      fee_amount: n(row.fee_amount),
      net_amount: n(row.net_amount),
      provider_reference: row.provider_reference == null ? null : String(row.provider_reference),
      settled_at: String(row.settled_at || ""),
      note: row.note == null ? null : String(row.note),
    })),
  };
}
