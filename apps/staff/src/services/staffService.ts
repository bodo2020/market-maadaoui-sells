import { supabase } from "../lib/supabase";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

const unwrap = <T>(value: { data: unknown; error: { message?: string } | null }) => {
  if (value.error) throw new Error(value.error.message || "REQUEST_FAILED");
  return value.data as T;
};

const withTimeout = <T>(promise: PromiseLike<T>, timeoutMs: number, code: string): Promise<T> =>
  Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(code)), timeoutMs)),
  ]);

export type StaffIdentity = {
  user_id: string;
  name: string;
  username: string;
  phone: string | null;
  active: boolean;
  is_super_admin: boolean;
  system_role: string | null;
};

export type StaffBranch = {
  branch_id: string;
  branch_name: string;
  branch_code: string | null;
  role_code: string;
  role_name_ar: string;
  is_primary: boolean;
  pos_enabled: boolean;
  permissions: string[];
};

export type OperationsTask = {
  id: string;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  source_kind: string;
  due_at?: string | null;
  claimed_by?: string | null;
  is_mine?: boolean;
  is_overdue?: boolean;
  can_claim?: boolean;
  order_id?: string | null;
};

export type FulfillmentOrder = {
  order_id: string;
  display_id: string;
  order_status: string;
  customer_name: string;
  amount: number;
  items_total: number;
  items_picked: number;
  fulfillment_state: string;
  picker_user_id: string | null;
  picker_name: string | null;
  predicted_ready_at: string | null;
  bags_count: number;
  shortage_count: number;
  substitution_count: number;
  eta_risk: string;
};

export type PickerShadowOrder = {
  order_id: string;
  display_id: string;
  created_at?: string;
  customer_name: string;
  items_total: number;
  predicted_ready_at: string | null;
  eta_risk: string;
  score?: number | null;
  recommended_user_id?: string | null;
  recommended_name?: string | null;
  recommended_score?: number | null;
  reason: string;
  is_recommended_to_me?: boolean;
  generation_count?: number;
};

export type PickerAssignmentShadow = {
  mode: "shadow";
  branch_id: string;
  generated_at: string;
  summary: {
    queued_unassigned: number;
    recommended_to_me: number;
    without_candidate: number;
    resolved_7d: number;
    matched_7d: number;
    match_rate_7d: number | null;
  };
  next_for_me: PickerShadowOrder | null;
  orders: PickerShadowOrder[];
};

export type BatchPickingShadowOrder = {
  order_id: string;
  display_id: string;
  customer_name: string;
  items_total: number;
  predicted_ready_at: string | null;
  eta_risk: string;
};

export type BatchPickingShadowRecommendation = {
  id: string;
  batch_code: string;
  order_ids: string[];
  order_count: number;
  total_lines: number;
  score: number;
  reason: "shared_shelf_route" | "shared_categories" | "close_sla_window";
  recommended_user_id: string | null;
  recommended_user_name: string | null;
  orders: BatchPickingShadowOrder[];
};

export type BatchPickingShadow = {
  mode: "shadow";
  branch_id: string;
  generated_at: string;
  summary: {
    eligible_orders: number;
    recommended_batches: number;
    covered_orders: number;
    single_orders: number;
    coverage_rate: number | null;
  };
  batches: BatchPickingShadowRecommendation[];
};

