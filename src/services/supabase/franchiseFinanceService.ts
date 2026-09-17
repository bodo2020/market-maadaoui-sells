import { supabase } from "@/integrations/supabase/client";

export type FranchiseBalanceDirection =
  | "merchant_owes_platform"
  | "platform_owes_merchant"
  | "balanced";

export type FranchiseSettlementStatus = "draft" | "approved" | "paid" | "cancelled";

export interface FranchiseFinanceWorkspace {
  merchant: {
    id: string;
    name: string;
    code: string;
    status: string;
  };
  agreement: {
    id: string;
    agreement_code: string;
    version: number;
    status: string;
    royalty_rate: number;
    marketing_fee_rate: number;
    platform_fee_rate: number;
    monthly_fixed_fee: number;
    currency: string;
    settlement_cycle: string;
  } | null;
  period: {
    start: string;
    end: string;
  };
  sales: {
    pos_count: number;
    pos_gross: number;
    online_delivered_count: number;
    online_merchandise_gross: number;
    total_fee_basis: number;
    unaccrued_pos_count: number;
    unaccrued_online_count: number;
  };
  fees: {
    royalty: number;
    marketing: number;
    platform: number;
    fixed: number;
    adjustments: number;
    period_balance: number;
    unsettled_balance: number;
    balance_direction: FranchiseBalanceDirection;
  };
  settlements: FranchiseSettlement[];
  entries: FranchiseFinancialEntry[];
}

export interface FranchiseSettlement {
  id: string;
  reference: string;
  status: FranchiseSettlementStatus;
  period_start?: string | null;
  period_end: string;
  gross_credits: number;
  total_deductions: number;
  net_payable: number;
  currency: string;
  external_reference?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface FranchiseFinancialEntry {
  id: string;
  branch_id?: string | null;
  entry_type:
    | "franchise_royalty"
    | "franchise_marketing_fee"
    | "franchise_platform_fee"
    | "franchise_fixed_fee"
    | "franchise_adjustment"
    | string;
  signed_amount: number;
  currency: string;
  description?: string | null;
  source_kind: string;
  source_id?: string | null;
  snapshot?: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
  settled: boolean;
}

export interface FranchiseAccrualResult {
  merchant_id: string;
  period_start: string;
  period_end: string;
  pos_sales_scanned: number;
  online_orders_scanned: number;
  fixed_fees_posted: number;
  fixed_fee_amount: number;
  currency: string;
}

export interface FranchiseSettlementResult {
  settlement_id: string;
  reference: string;
  merchant_id: string;
  status: FranchiseSettlementStatus;
  entry_count: number;
  gross_credits: number;
  total_deductions: number;
  net_payable: number;
  currency: string;
  balance_direction: FranchiseBalanceDirection;
}

const errorMap: Record<string, string> = {
  FRANCHISE_FINANCE_INVALID_PERIOD: "الفترة المالية غير صحيحة.",
  FRANCHISE_FINANCE_VIEW_REQUIRED: "لا تملك صلاحية عرض مالية الـFranchise على كل فروع المشغل.",
  FRANCHISE_FINANCE_MANAGE_REQUIRED: "تحتاج صلاحية إدارة المالية على كل فروع مشغل الـFranchise.",
  FRANCHISE_NOT_FOUND: "مشغل الـFranchise غير موجود.",
  FRANCHISE_NO_UNSETTLED_ENTRIES: "لا توجد قيود غير مسواة داخل الفترة المحددة.",
  FRANCHISE_SETTLEMENT_NOT_FOUND: "التسوية غير موجودة أو ليست تسوية Franchise.",
  FRANCHISE_SETTLEMENT_NOT_DRAFT: "لا يمكن اعتماد التسوية لأنها ليست في حالة مسودة.",
  FRANCHISE_SETTLEMENT_NOT_APPROVED: "يجب اعتماد التسوية قبل تسجيل الدفع.",
  FRANCHISE_PAYMENT_REFERENCE_REQUIRED: "رقم مرجع الدفع مطلوب.",
  FRANCHISE_SETTLEMENT_CANNOT_CANCEL: "لا يمكن إلغاء التسوية في حالتها الحالية.",
  FRANCHISE_SETTLEMENT_CANCEL_REASON_REQUIRED: "سبب إلغاء التسوية مطلوب.",
  FRANCHISE_ADJUSTMENT_AMOUNT_REQUIRED: "قيمة القيد اليدوي يجب ألا تساوي صفرًا.",
  FRANCHISE_ADJUSTMENT_REASON_REQUIRED: "سبب القيد اليدوي مطلوب.",
  FRANCHISE_ADJUSTMENT_IDEMPOTENCY_REQUIRED: "تعذر إنشاء مفتاح آمن للقيد اليدوي.",
  FRANCHISE_BRANCH_SCOPE_MISMATCH: "الفرع المحدد لا يتبع مشغل الـFranchise.",
};

function friendlyError(message?: string) {
  const raw = message || "تعذر تنفيذ العملية المالية";
  for (const [key, value] of Object.entries(errorMap)) {
    if (raw.includes(key)) return value;
  }
  return raw;
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) throw new Error(friendlyError(error.message));
  return data as T;
}

export function fetchFranchiseFinanceWorkspace(
  merchantId: string,
  periodStart: string,
  periodEnd: string,
) {
  return rpc<FranchiseFinanceWorkspace>("get_franchise_finance_workspace_v1", {
    p_merchant_id: merchantId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
}

export function accrueFranchisePeriod(merchantId: string, periodStart: string, periodEnd: string) {
  return rpc<FranchiseAccrualResult>("accrue_franchise_period_v1", {
    p_merchant_id: merchantId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
}

export function createFranchiseSettlement(merchantId: string, periodStart: string, periodEnd: string) {
  return rpc<FranchiseSettlementResult>("create_franchise_settlement_v1", {
    p_merchant_id: merchantId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
}

export function approveFranchiseSettlement(settlementId: string, note?: string | null) {
  return rpc<{ settlement_id: string; status: FranchiseSettlementStatus }>(
    "approve_franchise_settlement_v1",
    { p_settlement_id: settlementId, p_note: note ?? null },
  );
}

export function markFranchiseSettlementPaid(
  settlementId: string,
  externalReference: string,
  note?: string | null,
) {
  return rpc<{ settlement_id: string; status: FranchiseSettlementStatus; external_reference: string }>(
    "mark_franchise_settlement_paid_v1",
    {
      p_settlement_id: settlementId,
      p_external_reference: externalReference,
      p_note: note ?? null,
    },
  );
}

export function cancelFranchiseSettlement(settlementId: string, reason: string) {
  return rpc<{ settlement_id: string; status: FranchiseSettlementStatus; released_entries: number }>(
    "cancel_franchise_settlement_v1",
    { p_settlement_id: settlementId, p_reason: reason },
  );
}

export function postFranchiseAdjustment(input: {
  merchantId: string;
  branchId?: string | null;
  signedAmount: number;
  reason: string;
  idempotencyKey: string;
}) {
  return rpc<{ entry_id: string; merchant_id: string; signed_amount: number; currency: string }>(
    "post_franchise_adjustment_v1",
    {
      p_merchant_id: input.merchantId,
      p_branch_id: input.branchId ?? null,
      p_signed_amount: input.signedAmount,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    },
  );
}
