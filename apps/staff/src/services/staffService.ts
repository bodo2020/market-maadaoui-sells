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





export type CashHandoff = {
  handoff_id: string;
  shift_id: string;
  cashier_id: string;
  cashier_name: string;
  device_id: string;
  device_name: string;
  drawer_account_id: string;
  drawer_balance: number;
  expected_amount: number;
  closed_at: string;
  status: "pending" | "completed";
};

export type CashHandoffWorkspace = {
  version: number;
  branch_id: string;
  branch_name: string;
  permissions: { can_manage: boolean };
  safe: null | { account_id: string; name: string; balance: number };
  pending: CashHandoff[];
  recent: Array<{
    handoff_id: string;
    shift_id: string;
    cashier_id: string;
    cashier_name: string;
    device_id: string;
    device_name: string;
    expected_amount: number;
    received_amount: number;
    variance_amount: number;
    variance_reason: string | null;
    received_by_name: string | null;
    received_at: string;
    status: "completed";
  }>;
};

export type ManagerOperationsEmployee = {
  user_id: string;
  name: string;
  role: string;
  employee_code?: string | null;
  department_name?: string | null;
  job_title_name?: string | null;
  cashier_invoices: number;
  cashier_sales: number;
  cash_variance: number;
  payment_variance: number;
  inventory_counts_assigned: number;
  inventory_counts_submitted: number;
  inventory_differences_found: number;
  inventory_recounts_submitted: number;
  inventory_recounts_conflicting: number;
  delivery_assigned: number;
  delivery_active_open: number;
  delivery_delivered: number;
  online_handled_orders: number;
  online_cancellations: number;
  followups_assigned: number;
  followups_closed: number;
  followups_overdue_open: number;
  needs_attention: boolean;
};

export type ManagerOperationsPerformance = {
  branch_id: string;
  period: { from: string; to: string };
  summary: {
    employees: number;
    employees_with_specialist_activity: number;
    employees_needing_attention: number;
    cashier: { invoices: number; sales: number; cash_variance: number; payment_variance: number };
    inventory: { counts_assigned: number; counts_submitted: number; differences_found: number; recounts_submitted: number; recount_conflicts: number };
    delivery: { assigned: number; active_open: number; delivered: number };
    online: { handled_orders: number; transitions: number; cancellations: number };
    customer_service: { assigned: number; closed: number; overdue_open: number };
  };
  employees: ManagerOperationsEmployee[];
  notes: string[];
};

export type ApprovalScope = "pending" | "mine" | "overdue" | "completed" | "all";
export type ApprovalItem = {
  id: string;
  branch_id: string;
  task_type: string;
  source_kind: string;
  source_id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  amount: number;
  claimed_by?: string | null;
  claimed_by_name?: string | null;
  completed_by_name?: string | null;
  due_at?: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  is_mine: boolean;
  can_claim: boolean;
  can_decide: boolean;
  is_overdue: boolean;
  resolution_note?: string | null;
};
export type ApprovalCenter = {
  summary: { pending: number; mine: number; overdue: number; critical: number; inventory: number; finance: number; transfers: number; completed_today: number };
  items: ApprovalItem[];
};
export type HrRequestReviewDetail = {
  request: { id: string; request_type: "leave" | "salary_advance" | "attendance_correction"; status: string; reason: string; payload: Record<string, unknown>; requested_at: string };
  employee: { id: string; name: string; username?: string | null; phone?: string | null };
  profile?: { employee_code?: string | null; work_mode?: string | null } | null;
  task: { id: string; status: string; priority: string; due_at?: string | null };
};
export type AttendanceExceptionReview = {
  id: string;
  employee_name: string;
  branch_name: string;
  requested_at: string;
  distance_m: number | null;
  accuracy_m: number | null;
  reason: string;
  status: string;
  verification_photo_path: string | null;
  verification_photo_signed_url?: string | null;
};


export type InventoryRiskStatus = "low_stock" | "out_of_stock" | "coverage_risk";
export type InventoryRiskProduct = {
  product_id: string;
  product_name: string;
  barcode: string | null;
  image_url: string | null;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  unit_of_measure: string;
  shelf_location: string | null;
  category_name: string;
  min_stock_level: number;
  days_cover: number | null;
  stock_status: InventoryRiskStatus | string;
  last_audit_at: string | null;
};
export type InventoryRiskWorkspace = {
  summary: { low_stock_rows: number; out_of_stock_rows: number; coverage_risk_rows: number; pending_audit_tasks: number };
  permissions: { can_manage_sessions: boolean };
  products: InventoryRiskProduct[];
};

