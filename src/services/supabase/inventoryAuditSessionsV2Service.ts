import { supabase } from "@/integrations/supabase/client";

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

export type InventoryAuditKind = "daily" | "full" | "spot";
export type InventoryAuditScope = "all" | "main_category" | "subcategory" | "company" | "shelf" | "custom";

export type InventoryAuditSetupOption = {
  id: string;
  name: string;
  products: number;
};

export type InventoryAuditSubcategoryOption = InventoryAuditSetupOption & {
  category_id: string;
};

export type InventoryAuditStaffOption = {
  id: string;
  name: string;
  role_name?: string | null;
};

export type InventoryAuditSetup = {
  inventory_products: number;
  categories: InventoryAuditSetupOption[];
  subcategories: InventoryAuditSubcategoryOption[];
  companies: InventoryAuditSetupOption[];
  shelves: Array<{ name: string; products: number }>;
  staff: InventoryAuditStaffOption[];
};

export type InventoryAuditProduct = {
  id: string;
  name: string;
  barcode?: string | null;
  shelf_location?: string | null;
  unit_of_measure?: string | null;
  category_name?: string | null;
  subcategory_name?: string | null;
};

export type InventoryAuditSession = {
  id: string;
  audit_date: string;
  audit_kind: InventoryAuditKind | string;
  status: "active" | "completed" | "cancelled" | string;
  title: string;
  description?: string | null;
  scope_type: InventoryAuditScope | string;
  scope_filter?: Record<string, unknown> | null;
  due_at?: string | null;
  total_tasks: number;
  completed_tasks: number;
  matched_tasks: number;
  discrepancy_tasks: number;
  resolved_tasks: number;
  cancelled_tasks: number;
  pending_recounts: number;
  pending_approvals: number;
  progress_percent: number;
  generated_at: string;
  completed_at?: string | null;
  cancelled_at?: string | null;
};

export type InventoryAuditStaffWorkload = {
  user_id: string;
  name: string;
  active_counts: number;
  active_recounts: number;
  submitted_30d: number;
  accuracy_30d: number;
};

export type InventoryAuditVariance = {
  count_id: string;
  session_id: string;
  product_id: string;
  product_name: string;
  barcode?: string | null;
  status: string;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  submitted_at?: string | null;
  recount_status?: string | null;
  approval_task_id?: string | null;
  approval_status?: string | null;
  variance?: number | null;
  variance_value?: number | null;
};

export type InventoryAuditDashboard = {
  summary: {
    active_sessions: number;
    today_sessions: number;
    today_daily_progress: number;
    open_variances: number;
    pending_recounts: number;
    pending_approvals: number;
    overdue_tasks: number;
    first_count_accuracy_percent: number;
    open_variance_value?: number | null;
  };
  sessions: InventoryAuditSession[];
  staff_workload: InventoryAuditStaffWorkload[];
  open_variances: InventoryAuditVariance[];
  permissions: {
    can_manage_sessions: boolean;
    can_approve_adjustment: boolean;
  };
};

export type CreateInventoryAuditSessionInput = {
  branchId: string;
  kind: "full" | "spot";
  title?: string;
  description?: string;
  scopeType: InventoryAuditScope;
  scopeFilter?: Record<string, unknown>;
  assigneeId?: string | null;
  dueAt?: string | null;
};

export type CreateInventoryAuditSessionResult = {
  session_id: string;
  audit_kind: "full" | "spot" | string;
  title: string;
  scope_type: InventoryAuditScope | string;
  products: number;
  eligible_staff: number;
  items_per_employee: number;
  due_at?: string | null;
};

export type CancelInventoryAuditSessionResult = {
  session_id: string;
  status: "cancelled" | string;
  cancelled_tasks: number;
  idempotent?: boolean;
  note?: string;
};

