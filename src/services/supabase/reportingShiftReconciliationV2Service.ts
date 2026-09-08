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

export interface ReportingShiftReconciliationRowV2 {
  shift_id: string;
  payment_method_id: string | null;
  code: string;
  name: string;
  method_type: string;
  settlement_account_id: string | null;
  expected_source: string;
  sale_count: number;
  base_amount: number;
  charged_amount: number;
  customer_fee_amount: number;
  merchant_fee_amount: number;
  confirmed_refund_amount: number;
  pending_refund_amount: number;
  expected_amount: number | null;
  counted_amount: number | null;
  variance_amount: number | null;
  variance_reason: string | null;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string;
}

export interface ReportingShiftReconciliationsV2 {
  version: number;
  branch_id: string;
  from: string;
  to: string;
  permissions: { can_view_reconciliation: boolean };
  rows: ReportingShiftReconciliationRowV2[];
}

export async function fetchReportingShiftReconciliationsV2(
  branchId: string,
  from: Date,
  to: Date,
  limit = 2000,
): Promise<ReportingShiftReconciliationsV2> {
  const { data, error } = await supabase.rpc("get_reporting_shift_reconciliations_v2" as never, {
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_limit: limit,
  } as never);

  if (error) throw error;
  if (!data) throw new Error("REPORTING_SHIFT_RECONCILIATIONS_EMPTY");

  const raw = data as unknown as Record<string, any>;
  return {
    version: n(raw.version) || 2,
    branch_id: String(raw.branch_id || branchId),
    from: String(raw.from || from.toISOString()),
    to: String(raw.to || to.toISOString()),
    permissions: { can_view_reconciliation: Boolean(raw.permissions?.can_view_reconciliation) },
    rows: (raw.rows || []).map((row: Record<string, unknown>) => ({
      shift_id: String(row.shift_id || ""),
      payment_method_id: nullableString(row.payment_method_id),
      code: String(row.code || "other"),
      name: String(row.name || "وسيلة دفع"),
      method_type: String(row.method_type || "other"),
      settlement_account_id: nullableString(row.settlement_account_id),
      expected_source: String(row.expected_source || "unknown"),
      sale_count: n(row.sale_count),
      base_amount: n(row.base_amount),
      charged_amount: n(row.charged_amount),
      customer_fee_amount: n(row.customer_fee_amount),
      merchant_fee_amount: n(row.merchant_fee_amount),
      confirmed_refund_amount: n(row.confirmed_refund_amount),
      pending_refund_amount: n(row.pending_refund_amount),
      expected_amount: nullableNumber(row.expected_amount),
      counted_amount: nullableNumber(row.counted_amount),
      variance_amount: nullableNumber(row.variance_amount),
      variance_reason: nullableString(row.variance_reason),
      confirmed_by: nullableString(row.confirmed_by),
      confirmed_by_name: nullableString(row.confirmed_by_name),
      confirmed_at: String(row.confirmed_at || ""),
    })),
  };
}