export type InventoryAdjustmentReason = "theft" | "damage" | "breakage" | "receiving_error" | "selling_error" | "previous_error" | "unknown";
export type InventoryAdjustmentRejectionReason = "counting_error" | "insufficient_evidence" | "investigation_required" | "other";

export type InventoryAuditTaskDetail = {
  task_id: string;
  task_type: string;
  source_kind: string;
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
  is_recount?: boolean;
  first_count?: number | null;
  first_variance?: number | null;
  recount?: number | null;
  recount_variance?: number | null;
  verification_status?: string | null;
  variance_value?: number | null;
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
  result: string;
  recount_task_id?: string | null;
  adjustment_review_task_id?: string | null;
  idempotent?: boolean;
};

export type InventoryTransferItem = {
  id: string;
  product_id: string;
  product_name: string;
  barcode: string | null;
  unit: string;
  quantity: number;
  received_quantity: number | null;
  variance_quantity: number | null;
};

export type InventoryTransfer = {
  id: string;
  transfer_number: string;
  from_branch_id: string;
  from_branch_name: string;
  to_branch_id: string;
  to_branch_name: string;
  status: "requested" | "dispatched" | "received" | "received_with_variance" | "cancelled";
  direction: "outgoing" | "incoming";
  notes: string | null;
  created_at: string;
  expected_arrival_date: string | null;
  dispatched_at: string | null;
  received_at: string | null;
  items_count: number;
  has_variance: boolean;
  can_dispatch: boolean;
  can_receive: boolean;
  items: InventoryTransferItem[];
};

export type InventoryTransferWorkspace = {
  branch_id: string;
  permissions: { can_transfer: boolean };
  summary: {
    requested: number;
    dispatched: number;
    received: number;
    received_with_variance: number;
    cancelled: number;
  };
  transfers: InventoryTransfer[];
};

