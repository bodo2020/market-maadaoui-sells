import { supabase } from "@/integrations/supabase/client";

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const nullableString = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

export interface ReportingShiftPaymentMethodV2 {
  payment_method_id: string | null;
  code: string;
  name: string;
  method_type: string;
  invoice_count: number;
  invoice_amount: number;
  recorded_payment_base: number;
  legacy_gap: number;
  coverage_percent: number;
  recorded_invoice_count: number;
  charged_amount?: number;
  customer_fee_amount: number;
  merchant_fee_amount: number;
  recorded_net_settlement: number | null;
  actual_counted_amount: number | null;
  actual_available: boolean;
}

export interface ReportingShiftRowV2 {
  shift_id: string;
  cashier_id: string;
  cashier_name: string;
  device_id: string;
  device_name: string;
  device_code: string | null;
  status: "open" | "closed" | string;
  opened_at: string;
  closed_at: string | null;
  opened_in_range: boolean;
  closed_in_range: boolean;
  duration_minutes_in_range: number;
  invoice_count: number;
  recognized_sales: number;
  approved_returns: number;
  return_count: number;
  net_sales: number;
  average_ticket: number;
  recorded_payment_base: number;
  payment_legacy_gap: number;
  payment_coverage_percent: number;
  customer_payment_fees: number;
  merchant_payment_fees: number;
  cash_refunds: number;
  electronic_refunds: number;
  loyalty_refunds: number;
  pending_electronic_refunds: number;
  confirmed_electronic_refunds: number;
  opening_cash: number | null;
  opening_system_balance: number | null;
  opening_variance: number | null;
  expected_cash: number | null;
  closing_cash: number | null;
  cash_difference: number | null;
  closing_notes: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  payment_breakdown: ReportingShiftPaymentMethodV2[];
}

export interface ReportingCashierRowV2 {
  cashier_id: string;
  cashier_name: string;
  shift_count: number;
  open_shifts: number;
  closed_shifts: number;
  duration_minutes: number;
  invoice_count: number;
  recognized_sales: number;
  return_count: number;
  approved_returns: number;
  net_sales: number;
  average_ticket: number;
  sales_per_hour: number;
  recorded_payment_base: number;
  payment_legacy_gap: number;
  payment_coverage_percent: number;
  variance_shifts: number | null;
  cash_variance_signed: number | null;
  cash_variance_absolute: number | null;
}

export interface ReportingShiftsSummaryV2 {
  overlapping_shifts: number;
  shifts_opened_in_range: number;
  shifts_closed_in_range: number;
  open_now: number;
  cashiers: number;
  devices: number;
  duration_minutes: number;
  invoice_count: number;
  recognized_sales: number;
  approved_returns: number;
  net_sales: number;
  average_ticket: number;
  recorded_payment_base: number;
  payment_legacy_gap: number;
  payment_coverage_percent: number;
  payment_recorded_invoice_count: number;
  customer_payment_fees: number;
  merchant_payment_fees: number;
  cash_refunds: number;
  electronic_refunds: number;
  loyalty_refunds: number;
  pending_electronic_refunds: number;
  confirmed_electronic_refunds: number;
  closed_reconciliations: number;
  variance_shifts: number | null;
  cash_variance_signed: number | null;
  cash_variance_absolute: number | null;
  opening_variance_absolute: number | null;
}

export interface ReportingShiftsV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  permissions: { can_view_cash_control: boolean };
  summary: ReportingShiftsSummaryV2;
  shifts: ReportingShiftRowV2[];
  cashiers: ReportingCashierRowV2[];
  payment_methods: ReportingShiftPaymentMethodV2[];
  data_quality: {
    shift_source?: string;
    sales_source?: string;
    payment_record_source?: string;
    returns_source?: string;
    cash_actual_source?: string;
    electronic_actual_available?: boolean;
    electronic_actual_reason?: string;
    first_shift_at?: string | null;
    unassigned_invoice_count?: number;
    unassigned_invoice_amount?: number;
    range_semantics?: string;
  };
}