export type PickingSubstitution = {
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  replacement_product_id: string;
  replacement_variant_id: string | null;
  replacement_product_name: string;
  replacement_barcode: string | null;
  replacement_image_url: string | null;
  quantity: number;
  original_unit_price: number;
  replacement_unit_price: number;
  price_delta_total: number;
  financial_state: "pending" | "not_required" | "settled" | "waived" | "applied_to_order_total" | "pending_collection" | "pending_refund";
  proposed_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

export type PickingItem = {
  id: string;
  line_no: number;
  product_id: string | null;
  variant_id: string | null;
  barcode: string | null;
  product_name: string;
  image_url: string | null;
  required_quantity: number;
  picked_quantity: number;
  shortage_quantity: number;
  substitution_quantity: number;
  is_weight_based: boolean;
  is_bulk: boolean;
  bulk_quantity: number | null;
  unit_of_measure: string | null;
  status: "pending" | "picking" | "picked" | "shortage" | "substituted";
  last_scanned_at: string | null;
  note: string | null;
  substitution?: PickingSubstitution | null;
};

export type PickingSession = {
  order_id: string;
  fulfillment_state: string;
  substitution_policy: "allow_substitutions" | "contact_me" | "remove_item" | "manager";
  picker_user_id: string | null;
  items_total: number;
  items_picked: number;
  shortage_count: number;
  substitution_count: number;
  pending_substitution_count: number;
  resolved_count: number;
  items: PickingItem[];
};

export type StagingZone = "ambient" | "chilled" | "frozen";

export type StagingBag = {
  id: string;
  bag_no: number;
  bag_code: string;
  zone: StagingZone;
  status: "created" | "staged" | "handed_over";
  location_id: string | null;
  location_code: string | null;
  location_label: string | null;
  packed_at: string | null;
  staged_at: string | null;
  handed_over_at: string | null;
};

export type StagingLocation = {
  id: string;
  code: string;
  label: string;
  zone: StagingZone;
  capacity_bags: number;
  occupied_bags: number;
  available_bags: number;
};

export type StagingSession = {
  order_id: string;
  branch_id: string;
  fulfillment_state: string;
  picker_user_id: string | null;
  summary: {
    total_bags: number;
    created_bags: number;
    staged_bags: number;
    handed_over_bags: number;
    ready_to_finalize: boolean;
  };
  bags: StagingBag[];
  locations: StagingLocation[];
};

export type SubstitutionCandidate = {
  product_id: string;
  variant_id: string | null;
  name: string;
  barcode: string | null;
  image_url: string | null;
  unit_price: number;
  original_unit_price: number;
  price_delta_per_unit: number;
  available_quantity: number;
  stock_units_per_order_unit: number;
  is_bulk: boolean;
  is_weight_based: boolean;
  unit_of_measure: string | null;
  is_predefined?: boolean;
  same_brand?: boolean;
  match_reason?: "predefined" | "same_brand" | "same_category";
  match_score?: number;
};

export type SubstitutionCandidateResponse = {
  item_id: string;
  original_product_name: string;
  original_unit_price: number;
  items: SubstitutionCandidate[];
};

export type SubstitutionApproval = {
  id: string;
  task_id: string | null;
  order_id: string;
  tracking_number: string | null;
  item_id: string;
  original_product_name: string;
  replacement_product_name: string;
  replacement_product_id: string;
  replacement_variant_id: string | null;
  replacement_barcode: string | null;
  replacement_image_url: string | null;
  quantity: number;
  original_unit_price: number;
  replacement_unit_price: number;
  price_delta_total: number;
  financial_state: string;
  status: string;
  proposed_by: string;
  proposed_by_name: string | null;
  proposed_at: string;
  due_at: string | null;
  task_status: string | null;
};

export type NotificationItem = {
  id: string;
  event_key: string;
  category: string;
  severity: "critical" | "high" | "normal" | "info";
  title: string;
  body: string | null;
  action_url: string | null;
  action_label: string | null;
  requires_action: boolean;
  status: string;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

export type NotificationCenter = {
  version: number;
  branch_id: string | null;
  filter: string;
  summary: {
    total: number;
    unread: number;
    critical: number;
    action_required: number;
    today: number;
  };
  items: NotificationItem[];
};

export type AttendancePayload = {
  active_session?: {
    id: string;
    check_in_at: string;
    late_minutes?: number;
    attendance_mode?: string;
    branch_name?: string;
  } | null;
  policy?: {
    geofence_radius_m: number;
    max_location_accuracy_m: number;
    require_trusted_device: boolean;
    allow_outside_exception: boolean;
  };
  schedule?: Record<string, unknown> | null;
  recent_sessions?: Array<Record<string, unknown>>;
  pending_exception?: Record<string, unknown> | null;
};

export async function getStaffIdentity() {
  return unwrap<StaffIdentity | null>(await rpc("get_my_staff_identity"));
}

export async function getStaffBranches() {
  return unwrap<StaffBranch[]>(await rpc("get_my_staff_branches"));
}

export async function listTasks(branchId: string, scope = "active") {
  return unwrap<OperationsTask[]>(await rpc("list_operations_tasks", {
    p_branch_id: branchId,
    p_scope: scope,
    p_limit: 100,
  }));
}

export async function claimTask(id: string) {
  return unwrap(await rpc("claim_operations_task", { p_task_id: id }));
}

export async function startTask(id: string) {
  return unwrap(await rpc("start_operations_task", { p_task_id: id }));
}

export async function completeTask(id: string, note = "تم التنفيذ من تطبيق الموظفين") {
  return unwrap(await rpc("complete_operations_task", { p_task_id: id, p_note: note }));
}

export async function getAttendance(branchId: string) {
  return unwrap<AttendancePayload>(await rpc("get_my_attendance_v1", { p_branch_id: branchId }));
}

export async function validateStaffDevice(deviceId: string, token: string) {
  return unwrap<{ trusted: boolean; code?: string; approval_status?: string; device_id?: string }>(
    await rpc("validate_my_staff_device_v1", { p_device_id: deviceId, p_device_token: token }),
  );
}

export async function redeemStaffDevicePairing(
  pairingToken: string,
  pairingCode: string,
  deviceKey: string,
  deviceName: string,
  platform = "android",
) {
  return unwrap<{
    ok: boolean;
    code: string;
    approval_status: string;
    device_id: string;
    device_token: string;
  }>(await rpc("redeem_staff_device_pairing_v1", {
    p_pairing_token: pairingToken,
    p_pairing_code: pairingCode,
    p_device_key: deviceKey,
    p_device_name: deviceName,
    p_platform: platform,
    p_device_type: "personal",
    p_metadata: { app: "elmadawy_staff" },
  }));
}

export type AttendanceCheckInOptions = {
  exceptionReason?: string | null;
  verificationPhotoPath?: string | null;
  verificationPhotoSha256?: string | null;
};

export async function attendanceCheckIn(
  branchId: string,
  deviceId: string,
  token: string,
  latitude: number,
  longitude: number,
  accuracy: number,
  options: AttendanceCheckInOptions = {},
) {
  return unwrap<Record<string, unknown>>(await withTimeout(rpc("staff_attendance_check_in_v2", {
    p_branch_id: branchId,
    p_device_id: deviceId,
    p_device_token: token,
    p_attendance_mode: "onsite",
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy_m: accuracy,
    p_exception_reason: options.exceptionReason ?? null,
    p_verification_photo_path: options.verificationPhotoPath ?? null,
    p_verification_photo_sha256: options.verificationPhotoSha256 ?? null,
  }), 20_000, "ATTENDANCE_REQUEST_TIMEOUT"));
}

export async function uploadAttendanceVerificationSelfie(
  branchId: string,
  image: Blob,
  sha256: string,
) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("AUTH_REQUIRED");
  const path = `${branchId}/${userData.user.id}/${crypto.randomUUID()}-${sha256.slice(0, 12)}.jpg`;
  const { error } = await withTimeout(
    supabase.storage
      .from("hr_attendance_verification")
      .upload(path, image, { contentType: "image/jpeg", cacheControl: "0", upsert: false }),
    25_000,
    "PHOTO_UPLOAD_TIMEOUT",
  );
  if (error) throw new Error(error.message || "PHOTO_UPLOAD_FAILED");
  return path;
}

export async function removeUnsubmittedAttendanceSelfie(path: string) {
  const { error } = await withTimeout(
    supabase.storage.from("hr_attendance_verification").remove([path]),
    12_000,
    "PHOTO_DELETE_TIMEOUT",
  );
  if (error) throw new Error(error.message || "PHOTO_DELETE_FAILED");
}

export async function cleanupAttendanceVerificationOrphans(branchId: string) {
  const { data, error } = await withTimeout(
    supabase.functions.invoke("attendance-exception-decision-v2", {
      body: { action: "cleanup_orphans", branch_id: branchId },
    }),
    15_000,
    "PHOTO_CLEANUP_TIMEOUT",
  );
  if (error || !data?.ok) throw new Error(data?.code || error?.message || "PHOTO_CLEANUP_FAILED");
  return Number(data.cleaned || 0);
}

export async function attendanceCheckOut(
  sessionId: string,
  deviceId: string,
  token: string,
  latitude: number,
  longitude: number,
  accuracy: number,
) {
  return unwrap<Record<string, unknown>>(await rpc("staff_attendance_check_out_v1", {
    p_session_id: sessionId,
    p_device_id: deviceId,
    p_device_token: token,
    p_latitude: latitude,
    p_longitude: longitude,
    p_accuracy_m: accuracy,
  }));
}

export async function getNotifications(branchId: string, filter = "all") {
  return unwrap<NotificationCenter>(await rpc("get_my_notification_center_v2", {
    p_branch_id: branchId,
    p_filter: filter,
    p_category: null,
    p_limit: 100,
  }));
}

export async function markNotificationRead(id: string) {
  return unwrap<boolean>(await rpc("mark_notification_read_v2", { p_notification_id: id }));
}

export async function markAllNotificationsRead(branchId: string) {
  return unwrap<number>(await rpc("mark_all_notifications_read_v2", { p_branch_id: branchId }));
}

export async function getFulfillmentWorkspace(branchId: string) {
  return unwrap<{ branch_id: string; summary: Record<string, number>; orders: FulfillmentOrder[] }>(
    await rpc("get_my_order_fulfillment_workspace_v1", { p_branch_id: branchId }),
  );
}

export async function getPickerAssignmentShadow(branchId: string) {
  return unwrap<PickerAssignmentShadow>(await rpc("get_my_picker_assignment_shadow_v1", {
    p_branch_id: branchId,
  }));
}

export async function getBatchPickingShadow(branchId: string) {
  return unwrap<BatchPickingShadow>(await rpc("get_batch_picking_shadow_v1", {
    p_branch_id: branchId,
  }));
}

export async function claimFulfillment(orderId: string) {
  return unwrap(await rpc("claim_order_fulfillment_v1", { p_order_id: orderId }));
}

export async function startPicking(orderId: string) {
  return unwrap(await rpc("start_order_picking_v1", { p_order_id: orderId }));
}

export async function getPickingSession(orderId: string) {
  return unwrap<PickingSession>(await rpc("get_my_order_picking_session_v2", { p_order_id: orderId }));
}

export async function scanPickingBarcode(orderId: string, barcode: string, quantity?: number | null) {
  return unwrap<{ ok: boolean; line: PickingItem }>(await rpc("scan_order_fulfillment_barcode_v1", {
    p_order_id: orderId,
    p_barcode: barcode,
    p_quantity: quantity ?? null,
  }));
}

export async function confirmPickingItem(itemId: string, quantity?: number | null) {
  return unwrap<{ ok: boolean; line: PickingItem }>(await rpc("confirm_order_fulfillment_item_v1", {
    p_item_id: itemId,
    p_quantity: quantity ?? null,
  }));
}

export async function markPickingShortage(itemId: string, quantity: number, note?: string | null) {
  return unwrap<{ ok: boolean; line: PickingItem }>(await rpc("mark_order_fulfillment_shortage_v2", {
    p_item_id: itemId,
    p_shortage_quantity: quantity,
    p_note: note ?? null,
  }));
}

export async function searchSubstitutionCandidates(itemId: string, query = "", limit = 20) {
  return unwrap<SubstitutionCandidateResponse>(await rpc("search_order_fulfillment_substitution_candidates_v2", {
    p_item_id: itemId,
    p_query: query,
    p_limit: limit,
  }));
}

export async function proposeSubstitution(
  itemId: string,
  candidate: Pick<SubstitutionCandidate, "product_id" | "variant_id">,
  quantity: number,
  note = "اقتراح بديل من تطبيق الموظفين",
) {
  return unwrap<{ ok: boolean; substitution: PickingSubstitution }>(await rpc("propose_order_fulfillment_substitution_v2", {
    p_item_id: itemId,
    p_replacement_product_id: candidate.product_id,
    p_replacement_variant_id: candidate.variant_id,
    p_quantity: quantity,
    p_note: note,
  }));
}

export async function cancelSubstitution(substitutionId: string) {
  return unwrap<{ ok: boolean; id: string; status: string }>(await rpc("cancel_order_fulfillment_substitution_v1", {
    p_substitution_id: substitutionId,
  }));
}

export async function listSubstitutionApprovals(branchId: string, limit = 50) {
  return unwrap<{ branch_id: string; count: number; items: SubstitutionApproval[] }>(await rpc("list_order_substitution_approvals_v1", {
    p_branch_id: branchId,
    p_limit: limit,
  }));
}

export async function decideSubstitution(substitutionId: string, decision: "approve" | "reject", note: string) {
  return unwrap<{ ok: boolean; id: string; status: string; price_delta_total?: number; financial_state?: string }>(
    await rpc("decide_order_fulfillment_substitution_v1", {
      p_substitution_id: substitutionId,
      p_decision: decision,
      p_note: note,
    }),
  );
}

export async function updatePicking(
  orderId: string,
  picked: number,
  shortages: number,
  substitutions: number,
  bags: number | null = null,
) {
  return unwrap(await rpc("update_order_fulfillment_progress_v1", {
    p_order_id: orderId,
    p_items_picked: picked,
    p_shortage_count: shortages,
    p_substitution_count: substitutions,
    p_bags_count: bags,
    p_note: null,
  }));
}

export async function startPacking(orderId: string, bags = 0) {
  return unwrap(await rpc("start_order_packing_v1", {
    p_order_id: orderId,
    p_bags_count: bags,
  }));
}

export async function getStagingSession(orderId: string) {
  return unwrap<StagingSession>(await rpc("get_my_order_staging_session_v1", {
    p_order_id: orderId,
  }));
}

export async function prepareStagingBags(orderId: string, zones: StagingZone[]) {
  return unwrap<StagingSession>(await rpc("prepare_order_staging_bags_v1", {
    p_order_id: orderId,
    p_bags: zones.map((zone) => ({ zone })),
  }));
}

export async function stageBag(orderId: string, bagCode: string, locationCode: string) {
  return unwrap<StagingSession>(await rpc("stage_order_bag_v1", {
    p_order_id: orderId,
    p_bag_code: bagCode,
    p_location_code: locationCode,
  }));
}

export async function unstageBag(orderId: string, bagCode: string) {
  return unwrap<StagingSession>(await rpc("unstage_order_bag_v1", {
    p_order_id: orderId,
    p_bag_code: bagCode,
  }));
}

export async function finalizeStaging(orderId: string, note = "تم تسكين كل الأكياس من تطبيق الموظفين") {
  return unwrap<StagingSession & { ok: boolean; state: string }>(await rpc("finalize_order_staging_v1", {
    p_order_id: orderId,
    p_note: note,
  }));
}

export async function markReady(orderId: string, bags = 0) {
  return unwrap(await rpc("mark_order_ready_v1", {
    p_order_id: orderId,
    p_bags_count: bags,
    p_note: "تم إنهاء تجهيز الطلب من تطبيق الموظفين",
  }));
}
