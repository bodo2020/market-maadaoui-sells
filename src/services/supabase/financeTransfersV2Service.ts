import { supabase } from "@/integrations/supabase/client";

export type FinanceTransferLedgerKind = "cash" | "payment";

export type FinanceTransferAccountOption = {
  ledger_kind: FinanceTransferLedgerKind;
  account_id: string;
  account_type: string;
  name: string;
  currency: string;
  balance: number;
  reserved: number;
  available_balance: number;
  responsible_user_id?: string | null;
  responsible_user_name?: string | null;
  shift_id?: string | null;
  assignable: boolean;
};

export type FinanceTransferStatus = "awaiting_sender" | "awaiting_receiver" | "completed" | "rejected" | "exception" | "cancelled";

export type FinanceTransferRowV2 = {
  transfer_id: string;
  amount: number;
  currency: string;
  status: FinanceTransferStatus;
  source_ledger_kind: FinanceTransferLedgerKind;
  source_account_id: string;
  source_account_type: string;
  source_account_name: string;
  source_responsible_user_id: string;
  source_responsible_user_name?: string | null;
  destination_ledger_kind: FinanceTransferLedgerKind;
  destination_account_id: string;
  destination_account_type: string;
  destination_account_name: string;
  destination_responsible_user_id: string;
  destination_responsible_user_name?: string | null;
  requested_by: string;
  requested_by_name?: string | null;
  requested_at: string;
  source_task_id?: string | null;
  destination_task_id?: string | null;
  sender_confirmed_at?: string | null;
  receiver_confirmed_at?: string | null;
  rejection_stage?: "sender" | "receiver" | null;
  rejection_reason?: string | null;
  rejected_at?: string | null;
  reference?: string | null;
  note?: string | null;
  updated_at: string;
};

export type FinanceTransfersWorkspaceV2 = {
  version: number;
  branch_id: string;
  summary: {
    in_transit_amount: number;
    exception_count: number;
  };
  items: FinanceTransferRowV2[];
  generated_at: string;
};

export type FinanceTransferTaskV2 = {
  task_id: string;
  task_status: string;
  stage: "sender" | "receiver";
  is_retry?: boolean;
  transfer_id: string;
  transfer_status: FinanceTransferStatus;
  amount: number;
  currency: string;
  source_account_name: string;
  destination_account_name: string;
  requested_at: string;
  reference?: string | null;
  note?: string | null;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function transferError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.");
  if (value.includes("FINANCE_BRANCH_ACCESS_DENIED")) return new Error("ليس لديك وصول لهذا الفرع.");
  if (value.includes("FINANCE_MANAGE_DENIED")) return new Error("ليس لديك صلاحية إدارة التحويلات المالية.");
  if (value.includes("FINANCE_VIEW_DENIED")) return new Error("ليس لديك صلاحية عرض التحويلات المالية.");
  if (value.includes("FINANCE_TRANSFER_AMOUNT_INVALID")) return new Error("أدخل مبلغ تحويل أكبر من صفر.");
  if (value.includes("FINANCE_TRANSFER_NOTE_REQUIRED")) return new Error("اكتب سبب أو ملاحظة واضحة للتحويل.");
  if (value.includes("FINANCE_TRANSFER_CONFIRM_NOTE_REQUIRED")) return new Error("اكتب ملاحظة تأكيد واضحة.");
  if (value.includes("FINANCE_TRANSFER_REJECTION_REASON_REQUIRED")) return new Error("اكتب سبب الرفض أو التعذر.");
  if (value.includes("FINANCE_TRANSFER_SAME_ACCOUNT")) return new Error("مصدر التحويل ووجهته لا يمكن أن يكونا نفس الحساب.");
  if (value.includes("FINANCE_TRANSFER_ACCOUNT_UNAVAILABLE")) return new Error("أحد حسابات التحويل غير متاح حاليًا.");
  if (value.includes("FINANCE_TRANSFER_SOURCE_HAS_NO_RESPONSIBLE")) return new Error("مصدر التحويل ليس له مسؤول عهدة حالي.");
  if (value.includes("FINANCE_TRANSFER_DESTINATION_HAS_NO_RESPONSIBLE")) return new Error("وجهة التحويل ليس لها مسؤول عهدة حالي.");
  if (value.includes("FINANCE_TRANSFER_CURRENCY_MISMATCH")) return new Error("عملة المصدر والوجهة مختلفة.");
  if (value.includes("FINANCE_TRANSFER_INSUFFICIENT_AVAILABLE")) return new Error("الرصيد المتاح بعد الحجوزات لا يكفي للتحويل.");
  if (value.includes("FINANCE_TRANSFER_INSUFFICIENT_BALANCE")) return new Error("الرصيد الحالي لمصدر التحويل لم يعد كافيًا.");
  if (value.includes("FINANCE_TRANSFER_TASK_NOT_OWNER")) return new Error("مهمة التحويل ليست مسندة لحسابك.");
  if (value.includes("FINANCE_TRANSFER_SOURCE_RESPONSIBILITY_CHANGED")) return new Error("مسؤولية مصدر التحويل تغيرت. ارجع العملية للمالية.");
  if (value.includes("FINANCE_TRANSFER_DESTINATION_RESPONSIBILITY_CHANGED")) return new Error("مسؤولية وجهة التحويل تغيرت. أعد إسناد الاستلام.");
  if (value.includes("FINANCE_TRANSFER_NOT_RETRYABLE")) return new Error("هذا التحويل ليس في حالة تسمح بإعادة محاولة الاستلام.");
  if (value.includes("FINANCE_TRANSFER_ALREADY_HANDED_OVER")) return new Error("تم تسليم المبلغ بالفعل؛ لا يمكن إلغاء التحويل من المالية مباشرة.");
  return new Error(message || "تعذر تنفيذ التحويل المالي.");
}

