import { supabase } from "@/integrations/supabase/client";

export type FinanceReconciliationSeverity = "critical" | "high" | "medium" | string;

export type FinanceReconciliationIssue = {
  severity: FinanceReconciliationSeverity;
  issue_type: string;
  source_kind: string;
  source_id: string;
  amount: number;
  title: string;
  description: string;
  action: string;
  can_repair: boolean;
  occurred_at: string;
  metadata: Record<string, unknown>;
};

export type FinanceReconciliationSummary = {
  attention_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  online_missing_count: number;
  online_missing_amount: number;
  paid_cancelled_unrefunded_count: number;
  paid_cancelled_unrefunded_amount: number;
  shift_variance_count: number;
  shift_variance_amount: number;
  pending_handoff_count: number;
  pending_handoff_amount: number;
  pending_refund_count: number;
  pending_refund_amount: number;
  pending_settlement_count: number;
  pending_settlement_amount: number;
  delivery_cash_outstanding: number;
  gateway_clearing_balance: number;
};

export type FinanceReconciliationControl = {
  version: number;
  branch_id: string;
  permissions: {
    can_manage: boolean;
  };
  summary: FinanceReconciliationSummary;
  issues: FinanceReconciliationIssue[];
  data_quality?: {
    trusted_financial_start?: string;
    legacy_without_receipt_excluded?: boolean;
  };
  generated_at: string;
};

type RpcResult = Promise<{
  data: unknown;
  error: { message?: string; code?: string } | null;
}>;

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => RpcResult;

function reconciliationError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.");
  if (value.includes("FINANCE_BRANCH_ACCESS_DENIED")) return new Error("ليس لديك وصول مالي لهذا الفرع.");
  if (value.includes("FINANCE_RECONCILIATION_VIEW_DENIED")) return new Error("ليس لديك صلاحية عرض المصالحة المالية.");
  if (value.includes("FINANCE_RECONCILIATION_REPAIR_DENIED")) return new Error("ليس لديك صلاحية إصلاح قيود المصالحة.");
  if (value.includes("FINANCE_RECONCILIATION_LEGACY_ORDER_REVIEW_REQUIRED")) {
    return new Error("الطلب قديم وغير موثق ضمن حقبة الـLedger الحالية؛ يحتاج مراجعة يدوية بدل إنشاء قيد تلقائي.");
  }
  return new Error(message || "تعذر تنفيذ عملية المصالحة المالية.");
}

export async function fetchFinanceReconciliationControl(
  branchId: string,
  limit = 100,
): Promise<FinanceReconciliationControl> {
  const { data, error } = await rpc("get_finance_reconciliation_control_v1", {
    p_branch_id: branchId,
    p_limit: limit,
  });
  if (error) throw reconciliationError(error.message);
  return data as FinanceReconciliationControl;
}

export async function repairOnlineOrderFinancialLedger(
  orderId: string,
  note = "إصلاح يدوي من مركز المصالحة المالية",
): Promise<Record<string, unknown>> {
  const { data, error } = await rpc("repair_online_order_financial_ledger_v1", {
    p_order_id: orderId,
    p_note: note,
  });
  if (error) throw reconciliationError(error.message);
  return (data || {}) as Record<string, unknown>;
}
