import { supabase } from "@/integrations/supabase/client";

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const s = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

export type FinanceSettlementTargetKind = "bank" | "safe";

export interface FinanceSettlementSourceV2 {
  account_id: string;
  account_type: string;
  provider_code: string;
  account_name: string;
  active: boolean;
  balance: number;
  payment_method_id: string | null;
  payment_method_code: string;
  payment_method_name: string;
  method_type: string;
  method_active: boolean | null;
}

export interface FinanceSettlementTargetV2 {
  account_id: string;
  target_kind: FinanceSettlementTargetKind;
  name: string;
  provider_code: string;
  active: boolean;
  balance: number;
}

export interface FinanceSettlementHistoryV2 {
  settlement_id: string;
  request_id: string | null;
  payment_method: string;
  payment_method_name: string;
  source_account_id: string;
  source_account_name: string;
  target_kind: FinanceSettlementTargetKind;
  target_account_id: string | null;
  target_account_name: string | null;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  provider_reference: string | null;
  note: string | null;
  settled_at: string;
  created_by: string | null;
  created_by_name: string | null;
}

export interface FinanceSettlementWorkspaceV2 {
  version: number;
  branch_id: string;
  permissions: { can_manage: boolean };
  sources: FinanceSettlementSourceV2[];
  targets: FinanceSettlementTargetV2[];
  recent_transfers: FinanceSettlementHistoryV2[];
  generated_at: string;
}