function inventorySessionsError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجّل الدخول مرة أخرى.");
  if (value.includes("INVENTORY_BRANCH_ACCESS_DENIED")) return new Error("الفرع الحالي خارج نطاق صلاحيتك.");
  if (value.includes("INVENTORY_SESSION_MANAGE_DENIED")) return new Error("ليس لديك صلاحية إنشاء أو إدارة جلسات الجرد.");
  if (value.includes("INVENTORY_DASHBOARD_DENIED")) return new Error("ليس لديك صلاحية عرض مركز الجرد.");
  if (value.includes("INVALID_INVENTORY_SESSION_KIND")) return new Error("نوع جلسة الجرد غير صحيح.");
  if (value.includes("INVALID_INVENTORY_SCOPE")) return new Error("نطاق الجرد غير صحيح.");
  if (value.includes("SPOT_CHECK_REQUIRES_CUSTOM_PRODUCTS")) return new Error("اختر المنتجات التي تريد فحصها في الـ Spot Check.");
  if (value.includes("INVALID_INVENTORY_ASSIGNEE")) return new Error("الموظف المحدد غير مؤهل لتنفيذ الجرد في هذا الفرع.");
  if (value.includes("NO_ELIGIBLE_STAFF")) return new Error("لا يوجد موظفون لديهم صلاحية تنفيذ الجرد في الفرع.");
  if (value.includes("NO_PRODUCTS_IN_SCOPE")) return new Error("لا توجد منتجات داخل نطاق الجرد المحدد.");
  if (value.includes("INVENTORY_SESSION_TOO_LARGE")) return new Error("نطاق الجرد أكبر من الحد المسموح للجلسة الواحدة.");
  if (value.includes("SPOT_CHECK_TOO_LARGE")) return new Error("الـ Spot Check يدعم حتى 50 منتجًا في الجلسة الواحدة.");
  if (value.includes("INVALID_INVENTORY_DUE_AT")) return new Error("موعد انتهاء الجرد يجب أن يكون بعد 15 دقيقة وحتى 30 يومًا.");
  if (value.includes("INVENTORY_SESSION_NOT_FOUND")) return new Error("جلسة الجرد لم تعد موجودة.");
  if (value.includes("COMPLETED_SESSION_CANNOT_BE_CANCELLED")) return new Error("لا يمكن إلغاء جلسة جرد مكتملة.");
  return new Error(message || "تعذر تنفيذ إجراء جلسة الجرد.");
}

export async function fetchInventoryAuditSetupV2(branchId: string): Promise<InventoryAuditSetup> {
  const { data, error } = await rpc("get_inventory_audit_setup_v2", { p_branch_id: branchId });
  if (error) throw inventorySessionsError(error.message);
  return data as InventoryAuditSetup;
}

export async function searchInventoryAuditProductsV2(branchId: string, search = "", limit = 50): Promise<InventoryAuditProduct[]> {
  const { data, error } = await rpc("search_inventory_audit_products_v2", {
    p_branch_id: branchId,
    p_search: search.trim() || null,
    p_limit: limit,
  });
  if (error) throw inventorySessionsError(error.message);
  return Array.isArray(data) ? (data as InventoryAuditProduct[]) : [];
}

export async function createInventoryAuditSessionV2(input: CreateInventoryAuditSessionInput) {
  const { data, error } = await rpc("create_inventory_audit_session_v2", {
    p_branch_id: input.branchId,
    p_audit_kind: input.kind,
    p_title: input.title?.trim() || null,
    p_description: input.description?.trim() || null,
    p_scope_type: input.scopeType,
    p_scope_filter: input.scopeFilter || {},
    p_assignee_id: input.assigneeId || null,
    p_due_at: input.dueAt || null,
  });
  if (error) throw inventorySessionsError(error.message);
  return data as CreateInventoryAuditSessionResult;
}

export async function fetchInventoryAuditDashboardV2(branchId: string, limit = 50): Promise<InventoryAuditDashboard> {
  const { data, error } = await rpc("get_inventory_audit_dashboard_v2", {
    p_branch_id: branchId,
    p_limit: limit,
  });
  if (error) throw inventorySessionsError(error.message);
  return data as InventoryAuditDashboard;
}

export async function cancelInventoryAuditSessionV2(sessionId: string, note?: string) {
  const { data, error } = await rpc("cancel_inventory_audit_session_v2", {
    p_session_id: sessionId,
    p_note: note?.trim() || null,
  });
  if (error) throw inventorySessionsError(error.message);
  return data as CancelInventoryAuditSessionResult;
}