interface RawReportingShiftsV2 {
  version?: unknown;
  branch_id?: unknown;
  from?: unknown;
  to?: unknown;
  permissions?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  shifts?: Array<Record<string, unknown>>;
  cashiers?: Array<Record<string, unknown>>;
  payment_methods?: Array<Record<string, unknown>>;
  data_quality?: Record<string, unknown>;
}

const paymentRow = (row: Record<string, unknown>): ReportingShiftPaymentMethodV2 => ({
  payment_method_id: nullableString(row.payment_method_id),
  code: String(row.code || "other"),
  name: String(row.name || "وسيلة دفع"),
  method_type: String(row.method_type || "other"),
  invoice_count: n(row.invoice_count),
  invoice_amount: n(row.invoice_amount),
  recorded_payment_base: n(row.recorded_payment_base),
  legacy_gap: n(row.legacy_gap),
  coverage_percent: n(row.coverage_percent),
  recorded_invoice_count: n(row.recorded_invoice_count),
  charged_amount: row.charged_amount == null ? undefined : n(row.charged_amount),
  customer_fee_amount: n(row.customer_fee_amount),
  merchant_fee_amount: n(row.merchant_fee_amount),
  recorded_net_settlement: nullableNumber(row.recorded_net_settlement),
  actual_counted_amount: nullableNumber(row.actual_counted_amount),
  actual_available: Boolean(row.actual_available),
});