export type OperationsTask = {
  id: string;
  task_type: string;
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

export type StaffSelfServiceRequest = {
  id: string;
  branch_id: string;
  branch_name?: string;
  request_type: "leave" | "salary_advance" | "attendance_correction" | string;
  status: string;
  reason: string;
  payload: Record<string, unknown>;
  approved_payload?: Record<string, unknown> | null;
  requested_at: string;
  reviewed_at?: string | null;
  decision_note?: string | null;
  cancelled_at?: string | null;
  fulfilled_at?: string | null;
};

export type StaffSelfServiceSnapshot = {
  profile: {
    user_id: string;
    name: string;
    username: string | null;
    phone: string | null;
    email: string | null;
    employee_code: string | null;
    employment_status: string;
    work_mode: string | null;
    contract_type: string | null;
    hire_date: string | null;
    primary_branch_id: string | null;
    department?: { id: string; name_ar: string; code?: string | null } | null;
    team?: { id: string; name_ar: string } | null;
    job_title?: { id: string; name_ar: string; grade?: string | null } | null;
    manager?: { id: string; name: string } | null;
  };
  employee_card: {
    membership_number: string;
    barcode: string;
  };
  wallet: {
    benefit_balance: number;
    benefit_monthly_allowance: number;
    credit_limit: number;
    receivable_balance: number;
    credit_available: number;
    payroll_deduction_enabled: boolean;
  };
  advance_summary: {
    outstanding_amount: number;
    active_count: number;
  };
  leave_summary: {
    approved_days_ytd: number;
  };
  requests: StaffSelfServiceRequest[];
  advances: Array<{
    id: string;
    request_id: string | null;
    branch_id: string | null;
    principal_amount: number;
    repayment_months: number;
    monthly_deduction: number;
    outstanding_amount: number;
    status: string;
    paid_at: string | null;
    settled_at: string | null;
    approved_at: string | null;
    created_at: string;
  }>;
  leaves: Array<{
    id: string;
    request_id: string | null;
    branch_id: string | null;
    leave_type: string;
    start_date: string;
    end_date: string;
    partial_day: string;
    status: string;
    approved_at: string | null;
  }>;
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


export async function getStaffSelfService(branchId: string) {
  return unwrap<StaffSelfServiceSnapshot>(await rpc("get_my_staff_self_service_v1", {
    p_branch_id: branchId,
  }));
}

export async function submitMyHrRequest(
  branchId: string,
  requestType: "leave" | "salary_advance" | "attendance_correction",
  payload: Record<string, unknown>,
  reason: string,
) {
  return unwrap<{ ok: boolean; request_id: string; review_task_id: string; status: string }>(
    await rpc("submit_my_hr_request_v1", {
      p_branch_id: branchId,
      p_request_type: requestType,
      p_payload: payload,
      p_reason: reason,
    }),
  );
}

export async function cancelMyHrRequest(requestId: string) {
  return unwrap(await rpc("cancel_my_hr_request_v1", { p_request_id: requestId }));
}

export async function validateStaffDevice(deviceId: string, token: string) {
  return unwrap<{ trusted: boolean; code?: string; approval_status?: string; device_id?: string }>(
    await rpc("validate_my_staff_device_v1", { p_device_id: deviceId, p_device_token: token }),
  );
}


export async function bindStaffDeviceFingerprint(
  deviceId: string,
  token: string,
  deviceKey: string,
  metadata: Record<string, unknown> = {},
) {
  return unwrap<{
    ok: boolean;
    device_id: string;
    device_key: string;
    already_bound: boolean;
    requires_recovery: boolean;
  }>(await rpc("bind_my_staff_device_fingerprint_v2", {
    p_device_id: deviceId,
    p_device_token: token,
    p_device_key: deviceKey,
    p_metadata: metadata,
  }));
}

export async function recoverStaffDevice(
  branchId: string,
  deviceKey: string,
  deviceName: string,
  platform = "android",
  metadata: Record<string, unknown> = {},
) {
  return unwrap<{
    trusted: boolean;
    code: string;
    approval_status?: string;
    device_id?: string;
    device_token?: string;
    branch_id?: string;
    device_name?: string;
    reason?: string | null;
  }>(await rpc("recover_my_staff_device_v2", {
    p_branch_id: branchId,
    p_device_key: deviceKey,
    p_device_name: deviceName,
    p_platform: platform,
    p_metadata: metadata,
  }));
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


function inventoryError(message?: string) {
  const value = message || "";
  if (value.includes("INVENTORY_SELF_RECOUNT_DENIED")) return new Error("لا يمكنك إعادة عد منتج قمت بعدّه أول مرة. يجب أن يراجعه موظف آخر.");
  if (value.includes("INVENTORY_TASK_NOT_OWNER") || value.includes("TASK_NOT_OWNER")) return new Error("مهمة الجرد لم تعد مسندة لك.");
  if (value.includes("INVALID_ACTUAL_COUNT")) return new Error("اكتب كمية فعلية صحيحة.");
  if (value.includes("INVENTORY_MOVEMENT_LEDGER_GAP")) return new Error("يوجد اختلاف في سجل حركة المخزون. لم يتم تعديل الرصيد.");
  if (value.includes("INVENTORY_ADJUSTMENT_REVIEW_DENIED")) return new Error("ليس لديك صلاحية اعتماد فرق المخزون.");
  if (value.includes("INVENTORY_ADJUSTMENT_NOTE_REQUIRED")) return new Error("اكتب ملاحظة توضح قرار المراجعة.");
  if (value.includes("TRANSFER_TASK_CLAIMED_BY_ANOTHER_USER")) return new Error("مهمة التحويل استلمها موظف آخر.");
  if (value.includes("TRANSFER_NOT_DISPATCHABLE")) return new Error("التحويل لم يعد جاهزًا للشحن.");
  if (value.includes("TRANSFER_NOT_RECEIVABLE")) return new Error("التحويل لم يعد جاهزًا للاستلام.");
  if (value.includes("TRANSFER_RECEIPT_QUANTITY_INVALID")) return new Error("راجع الكميات المستلمة.");
  if (value.includes("TRANSFER_SOURCE_PERMISSION_DENIED") || value.includes("TRANSFER_DISPATCH_DENIED") || value.includes("TRANSFER_RECEIVE_DENIED")) return new Error("ليس لديك صلاحية تنفيذ هذا التحويل.");
  return new Error(message || "تعذر تنفيذ عملية المخزون.");
}

export function isInventoryTask(task: Pick<OperationsTask, "source_kind" | "task_type">) {
  return task.source_kind === "inventory_count"
    || task.source_kind === "inventory_recount"
    || task.source_kind === "inventory_adjustment"
    || task.task_type === "inventory_daily_count"
    || task.task_type === "inventory_variance_recount"
    || task.task_type === "inventory_adjustment_review";
}

export function isInventoryTransferTask(task: Pick<OperationsTask, "source_kind" | "task_type">) {
  return task.source_kind === "inventory_transfer_dispatch"
    || task.source_kind === "inventory_transfer_receive"
    || task.source_kind === "inventory_transfer_variance"
    || task.task_type.startsWith("inventory_transfer_");
}

export async function ensureDailyInventoryAudit(branchId: string) {
  const result = await rpc("ensure_daily_inventory_audit_tasks_v3", { p_branch_id: branchId, p_audit_date: null });
  if (result.error) throw inventoryError(result.error.message);
  return result.data as { session_id?: string; generated: number; existing: number; eligible_staff: number; audit_date: string };
}

export async function getInventoryAuditTask(taskId: string) {
  const result = await rpc("get_inventory_audit_task_v2", { p_task_id: taskId });
  if (result.error) throw inventoryError(result.error.message);
  return result.data as InventoryAuditTaskDetail;
}

export async function submitInventoryCount(taskId: string, actualCount: number, note?: string) {
  const result = await rpc("submit_inventory_count_v2", {
    p_task_id: taskId,
    p_actual_count: actualCount,
    p_note: note?.trim() || null,
  });
  if (result.error) throw inventoryError(result.error.message);
  return result.data as InventoryCountSubmissionResult;
}

export async function submitInventoryRecount(taskId: string, actualCount: number, note?: string) {
  const result = await rpc("submit_inventory_recount_v2", {
    p_task_id: taskId,
    p_actual_count: actualCount,
    p_note: note?.trim() || null,
  });
  if (result.error) throw inventoryError(result.error.message);
  return result.data as InventoryCountSubmissionResult;
}

export async function approveInventoryAdjustment(taskId: string, reasonCode: InventoryAdjustmentReason, note: string) {
  const result = await rpc("approve_inventory_adjustment_v2", {
    p_task_id: taskId,
    p_request_id: crypto.randomUUID(),
    p_reason_code: reasonCode,
    p_note: note.trim(),
  });
  if (result.error) throw inventoryError(result.error.message);
  return result.data as Record<string, unknown>;
}

export async function rejectInventoryAdjustment(taskId: string, reasonCode: InventoryAdjustmentRejectionReason, note: string) {
  const result = await rpc("reject_inventory_adjustment_v2", {
    p_task_id: taskId,
    p_reason_code: reasonCode,
    p_note: note.trim(),
  });
  if (result.error) throw inventoryError(result.error.message);
  return result.data as Record<string, unknown>;
}

export async function getInventoryTransferWorkspace(branchId: string) {
  const result = await rpc("get_inventory_transfer_workspace_v2", {
    p_branch_id: branchId,
    p_status: "active",
    p_limit: 100,
  });
  if (result.error) throw inventoryError(result.error.message);
  return result.data as InventoryTransferWorkspace;
}

export async function dispatchInventoryTransfer(transferId: string, note?: string) {
  const result = await rpc("dispatch_inventory_transfer_v2", {
    p_transfer_id: transferId,
    p_note: note?.trim() || null,
  });
  if (result.error) throw inventoryError(result.error.message);
  return result.data as Record<string, unknown>;
}

export async function receiveInventoryTransfer(
  transferId: string,
  items: Array<{ product_id: string; quantity: number }>,
  note?: string,
) {
  const result = await rpc("receive_inventory_transfer_v2", {
    p_transfer_id: transferId,
    p_receipt_items: items,
    p_note: note?.trim() || null,
  });
  if (result.error) throw inventoryError(result.error.message);
  return result.data as Record<string, unknown>;
}



export async function getApprovalCenter(branchId: string, scope: ApprovalScope = "pending") {
  const result = await rpc("get_approval_center_v1", { p_branch_id: branchId, p_scope: scope, p_limit: 100 });
  if (result.error) throw new Error(result.error.message || "تعذر تحميل مركز الموافقات");
  const raw=(result.data||{}) as Record<string,unknown>;
  const summary=(raw.summary||{}) as Record<string,unknown>;
  return {
    summary:{
      pending:Number(summary.pending||0),mine:Number(summary.mine||0),overdue:Number(summary.overdue||0),
      critical:Number(summary.critical||0),inventory:Number(summary.inventory||0),finance:Number(summary.finance||0),
      transfers:Number(summary.transfers||0),completed_today:Number(summary.completed_today||0),
    },
    items:Array.isArray(raw.items)?raw.items as ApprovalItem[]:[],
  } as ApprovalCenter;
}

export async function getHrRequestForReview(taskId: string) {
  const result=await rpc("get_hr_request_for_review_v1",{p_task_id:taskId});
  if(result.error)throw new Error(result.error.message||"تعذر تحميل طلب الموظف");
  return result.data as HrRequestReviewDetail;
}

export async function decideHrRequest(taskId: string, decision: "approved"|"rejected", note: string, approvedPayload?: Record<string,unknown>|null) {
  const result=await rpc("decide_hr_request_v1",{
    p_task_id:taskId,p_decision:decision,p_note:note.trim(),p_approved_payload:approvedPayload||null,
  });
  if(result.error)throw new Error(result.error.message||"تعذر تسجيل قرار الطلب");
  return result.data as Record<string,unknown>;
}

export async function getAttendanceExceptionForReview(exceptionId: string) {
  const result=await rpc("get_attendance_exception_v1",{p_exception_id:exceptionId});
  if(result.error)throw new Error(result.error.message||"تعذر تحميل استثناء الحضور");
  const detail=(result.data||null) as AttendanceExceptionReview|null;
  if(!detail?.verification_photo_path||detail.status!=="pending")return detail;
  const signed=await supabase.storage.from("hr_attendance_verification").createSignedUrl(detail.verification_photo_path,60);
  if(signed.error)throw new Error("تعذر فتح صورة التحقق المؤقتة");
  return {...detail,verification_photo_signed_url:signed.data.signedUrl};
}

export async function decideAttendanceException(exceptionId: string, decision: "approved"|"rejected", note?: string) {
  const invoked=await supabase.functions.invoke("attendance-exception-decision-v2",{
    body:{exception_id:exceptionId,decision,note:note?.trim()||null},
  });
  if(invoked.error)throw new Error(invoked.error.message||"تعذر إتمام قرار الحضور");
  const result=invoked.data as {ok?:boolean;code?:string;photo_deleted?:boolean};
  if(!result?.ok)throw new Error(result?.code||"تعذر إتمام قرار الحضور");
  if(!result.photo_deleted)throw new Error("لم يؤكد النظام حذف صورة التحقق؛ لم يتم اعتماد القرار");
  return result;
}



export async function getManagerOperationsPerformance(branchId: string, from: string, to: string) {
  const result=await rpc("get_hr_manager_team_operations_v1",{
    p_branch_id:branchId,
    p_from:from,
    p_to:to,
  });
  if(result.error){
    const value=result.error.message||"";
    if(value.includes("permission_denied"))throw new Error("ليس لديك صلاحية عرض تشغيل الفريق.");
    if(value.includes("date_range_too_large"))throw new Error("الفترة القصوى سنة واحدة.");
    if(value.includes("invalid_date_range"))throw new Error("الفترة الزمنية غير صحيحة.");
    throw new Error(value||"تعذر تحميل تشغيل الفريق.");
  }
  return result.data as ManagerOperationsPerformance;
}



export async function getCashHandoffWorkspace(branchId: string) {
  const result=await rpc("get_finance_cash_handoff_workspace_v2",{p_branch_id:branchId,p_limit:100});
  if(result.error){
    const value=result.error.message||"";
    if(value.includes("FINANCE_CASH_HANDOFF_ACCESS_DENIED"))throw new Error("ليس لديك صلاحية عرض تسليمات النقدية.");
    throw new Error(value||"تعذر تحميل تسليمات النقدية.");
  }
  return result.data as CashHandoffWorkspace;
}

export async function receiveCashHandoff(handoffId: string, receivedAmount: number, varianceReason?: string|null) {
  const result=await rpc("receive_pos_shift_cash_handoff_v2",{
    p_handoff_id:handoffId,
    p_received_amount:receivedAmount,
    p_variance_reason:varianceReason?.trim()||null,
  });
  if(result.error){
    const value=result.error.message||"";
    if(value.includes("FINANCE_CASH_HANDOFF_MANAGE_DENIED"))throw new Error("ليس لديك صلاحية استلام عهدة الوردية.");
    if(value.includes("INVALID_HANDOFF_AMOUNT"))throw new Error("اكتب المبلغ المستلم فعليًا بصورة صحيحة.");
    if(value.includes("CASH_HANDOFF_VARIANCE_REASON_REQUIRED"))throw new Error("فيه فرق في العهدة؛ اكتب سبب الفرق.");
    if(value.includes("CASH_HANDOFF_DRAWER_CHANGED"))throw new Error("رصيد الدرج تغيّر بعد إغلاق الوردية. حدّث البيانات قبل الاستلام.");
    throw new Error(value||"تعذر استلام عهدة الوردية.");
  }
  return result.data as Record<string,unknown>;
}



export async function getInventoryRiskWorkspace(branchId: string, status: InventoryRiskStatus = "low_stock") {
  const result=await rpc("get_inventory_control_center_v2",{
    p_branch_id:branchId,p_search:null,p_status:status,p_category_id:null,p_limit:50,p_offset:0,
  });
  if(result.error)throw inventoryError(result.error.message);
  const raw=(result.data||{}) as Record<string,unknown>;
  const summary=(raw.summary||{}) as Record<string,unknown>;
  const permissions=(raw.permissions||{}) as Record<string,unknown>;
  const rows=Array.isArray(raw.products)?raw.products as Array<Record<string,unknown>>:[];
  return {
    summary:{
      low_stock_rows:Number(summary.low_stock_rows||0),
      out_of_stock_rows:Number(summary.out_of_stock_rows||0),
      coverage_risk_rows:Number(summary.coverage_risk_rows||0),
      pending_audit_tasks:Number(summary.pending_audit_tasks||0),
    },
    permissions:{can_manage_sessions:Boolean(permissions.can_manage_sessions)},
    products:rows.map((row)=>({
      product_id:String(row.product_id||""),
      product_name:String(row.product_name||"منتج"),
      barcode:row.barcode==null?null:String(row.barcode),
      image_url:row.image_url==null?null:String(row.image_url),
      quantity:Number(row.quantity||0),
      reserved_quantity:Number(row.reserved_quantity||0),
      available_quantity:Number(row.available_quantity??row.quantity??0),
      unit_of_measure:String(row.unit_of_measure||"قطعة"),
      shelf_location:row.shelf_location==null?null:String(row.shelf_location),
      category_name:String(row.category_name||"بدون قسم"),
      min_stock_level:Number(row.min_stock_level||0),
      days_cover:row.days_cover==null?null:Number(row.days_cover),
      stock_status:String(row.stock_status||status),
      last_audit_at:row.last_audit_at==null?null:String(row.last_audit_at),
    })),
  } as InventoryRiskWorkspace;
}

export async function createSpotInventoryAudit(branchId: string, productIds: string[]) {
  const unique=[...new Set(productIds.filter(Boolean))];
  if(!unique.length)throw new Error("اختر منتجًا واحدًا على الأقل للجرد السريع.");
  const result=await rpc("create_inventory_audit_session_v2",{
    p_branch_id:branchId,
    p_audit_kind:"spot",
    p_title:"فحص مخزون حرج من Staff",
    p_description:"جرد سريع للتحقق من صنف منخفض أو نافد قبل اتخاذ إجراء شراء أو تحويل.",
    p_scope_type:"custom",
    p_scope_filter:{product_ids:unique},
    p_assignee_id:null,
    p_due_at:null,
  });
  if(result.error){
    const value=result.error.message||"";
    if(value.includes("INVENTORY_SESSION_MANAGE_DENIED"))throw new Error("ليس لديك صلاحية إنشاء جرد سريع.");
    if(value.includes("NO_ELIGIBLE_STAFF"))throw new Error("لا يوجد موظف مؤهل للجرد في هذا الفرع.");
    throw inventoryError(value);
  }
  return result.data as {session_id:string;product_count?:number;task_count?:number};
}

