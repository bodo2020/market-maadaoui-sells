import { supabase } from "@/integrations/supabase/client";

export type FinanceSettlementTargetKindV3 = "safe" | "bank";
export type FinanceSettlementStatusV3 = "awaiting_receiver" | "completed" | "exception";

export type FinanceSettlementSourceV3 = {
  account_id: string;
  account_name: string;
  provider_code: string;
  active: boolean;
  balance: number;
  payment_method_id?: string | null;
  payment_method_code: string;
  payment_method_name: string;
  method_type: string;
  method_active?: boolean | null;
  fee_type: "none" | "percent" | "fixed" | string;
  fee_value: number;
  fee_bearer: string;
  require_reference: boolean;
};

export type FinanceSettlementTargetV3 = {
  account_id: string;
  target_kind: FinanceSettlementTargetKindV3;
  name: string;
  balance: number;
  responsible_user_id?: string | null;
  responsible_user_name?: string | null;
  assignable: boolean;
};

export type FinanceSettlementRowV3 = {
  settlement_id: string;
  request_id?: string | null;
  status: FinanceSettlementStatusV3;
  payment_method: string;
  payment_method_name: string;
  source_account_id: string;
  source_account_name: string;
  target_kind: FinanceSettlementTargetKindV3;
  target_account_id: string;
  target_account_name: string;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  provider_reference?: string | null;
  note?: string | null;
  requested_at?: string | null;
  received_at?: string | null;
  responsible_user_id?: string | null;
  responsible_user_name?: string | null;
  receiver_task_id?: string | null;
  receiver_task_status?: string | null;
  receiver_confirmed_by?: string | null;
  receiver_confirmed_by_name?: string | null;
  receiver_note?: string | null;
  failure_reason?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
};

export type FinanceSettlementWorkspaceV3 = {
  version: number;
  branch_id: string;
  permissions: { can_manage: boolean };
  sources: FinanceSettlementSourceV3[];
  targets: FinanceSettlementTargetV3[];
  recent_settlements: FinanceSettlementRowV3[];
  generated_at: string;
};

export type MySettlementReceiptTaskV3 = {
  task_id: string;
  task_status: string;
  settlement_id: string;
  branch_id: string;
  payment_method_name: string;
  source_account_name: string;
  target_kind: FinanceSettlementTargetKindV3;
  target_account_name: string;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  provider_reference?: string | null;
  requested_at?: string | null;
  status: FinanceSettlementStatusV3;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function settlementError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.");
  if (value.includes("FINANCE_BRANCH_ACCESS_DENIED")) return new Error("ليس لديك وصول مالي لهذا الفرع.");
  if (value.includes("FINANCE_VIEW_DENIED")) return new Error("ليس لديك صلاحية عرض التسويات.");
  if (value.includes("FINANCE_MANAGE_DENIED")) return new Error("ليس لديك صلاحية تنفيذ التسويات.");
  if (value.includes("SETTLEMENT_SOURCE_UNAVAILABLE")) return new Error("حساب التسوية لم يعد متاحًا.");
  if (value.includes("SETTLEMENT_TARGET_UNAVAILABLE")) return new Error("حساب الاستلام لم يعد متاحًا.");
  if (value.includes("SETTLEMENT_TARGET_HAS_NO_RESPONSIBLE")) return new Error("عيّن مسؤولًا للخزنة أو البنك قبل إرسال التسوية.");
  if (value.includes("SETTLEMENT_TARGET_RESPONSIBLE_UNAVAILABLE")) return new Error("مسؤول حساب الاستلام لم يعد موظفًا نشطًا في الفرع.");
  if (value.includes("INSUFFICIENT_SETTLEMENT_BALANCE")) return new Error("رصيد وسيلة الدفع أقل من إجمالي التسوية.");
  if (value.includes("SETTLEMENT_REFERENCE_REQUIRED")) return new Error("مرجع التسوية مطلوب لهذه الوسيلة.");
  if (value.includes("SETTLEMENT_AMOUNT_INVALID")) return new Error("راجع الإجمالي والعمولة. يجب أن يكون الصافي أكبر من صفر.");
  if (value.includes("REQUEST_CONFLICT")) return new Error("تم استخدام رقم طلب التسوية نفسه ببيانات مختلفة.");
  if (value.includes("SETTLEMENT_TASK_NOT_OWNER")) return new Error("مهمة الاستلام ليست مسندة لحسابك.");
  if (value.includes("SETTLEMENT_RESPONSIBILITY_CHANGED")) return new Error("مسؤولية الخزنة/البنك تغيرت. اطلب من المالية إعادة إسناد الاستلام.");
  if (value.includes("SETTLEMENT_RECEIPT_NOTE_REQUIRED")) return new Error("اكتب ملاحظة تؤكد الاستلام.");
  if (value.includes("SETTLEMENT_REJECTION_REASON_REQUIRED")) return new Error("اكتب سبب رفض أو تعذر الاستلام.");
  if (value.includes("SETTLEMENT_RETRY_NOTE_REQUIRED")) return new Error("اكتب سبب إعادة إرسال مهمة الاستلام.");
  return new Error(message || "تعذر تنفيذ عملية التسوية.");
}

