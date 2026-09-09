import { supabase } from "@/integrations/supabase/client";

export type OperationsTaskStatus = "open" | "claimed" | "in_progress" | "completed" | "failed" | "cancelled";
export type OperationsTaskScope = "available" | "mine" | "active" | "overdue" | "completed" | "all";

export type OperationsTask = {
  id: string;
  branch_id: string;
  task_type: string;
  source_kind: "pos_refund" | "online_refund" | "shift_reconciliation" | "cash_handoff" | string;
  source_id: string;
  return_id?: string | null;
  sale_id?: string | null;
  order_id?: string | null;
  payment_method_id?: string | null;
  payment_method_code?: string | null;
  payment_method_name?: string | null;
  method_code?: string | null;
  amount: number;
  priority: "normal" | "high" | "urgent" | string;
  status: OperationsTaskStatus;
  title: string;
  description?: string | null;
  claimed_by?: string | null;
  claimed_by_name?: string | null;
  claimed_at?: string | null;
  started_at?: string | null;
  completed_by?: string | null;
  completed_by_name?: string | null;
  completed_at?: string | null;
  due_at?: string | null;
  provider_reference?: string | null;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown> | null;
  invoice_number?: string | null;
  reference_number?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  shift_id?: string | null;
  cashier_name?: string | null;
  expected_amount?: number | null;
  counted_amount?: number | null;
  variance_amount?: number | null;
  variance_reason?: string | null;
  is_mine: boolean;
  is_overdue: boolean;
  can_claim: boolean;
  can_release: boolean;
};

export type OperationsTaskEvent = {
  id: string;
  event_type: string;
  actor_id?: string | null;
  actor_name?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function operationsTaskError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجّل الدخول مرة أخرى.");
  if (value.includes("TASK_BRANCH_ACCESS_DENIED")) return new Error("الفرع الحالي خارج نطاق صلاحيتك.");
  if (value.includes("TASK_CLAIM_DENIED") || value.includes("TASK_ACTION_DENIED")) return new Error("ليس لديك صلاحية تنفيذ هذه المهمة.");
  if (value.includes("TASK_ALREADY_CLAIMED")) return new Error("المهمة استلمها موظف آخر بالفعل. تم تحديث القائمة.");
  if (value.includes("TASK_NOT_OWNER")) return new Error("المهمة لم تعد مسندة لك. تم تحديث القائمة.");
  if (value.includes("TASK_NOT_FOUND")) return new Error("المهمة لم تعد موجودة.");
  if (value.includes("TASK_NOT_STARTABLE")) return new Error("المهمة لا يمكن بدء تنفيذها في حالتها الحالية.");
  if (value.includes("TASK_NOT_RELEASABLE")) return new Error("المهمة لا يمكن إرجاعها للطابور في حالتها الحالية.");
  if (value.includes("TASK_RELEASE_DENIED")) return new Error("لا يمكنك إرجاع مهمة موظف آخر للطابور.");
  if (value.includes("TASK_NOT_COMPLETABLE")) return new Error("المهمة لا يمكن إتمامها في حالتها الحالية.");
  if (value.includes("TASK_COMPLETION_NOTE_REQUIRED")) return new Error("اكتب نتيجة المراجعة قبل إغلاق المهمة.");
  if (value.includes("TASK_REQUIRES_SPECIAL_COMPLETION")) return new Error("هذه المهمة يجب إتمامها من مسار تأكيد التحويل.");
  if (value.includes("TASK_FAILURE_REASON_REQUIRED")) return new Error("اكتب سبب تعذر التنفيذ.");
  if (value.includes("PROVIDER_REFERENCE_REQUIRED")) return new Error("اكتب رقم العملية أو المرجع قبل تأكيد التحويل.");
  if (value.includes("REFUND_NOT_PENDING")) return new Error("رد المبلغ لم يعد معلقًا لدى مزود الدفع.");
  if (value.includes("REFUND_PERMISSION_DENIED") || value.includes("ONLINE_DIGITAL_SETTLE_DENIED")) return new Error("ليس لديك صلاحية تأكيد رد المبلغ بهذه الوسيلة.");
  return new Error(message || "تعذر تنفيذ الإجراء على المهمة.");
}

export function isRefundTransferTask(task: Pick<OperationsTask, "task_type" | "source_kind">) {
  return task.task_type === "refund_transfer" || task.source_kind === "pos_refund" || task.source_kind === "online_refund";
}

export function isShiftReconciliationTask(task: Pick<OperationsTask, "task_type" | "source_kind">) {
  return task.task_type === "shift_variance_review" || task.source_kind === "shift_reconciliation";
}

export function isCashHandoffVarianceTask(task: Pick<OperationsTask, "task_type" | "source_kind">) {
  return task.task_type === "cash_handoff_variance_review" || task.source_kind === "cash_handoff";
}

export function isOperationsReviewTask(task: Pick<OperationsTask, "task_type" | "source_kind">) {
  return isShiftReconciliationTask(task) || isCashHandoffVarianceTask(task);
}

export async function fetchOperationsTasks(branchId: string, scope: OperationsTaskScope = "all", limit = 250): Promise<OperationsTask[]> {
  const { data, error } = await rpc("list_operations_tasks", { p_branch_id: branchId, p_scope: scope, p_limit: limit });
  if (error) throw operationsTaskError(error.message);
  return Array.isArray(data) ? (data as OperationsTask[]) : [];
}

export async function fetchOperationsTaskEvents(taskId: string): Promise<OperationsTaskEvent[]> {
  const { data, error } = await rpc("get_operations_task_events", { p_task_id: taskId });
  if (error) throw operationsTaskError(error.message);
  return Array.isArray(data) ? (data as OperationsTaskEvent[]) : [];
}

export async function claimOperationsTask(taskId: string) {
  const { data, error } = await rpc("claim_operations_task", { p_task_id: taskId });
  if (error) throw operationsTaskError(error.message);
  return data as Record<string, unknown>;
}

export async function startOperationsTask(taskId: string) {
  const { data, error } = await rpc("start_operations_task", { p_task_id: taskId });
  if (error) throw operationsTaskError(error.message);
  return data as Record<string, unknown>;
}

export async function releaseOperationsTask(taskId: string, note?: string) {
  const { data, error } = await rpc("release_operations_task", { p_task_id: taskId, p_note: note?.trim() || null });
  if (error) throw operationsTaskError(error.message);
  return data as Record<string, unknown>;
}

export async function failOperationsTask(taskId: string, reason: string) {
  const { data, error } = await rpc("fail_operations_task", { p_task_id: taskId, p_reason: reason.trim() });
  if (error) throw operationsTaskError(error.message);
  return data as Record<string, unknown>;
}

export async function completeOperationsTask(taskId: string, note: string) {
  const { data, error } = await rpc("complete_operations_task", { p_task_id: taskId, p_note: note.trim() });
  if (error) throw operationsTaskError(error.message);
  return data as Record<string, unknown>;
}

export async function completeRefundTransferTask(taskId: string, providerReference: string) {
  const { data, error } = await rpc("complete_refund_transfer_task", {
    p_task_id: taskId,
    p_provider_reference: providerReference.trim(),
  });
  if (error) throw operationsTaskError(error.message);
  return data as Record<string, unknown>;
}
