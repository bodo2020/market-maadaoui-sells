import { supabase } from "../lib/supabase";

const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
const unwrap = <T>(value: { data: unknown; error: { message?: string } | null }) => {
  if (value.error) throw new Error(value.error.message || "REQUEST_FAILED");
  return value.data as T;
};

export type StaffIdentity = { user_id: string; name: string; username: string; phone: string | null; active: boolean; is_super_admin: boolean; system_role: string | null };
export type StaffBranch = { branch_id: string; branch_name: string; branch_code: string | null; role_code: string; role_name_ar: string; is_primary: boolean; pos_enabled: boolean; permissions: string[] };
export type OperationsTask = { id: string; title: string; description?: string | null; priority: string; status: string; source_kind: string; due_at?: string | null; claimed_by?: string | null; is_mine?: boolean; is_overdue?: boolean; can_claim?: boolean; order_id?: string | null };
export type FulfillmentOrder = { order_id: string; display_id: string; order_status: string; customer_name: string; amount: number; items_total: number; items_picked: number; fulfillment_state: string; picker_user_id: string | null; picker_name: string | null; predicted_ready_at: string | null; bags_count: number; shortage_count: number; substitution_count: number; eta_risk: string };

export async function getStaffIdentity() { return unwrap<StaffIdentity | null>(await rpc("get_my_staff_identity")); }
export async function getStaffBranches() { return unwrap<StaffBranch[]>(await rpc("get_my_staff_branches")); }
export async function listTasks(branchId: string, scope = "active") { return unwrap<OperationsTask[]>(await rpc("list_operations_tasks", { p_branch_id: branchId, p_scope: scope, p_limit: 100 })); }
export async function claimTask(id: string) { return unwrap(await rpc("claim_operations_task", { p_task_id: id })); }
export async function startTask(id: string) { return unwrap(await rpc("start_operations_task", { p_task_id: id })); }
export async function completeTask(id: string, note = "تم التنفيذ من تطبيق الموظفين") { return unwrap(await rpc("complete_operations_task", { p_task_id: id, p_note: note })); }
export async function getAttendance(branchId: string) { return unwrap<any>(await rpc("get_my_attendance_v1", { p_branch_id: branchId })); }
export async function getFulfillmentWorkspace(branchId: string) { return unwrap<{ branch_id: string; summary: Record<string, number>; orders: FulfillmentOrder[] }>(await rpc("get_my_order_fulfillment_workspace_v1", { p_branch_id: branchId })); }
export async function claimFulfillment(orderId: string) { return unwrap(await rpc("claim_order_fulfillment_v1", { p_order_id: orderId })); }
export async function startPicking(orderId: string) { return unwrap(await rpc("start_order_picking_v1", { p_order_id: orderId })); }
export async function updatePicking(orderId: string, picked: number, shortages: number, substitutions: number, bags: number | null = null) { return unwrap(await rpc("update_order_fulfillment_progress_v1", { p_order_id: orderId, p_items_picked: picked, p_shortage_count: shortages, p_substitution_count: substitutions, p_bags_count: bags, p_note: null })); }
export async function startPacking(orderId: string, bags = 0) { return unwrap(await rpc("start_order_packing_v1", { p_order_id: orderId, p_bags_count: bags })); }
export async function markReady(orderId: string, bags = 1) { return unwrap(await rpc("mark_order_ready_v1", { p_order_id: orderId, p_bags_count: bags, p_note: "جاهز من تطبيق الموظفين" })); }