export async function fetchReportingShiftsV2(
  branchId: string,
  from: Date,
  to: Date,
  limit = 100,
): Promise<ReportingShiftsV2> {
  const { data, error } = await supabase.rpc("get_reporting_shifts_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_limit: limit,
  } as never);

  if (error) throw error;
  if (!data) throw new Error("REPORTING_SHIFTS_EMPTY");

  const raw = data as unknown as RawReportingShiftsV2;
  const summary = raw.summary || {};
  const dataQuality = raw.data_quality || {};

  return {
    version: n(raw.version) || 2,
    branch_id: String(raw.branch_id || branchId),
    from: String(raw.from || from.toISOString()),
    to: String(raw.to || to.toISOString()),
    permissions: { can_view_cash_control: Boolean(raw.permissions?.can_view_cash_control) },
    summary: {
      overlapping_shifts: n(summary.overlapping_shifts),
      shifts_opened_in_range: n(summary.shifts_opened_in_range),
      shifts_closed_in_range: n(summary.shifts_closed_in_range),
      open_now: n(summary.open_now),
      cashiers: n(summary.cashiers),
      devices: n(summary.devices),
      duration_minutes: n(summary.duration_minutes),
      invoice_count: n(summary.invoice_count),
      recognized_sales: n(summary.recognized_sales),
      approved_returns: n(summary.approved_returns),
      net_sales: n(summary.net_sales),
      average_ticket: n(summary.average_ticket),
      recorded_payment_base: n(summary.recorded_payment_base),
      payment_legacy_gap: n(summary.payment_legacy_gap),
      payment_coverage_percent: n(summary.payment_coverage_percent),
      payment_recorded_invoice_count: n(summary.payment_recorded_invoice_count),
      customer_payment_fees: n(summary.customer_payment_fees),
      merchant_payment_fees: n(summary.merchant_payment_fees),
      cash_refunds: n(summary.cash_refunds),
      electronic_refunds: n(summary.electronic_refunds),
      loyalty_refunds: n(summary.loyalty_refunds),
      pending_electronic_refunds: n(summary.pending_electronic_refunds),
      confirmed_electronic_refunds: n(summary.confirmed_electronic_refunds),
      closed_reconciliations: n(summary.closed_reconciliations),
      variance_shifts: nullableNumber(summary.variance_shifts),
      cash_variance_signed: nullableNumber(summary.cash_variance_signed),
      cash_variance_absolute: nullableNumber(summary.cash_variance_absolute),
      opening_variance_absolute: nullableNumber(summary.opening_variance_absolute),
    },
    shifts: (raw.shifts || []).map((row) => ({
      shift_id: String(row.shift_id || ""),
      cashier_id: String(row.cashier_id || ""),
      cashier_name: String(row.cashier_name || "موظف غير متاح"),
      device_id: String(row.device_id || ""),
      device_name: String(row.device_name || "جهاز غير متاح"),
      device_code: nullableString(row.device_code),
      status: String(row.status || "closed"),
      opened_at: String(row.opened_at || ""),
      closed_at: nullableString(row.closed_at),
      opened_in_range: Boolean(row.opened_in_range),
      closed_in_range: Boolean(row.closed_in_range),
      duration_minutes_in_range: n(row.duration_minutes_in_range),
      invoice_count: n(row.invoice_count),
      recognized_sales: n(row.recognized_sales),
      approved_returns: n(row.approved_returns),
      return_count: n(row.return_count),
      net_sales: n(row.net_sales),
      average_ticket: n(row.average_ticket),
      recorded_payment_base: n(row.recorded_payment_base),
      payment_legacy_gap: n(row.payment_legacy_gap),
      payment_coverage_percent: n(row.payment_coverage_percent),
      customer_payment_fees: n(row.customer_payment_fees),
      merchant_payment_fees: n(row.merchant_payment_fees),
      cash_refunds: n(row.cash_refunds),
      electronic_refunds: n(row.electronic_refunds),
      loyalty_refunds: n(row.loyalty_refunds),
      pending_electronic_refunds: n(row.pending_electronic_refunds),
      confirmed_electronic_refunds: n(row.confirmed_electronic_refunds),
      opening_cash: nullableNumber(row.opening_cash),
      opening_system_balance: nullableNumber(row.opening_system_balance),
      opening_variance: nullableNumber(row.opening_variance),
      expected_cash: nullableNumber(row.expected_cash),
      closing_cash: nullableNumber(row.closing_cash),
      cash_difference: nullableNumber(row.cash_difference),
      closing_notes: nullableString(row.closing_notes),
      closed_by: nullableString(row.closed_by),
      closed_by_name: nullableString(row.closed_by_name),
      payment_breakdown: Array.isArray(row.payment_breakdown)
        ? (row.payment_breakdown as Array<Record<string, unknown>>).map(paymentRow)
        : [],
    })),
    cashiers: (raw.cashiers || []).map((row) => ({
      cashier_id: String(row.cashier_id || ""),
      cashier_name: String(row.cashier_name || "موظف غير متاح"),
      shift_count: n(row.shift_count),
      open_shifts: n(row.open_shifts),
      closed_shifts: n(row.closed_shifts),
      duration_minutes: n(row.duration_minutes),
      invoice_count: n(row.invoice_count),
      recognized_sales: n(row.recognized_sales),
      return_count: n(row.return_count),
      approved_returns: n(row.approved_returns),
      net_sales: n(row.net_sales),
      average_ticket: n(row.average_ticket),
      sales_per_hour: n(row.sales_per_hour),
      recorded_payment_base: n(row.recorded_payment_base),
      payment_legacy_gap: n(row.payment_legacy_gap),
      payment_coverage_percent: n(row.payment_coverage_percent),
      variance_shifts: nullableNumber(row.variance_shifts),
      cash_variance_signed: nullableNumber(row.cash_variance_signed),
      cash_variance_absolute: nullableNumber(row.cash_variance_absolute),
    })),
    payment_methods: (raw.payment_methods || []).map(paymentRow),
    data_quality: {
      shift_source: nullableString(dataQuality.shift_source) || undefined,
      sales_source: nullableString(dataQuality.sales_source) || undefined,
      payment_record_source: nullableString(dataQuality.payment_record_source) || undefined,
      returns_source: nullableString(dataQuality.returns_source) || undefined,
      cash_actual_source: nullableString(dataQuality.cash_actual_source) || undefined,
      electronic_actual_available: dataQuality.electronic_actual_available == null ? undefined : Boolean(dataQuality.electronic_actual_available),
      electronic_actual_reason: nullableString(dataQuality.electronic_actual_reason) || undefined,
      first_shift_at: nullableString(dataQuality.first_shift_at),
      unassigned_invoice_count: dataQuality.unassigned_invoice_count == null ? undefined : n(dataQuality.unassigned_invoice_count),
      unassigned_invoice_amount: dataQuality.unassigned_invoice_amount == null ? undefined : n(dataQuality.unassigned_invoice_amount),
      range_semantics: nullableString(dataQuality.range_semantics) || undefined,
    },
  };
}
