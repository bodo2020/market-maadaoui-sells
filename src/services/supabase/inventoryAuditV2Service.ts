import { supabase } from "@/integrations/supabase/client";

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

export type InventoryAuditGenerationResult = {
  session_id?: string;
  generated: number;
  existing: number;
  eligible_staff: number;
  audit_date: string;
  idempotent?: boolean;
  reason?: string;
  items_per_employee_requested?: number;
  generator_version?: number;
};

export type InventoryAdjustmentReason = "theft" | "damage" | "breakage" | "receiving_error" | "selling_error" | "previous_error" | "unknown";
export type InventoryAdjustmentRejectionReason = "counting_error" | "insufficient_evidence" | "investigation_required" | "other";

export type InventoryAuditTaskDetail = {
  task_id: string;
  task_type: string;
  source_kind: "inventory_count" | "inventory_recount" | "inventory_adjustment" | string;
  status: string;
  due_at?: string | null;
  product_id: string;
  product_name: string;
  barcode?: string | null;
  image_url?: string | null;
  shelf_location?: string | null;
  unit_of_measure?: string | null;
  barcode_type?: string | null;
  blind_count: boolean;
  audit_date?: string | null;
  assigned_to?: string | null;
  assigned_at?: string | null;
  count_status?: string | null;
  is_recount?: boolean;
  system_expected_at_recount?: number | null;
  first_count?: number | null;
  first_variance?: number | null;
  recount?: number | null;
  recount_variance?: number | null;
  verification_status?: string | null;
  purchase_price_snapshot?: number | null;
  variance_value?: number | null;
  post_recount_movement?: number | null;
  current_system_quantity?: number | null;
  current_expected_quantity?: number | null;
  projected_physical_quantity?: number | null;
  current_adjustment_delta?: number | null;
  movement_ledger_gap?: number | null;
  allowed_reason_codes?: InventoryAdjustmentReason[];
};

export type InventoryCountSubmissionResult = {
  task_id: string;
  status: string;
  result: "matched" | "discrepancy" | "matched_system" | "confirmed_variance" | "conflicting" | string;
  recount_task_id?: string | null;
  adjustment_review_task_id?: string | null;
  idempotent?: boolean;
};

export type InventoryAdjustmentResult = {
  task_id: string;
  status: string;
  decision: "approved" | "rejected" | string;
  adjustment_delta?: number;
  quantity_before?: number;
  quantity_after?: number;
  request_id?: string;
  idempotent?: boolean;
};