export async function fetchFinanceTransferOptionsV2(branchId: string): Promise<FinanceTransferAccountOption[]> {
  const { data, error } = await rpc("get_finance_transfer_options_v2", { p_branch_id: branchId });
  if (error) throw transferError(error.message);
  const items = (data as { items?: FinanceTransferAccountOption[] } | null)?.items;
  return Array.isArray(items) ? items : [];
}

export async function fetchFinanceTransfersV2(branchId: string, limit = 100): Promise<FinanceTransfersWorkspaceV2> {
  const { data, error } = await rpc("get_finance_transfers_v2", { p_branch_id: branchId, p_limit: limit });
  if (error) throw transferError(error.message);
  return data as FinanceTransfersWorkspaceV2;
}

export async function createFinanceTransferV2(input: {
  branchId: string;
  source: FinanceTransferAccountOption;
  destination: FinanceTransferAccountOption;
  amount: number;
  note: string;
  reference?: string | null;
}) {
  const { data, error } = await rpc("create_finance_transfer_v2", {
    p_branch_id: input.branchId,
    p_source_ledger_kind: input.source.ledger_kind,
    p_source_account_id: input.source.account_id,
    p_destination_ledger_kind: input.destination.ledger_kind,
    p_destination_account_id: input.destination.account_id,
    p_amount: input.amount,
    p_note: input.note.trim(),
    p_reference: input.reference?.trim() || null,
  });
  if (error) throw transferError(error.message);
  return data as { ok: boolean; transfer_id: string; status: string; task_id: string };
}

export async function fetchMyFinanceTransferTasksV2(branchId?: string | null): Promise<FinanceTransferTaskV2[]> {
  const { data, error } = await rpc("get_my_finance_transfer_tasks_v2", { p_branch_id: branchId || null });
  if (error) throw transferError(error.message);
  const items = (data as { items?: FinanceTransferTaskV2[] } | null)?.items;
  return Array.isArray(items) ? items : [];
}

export async function confirmFinanceTransferTaskV2(task: FinanceTransferTaskV2, note: string) {
  const name = task.stage === "sender" ? "confirm_finance_transfer_handover_v2" : "confirm_finance_transfer_receipt_v2";
  const { data, error } = await rpc(name, { p_task_id: task.task_id, p_note: note.trim() });
  if (error) throw transferError(error.message);
  return data as { ok: boolean; transfer_id: string; status: string };
}

export async function rejectFinanceTransferTaskV2(task: FinanceTransferTaskV2, reason: string) {
  const name = task.stage === "sender" ? "reject_finance_transfer_handover_v2" : "reject_finance_transfer_receipt_v2";
  const { data, error } = await rpc(name, { p_task_id: task.task_id, p_reason: reason.trim() });
  if (error) throw transferError(error.message);
  return data as { ok: boolean; transfer_id: string; status: string };
}

export async function retryFinanceTransferReceiptV2(transferId: string, note: string) {
  const { data, error } = await rpc("retry_finance_transfer_receipt_v2", { p_transfer_id: transferId, p_note: note.trim() });
  if (error) throw transferError(error.message);
  return data as { ok: boolean; transfer_id: string; status: string; task_id: string };
}

export async function cancelFinanceTransferV2(transferId: string, reason: string) {
  const { data, error } = await rpc("cancel_finance_transfer_v2", { p_transfer_id: transferId, p_reason: reason.trim() });
  if (error) throw transferError(error.message);
  return data as { ok: boolean; transfer_id: string; status: string };
}