export interface FinanceSettlementTransferResultV2 {
  version: number;
  request_replayed: boolean;
  settlement_id: string;
  request_id: string;
  payment_method: string;
  payment_method_name: string;
  source_account_id: string;
  source_account_name: string;
  target_kind: FinanceSettlementTargetKind;
  target_account_id: string;
  target_account_name: string;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  source_balance_after: number;
  target_balance_after: number;
  provider_reference: string | null;
  note: string | null;
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function financeSettlementError(message?: string) {
  switch (message) {
    case "FINANCE_VIEW_DENIED": return "حسابك غير مسموح له بعرض مركز تسويات وسائل الدفع.";
    case "FINANCE_MANAGE_DENIED": return "حسابك غير مسموح له بتنفيذ تحويلات التسوية.";
    case "INVALID_TRANSFER_REQUEST": return "طلب التحويل غير مكتمل. أعد فتح شاشة التسوية وحاول مرة أخرى.";
    case "INVALID_TARGET_KIND": return "جهة التوريد غير صحيحة.";
    case "INVALID_AMOUNT": return "راجع مبلغ التسوية والرسوم. صافي التوريد لازم يكون أكبر من صفر.";
    case "SOURCE_ACCOUNT_UNAVAILABLE": return "حساب وسيلة الدفع لم يعد متاحًا لهذا الفرع.";
    case "TARGET_ACCOUNT_UNAVAILABLE": return "حساب الاستلام غير متاح لهذا الفرع.";
    case "SAME_ACCOUNT_TRANSFER": return "لا يمكن التحويل إلى نفس حساب التسوية.";
    case "REQUEST_CONFLICT": return "نفس طلب التحويل استُخدم ببيانات مختلفة. أعد فتح العملية قبل المحاولة.";
    case "INSUFFICIENT_SETTLEMENT_BALANCE": return "المبلغ أكبر من الرصيد الحالي لحساب وسيلة الدفع. حدّث الأرصدة أولًا.";
    default: return message || "تعذر تنفيذ تسوية وسيلة الدفع.";
  }
}

export async function fetchFinanceSettlementWorkspaceV2(branchId: string, limit = 50): Promise<FinanceSettlementWorkspaceV2> {
  const { data, error } = await rpc("get_finance_settlement_workspace_v2", {
    p_branch_id: branchId,
    p_limit: limit,
  });
  if (error) throw new Error(financeSettlementError(error.message));
  if (!data || typeof data !== "object") throw new Error("FINANCE_SETTLEMENT_WORKSPACE_EMPTY");
  const raw = data as Record<string, any>;
  return {
    version: n(raw.version) || 2,
    branch_id: String(raw.branch_id || branchId),
    permissions: { can_manage: Boolean(raw.permissions?.can_manage) },
    generated_at: String(raw.generated_at || new Date().toISOString()),
    sources: (raw.sources || []).map((row: Record<string, unknown>) => ({
      account_id: String(row.account_id || ""),
      account_type: String(row.account_type || "gateway_clearing"),
      provider_code: String(row.provider_code || "other"),
      account_name: String(row.account_name || "حساب تسوية"),
      active: Boolean(row.active),
      balance: n(row.balance),
      payment_method_id: s(row.payment_method_id),
      payment_method_code: String(row.payment_method_code || row.provider_code || "other"),
      payment_method_name: String(row.payment_method_name || row.account_name || "وسيلة دفع"),
      method_type: String(row.method_type || "other"),
      method_active: row.method_active == null ? null : Boolean(row.method_active),
    })),
    targets: (raw.targets || []).map((row: Record<string, unknown>) => ({
      account_id: String(row.account_id || ""),
      target_kind: String(row.target_kind || "safe") as FinanceSettlementTargetKind,
      name: String(row.name || "حساب استلام"),
      provider_code: String(row.provider_code || ""),
      active: Boolean(row.active),
      balance: n(row.balance),
    })),
    recent_transfers: (raw.recent_transfers || []).map((row: Record<string, unknown>) => ({
      settlement_id: String(row.settlement_id || ""),
      request_id: s(row.request_id),
      payment_method: String(row.payment_method || "other"),
      payment_method_name: String(row.payment_method_name || row.payment_method || "وسيلة دفع"),
      source_account_id: String(row.source_account_id || ""),
      source_account_name: String(row.source_account_name || "حساب تسوية"),
      target_kind: String(row.target_kind || "bank") as FinanceSettlementTargetKind,
      target_account_id: s(row.target_account_id),
      target_account_name: s(row.target_account_name),
      gross_amount: n(row.gross_amount),
      fee_amount: n(row.fee_amount),
      net_amount: n(row.net_amount),
      provider_reference: s(row.provider_reference),
      note: s(row.note),
      settled_at: String(row.settled_at || ""),
      created_by: s(row.created_by),
      created_by_name: s(row.created_by_name),
    })),
  };
}

export async function transferPaymentSettlementV2(input: {
  requestId: string;
  branchId: string;
  sourceAccountId: string;
  targetKind: FinanceSettlementTargetKind;
  targetAccountId?: string | null;
  grossAmount: number;
  feeAmount?: number;
  providerReference?: string | null;
  note?: string | null;
}): Promise<FinanceSettlementTransferResultV2> {
  const { data, error } = await rpc("transfer_payment_settlement_v2", {
    p_request_id: input.requestId,
    p_branch_id: input.branchId,
    p_source_account_id: input.sourceAccountId,
    p_target_kind: input.targetKind,
    p_target_account_id: input.targetAccountId || null,
    p_gross_amount: input.grossAmount,
    p_fee_amount: input.feeAmount || 0,
    p_provider_reference: input.providerReference?.trim() || null,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(financeSettlementError(error.message));
  if (!data || typeof data !== "object") throw new Error("لم يصل تأكيد عملية التسوية.");
  const row = data as Record<string, unknown>;
  return {
    version: n(row.version) || 2,
    request_replayed: Boolean(row.request_replayed),
    settlement_id: String(row.settlement_id || ""),
    request_id: String(row.request_id || input.requestId),
    payment_method: String(row.payment_method || "other"),
    payment_method_name: String(row.payment_method_name || "وسيلة دفع"),
    source_account_id: String(row.source_account_id || input.sourceAccountId),
    source_account_name: String(row.source_account_name || "حساب تسوية"),
    target_kind: String(row.target_kind || input.targetKind) as FinanceSettlementTargetKind,
    target_account_id: String(row.target_account_id || input.targetAccountId || ""),
    target_account_name: String(row.target_account_name || "حساب الاستلام"),
    gross_amount: n(row.gross_amount),
    fee_amount: n(row.fee_amount),
    net_amount: n(row.net_amount),
    source_balance_after: n(row.source_balance_after),
    target_balance_after: n(row.target_balance_after),
    provider_reference: s(row.provider_reference),
    note: s(row.note),
  };
}