export async function fetchFinanceSettlementWorkspaceV3(branchId: string, limit = 100): Promise<FinanceSettlementWorkspaceV3> {
  const { data, error } = await rpc("get_finance_settlement_workspace_v3", { p_branch_id: branchId, p_limit: limit });
  if (error) throw settlementError(error.message);
  return data as FinanceSettlementWorkspaceV3;
}

export async function createPaymentSettlementV3(input: {
  requestId: string;
  branchId: string;
  sourceAccountId: string;
  targetKind: FinanceSettlementTargetKindV3;
  targetAccountId: string;
  grossAmount: number;
  feeAmount: number;
  providerReference?: string | null;
  note?: string | null;
}) {
  const { data, error } = await rpc("create_payment_settlement_v3", {
    p_request_id: input.requestId,
    p_branch_id: input.branchId,
    p_source_account_id: input.sourceAccountId,
    p_target_kind: input.targetKind,
    p_target_account_id: input.targetAccountId,
    p_gross_amount: input.grossAmount,
    p_fee_amount: input.feeAmount,
    p_provider_reference: input.providerReference?.trim() || null,
    p_note: input.note?.trim() || null,
  });
  if (error) throw settlementError(error.message);
  return data as { ok: boolean; idempotent: boolean; settlement_id: string; status: string; receiver_task_id: string; responsible_user_name: string; source_account_name: string; target_account_name: string; gross_amount: number; fee_amount: number; net_amount: number };
}

export async function fetchMySettlementReceiptTasksV3(limit = 30): Promise<MySettlementReceiptTaskV3[]> {
  const { data, error } = await rpc("get_my_payment_settlement_tasks_v3", { p_limit: limit });
  if (error) throw settlementError(error.message);
  const items = (data as { items?: MySettlementReceiptTaskV3[] } | null)?.items;
  return Array.isArray(items) ? items : [];
}

export async function confirmSettlementReceiptV3(taskId: string, note: string) {
  const { data, error } = await rpc("confirm_payment_settlement_receipt_v3", { p_task_id: taskId, p_note: note.trim() });
  if (error) throw settlementError(error.message);
  return data as { ok: boolean; idempotent: boolean; settlement_id: string; status: string; net_amount: number; destination_balance_after?: number };
}

export async function rejectSettlementReceiptV3(taskId: string, reason: string) {
  const { data, error } = await rpc("reject_payment_settlement_receipt_v3", { p_task_id: taskId, p_reason: reason.trim() });
  if (error) throw settlementError(error.message);
  return data as { ok: boolean; settlement_id: string; status: string; net_amount: number };
}

export async function retrySettlementReceiptV3(settlementId: string, note: string) {
  const { data, error } = await rpc("retry_payment_settlement_receipt_v3", { p_settlement_id: settlementId, p_note: note.trim() });
  if (error) throw settlementError(error.message);
  return data as { ok: boolean; settlement_id: string; status: string; task_id: string; responsible_user_id: string; responsible_user_name: string };
}