function inventoryAuditError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجّل الدخول مرة أخرى.");
  if (value.includes("INVENTORY_BRANCH_ACCESS_DENIED") || value.includes("TASK_BRANCH_ACCESS_DENIED")) return new Error("الفرع الحالي خارج نطاق صلاحيتك.");
  if (value.includes("INVENTORY_DAILY_AUDIT_DENIED")) return new Error("ليس لديك صلاحية تشغيل الجرد اليومي.");
  if (value.includes("INVENTORY_TASK_NOT_OWNER") || value.includes("TASK_NOT_OWNER")) return new Error("مهمة الجرد ليست مسندة لك.");
  if (value.includes("INVENTORY_SELF_RECOUNT_DENIED")) return new Error("لا يمكنك إعادة عد منتج قمت بعدّه في المرة الأولى. يجب أن يراجعه موظف آخر.");
  if (value.includes("INVALID_ACTUAL_COUNT")) return new Error("أدخل كمية فعلية صحيحة، موجبة أو صفر، وبحد أقصى 3 منازل عشرية.");
  if (value.includes("INVENTORY_MOVEMENT_LEDGER_GAP")) return new Error("تعذر مطابقة حركات المخزون أثناء المراجعة. لم يتم تغيير المخزون؛ حدّث المهمة وأعد المحاولة.");
  if (value.includes("INVENTORY_ROW_MISSING")) return new Error("سجل مخزون المنتج لم يعد موجودًا في الفرع.");
  if (value.includes("TASK_NOT_SUBMITTABLE")) return new Error("المهمة لا تقبل تسليم العد في حالتها الحالية.");
  if (value.includes("INVENTORY_ADJUSTMENT_REVIEW_DENIED")) return new Error("ليس لديك صلاحية اعتماد تسوية المخزون.");
  if (value.includes("INVALID_INVENTORY_ADJUSTMENT_REASON")) return new Error("اختر سببًا صحيحًا لتسوية المخزون.");
  if (value.includes("INVALID_INVENTORY_REJECTION_REASON")) return new Error("اختر سببًا صحيحًا لرفض التسوية.");
  if (value.includes("INVENTORY_ADJUSTMENT_NOTE_REQUIRED")) return new Error("اكتب ملاحظة توضح قرار المراجعة.");
  if (value.includes("INVENTORY_ADJUSTMENT_ALREADY_RECONCILED")) return new Error("الرصيد أصبح مطابقًا بالفعل ولا يحتاج تسوية.");
  if (value.includes("INVENTORY_ADJUSTMENT_NOT_REQUIRED")) return new Error("نتيجة إعادة العد لا تتطلب تسوية مخزون.");
  if (value.includes("INVENTORY_RECOUNT_INCOMPLETE")) return new Error("إعادة العد غير مكتملة ولا يمكن اعتماد التسوية.");
  return new Error(message || "تعذر تنفيذ إجراء الجرد.");
}

// Kept under the V2 client name for backward compatibility. The server now owns the
// daily 5–10 item selection so old callers cannot accidentally force a fixed count.
export async function ensureDailyInventoryAuditTasksV2(branchId: string, _itemsPerEmployee = 5) {
  const { data, error } = await rpc("ensure_daily_inventory_audit_tasks_v3", {
    p_branch_id: branchId,
    p_audit_date: null,
  });
  if (error) throw inventoryAuditError(error.message);
  return data as InventoryAuditGenerationResult;
}

export async function fetchInventoryAuditTaskV2(taskId: string) {
  const { data, error } = await rpc("get_inventory_audit_task_v2", { p_task_id: taskId });
  if (error) throw inventoryAuditError(error.message);
  return data as InventoryAuditTaskDetail;
}

export async function submitInventoryCountV2(taskId: string, actualCount: number, note?: string) {
  const { data, error } = await rpc("submit_inventory_count_v2", {
    p_task_id: taskId,
    p_actual_count: actualCount,
    p_note: note?.trim() || null,
  });
  if (error) throw inventoryAuditError(error.message);
  return data as InventoryCountSubmissionResult;
}

export async function submitInventoryRecountV2(taskId: string, actualCount: number, note?: string) {
  const { data, error } = await rpc("submit_inventory_recount_v2", {
    p_task_id: taskId,
    p_actual_count: actualCount,
    p_note: note?.trim() || null,
  });
  if (error) throw inventoryAuditError(error.message);
  return data as InventoryCountSubmissionResult;
}

export async function approveInventoryAdjustmentV2(taskId: string, reasonCode: InventoryAdjustmentReason, note: string) {
  const requestId = crypto.randomUUID();
  const { data, error } = await rpc("approve_inventory_adjustment_v2", {
    p_task_id: taskId,
    p_request_id: requestId,
    p_reason_code: reasonCode,
    p_note: note.trim(),
  });
  if (error) throw inventoryAuditError(error.message);
  return data as InventoryAdjustmentResult;
}

export async function rejectInventoryAdjustmentV2(taskId: string, reasonCode: InventoryAdjustmentRejectionReason, note: string) {
  const { data, error } = await rpc("reject_inventory_adjustment_v2", {
    p_task_id: taskId,
    p_reason_code: reasonCode,
    p_note: note.trim(),
  });
  if (error) throw inventoryAuditError(error.message);
  return data as InventoryAdjustmentResult;
}
