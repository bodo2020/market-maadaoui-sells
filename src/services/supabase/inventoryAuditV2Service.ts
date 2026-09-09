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
};

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
  system_expected?: number | null;
  first_count?: number | null;
  first_variance?: number | null;
  recount?: number | null;
  recount_variance?: number | null;
  verification_status?: string | null;
  variance_value?: number | null;
};

export type InventoryCountSubmissionResult = {
  task_id: string;
  status: string;
  result: "matched" | "discrepancy" | "matched_system" | "confirmed_variance" | "conflicting" | string;
  recount_task_id?: string | null;
  adjustment_review_task_id?: string | null;
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
  if (value.includes("INVENTORY_MOVEMENT_LEDGER_GAP")) return new Error("تعذر مطابقة حركات المخزون أثناء العد. لم يتم اعتماد النتيجة؛ حدّث المهمة وأعد المحاولة.");
  if (value.includes("INVENTORY_ROW_MISSING")) return new Error("سجل مخزون المنتج لم يعد موجودًا في الفرع.");
  if (value.includes("TASK_NOT_SUBMITTABLE")) return new Error("المهمة لا تقبل تسليم العد في حالتها الحالية.");
  if (value.includes("INVENTORY_ADJUSTMENT_REVIEW_DENIED")) return new Error("ليس لديك صلاحية عرض اعتماد تسوية المخزون.");
  return new Error(message || "تعذر تنفيذ إجراء الجرد.");
}

export async function ensureDailyInventoryAuditTasksV2(branchId: string, itemsPerEmployee = 5) {
  const { data, error } = await rpc("ensure_daily_inventory_audit_tasks_v2", {
    p_branch_id: branchId,
    p_items_per_employee: itemsPerEmployee,
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
