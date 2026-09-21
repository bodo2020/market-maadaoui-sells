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

const STAFF_CACHE_PREFIX = "elmadawy_staff_cache_v1";

function onlineNow() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function requireOnlineWrite() {
  if (!onlineNow()) throw new Error("أنت بدون اتصال. تقدر تراجع آخر بيانات محفوظة، لكن التنفيذ والتأكيد يحتاج إنترنت.");
}

function cacheKey(name: string, scope: string) {
  return `${name}:${scope}`;
}

async function scopedCacheKey(key: string) {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id || "signed-out";
  return `${STAFF_CACHE_PREFIX}:${userId}:${key}`;
}

function saveCache<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ saved_at: new Date().toISOString(), value }));
  } catch {
    // Cache failure must never block live operations.
  }
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value?: T };
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

export function clearStaffOfflineCache() {
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${STAFF_CACHE_PREFIX}:`)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Best-effort privacy cleanup only.
  }
}

async function cachedRead<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const scopedKey = await scopedCacheKey(key);
  try {
    const value = await loader();
    saveCache(scopedKey, value);
    return value;
  } catch (error) {
    if (!onlineNow()) {
      const cached = readCache<T>(scopedKey);
      if (cached !== null) return cached;
      throw new Error("أنت بدون اتصال ومفيش نسخة محفوظة من البيانات دي على الجهاز.");
    }
    throw error;
  }
}

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


export type PushDeviceStatus = {
  registered: boolean;
  device_count: number;
  platforms: string[];
  providers: string[];
};

export type PushDeviceRegistration = {
  device_id: string;
  platform: string;
  provider: string;
  app_kind: string;
  enabled: boolean;
  permission_status: string;
  registered_at: string;
  last_seen_at: string;
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


export type OrderSubstitutionApprovalDetail = {
  id: string;
  task_id: string | null;
  order_id: string;
  tracking_number: string | null;
  item_id: string;
  original_product_name: string;
  replacement_product_name: string;
  replacement_product_id: string;
  replacement_barcode: string | null;
  replacement_image_url: string | null;
  quantity: number;
  original_unit_price: number;
  replacement_unit_price: number;
  price_delta_total: number;
  financial_state: string;
  status: string;
  proposed_by_name: string | null;
  proposed_at: string;
  due_at: string | null;
};

export type OrderFinancialAdjustmentDetail = {
  id: string;
  order_id: string;
  direction: "charge" | "refund" | "neutral";
  signed_amount: number;
  amount: number;
  payment_method: string | null;
  payment_status: string | null;
  order_total_before: number;
  target_order_total: number;
  order_total_after: number;
  settlement_state: string;
  provider_reference: string | null;
  note: string | null;
  original_product_name?: string;
  replacement_product_name?: string;
  product_name?: string;
  shortage_quantity?: number;
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



export type ExpiryBatchItem = {
  batch_id: string;
  product_id: string;
  product_name: string;
  barcode: string | null;
  image_url: string | null;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  shelf_location: string | null;
  purchase_price: number;
  supplier_id: string | null;
  supplier_name: string | null;
  can_supplier_return: boolean;
  legacy_remaining_batch: boolean;
  duplicate_count: number;
  cost_missing: boolean;
  safe_for_action: boolean;
  notes: string | null;
};

export type ExpiryWorkspace = {
  branch_id: string;
  days_ahead: number;
  items: ExpiryBatchItem[];
  summary: {
    expired: number;
    today: number;
    within_3_days: number;
    within_7_days: number;
    total_quantity: number;
    purchase_value_at_risk: number;
    supplier_return_ready: number;
    legacy_remaining_rows: number;
    zero_cost_rows: number;
    duplicate_rows: number;
    safe_action_rows: number;
  };
};

export type BatchReconciliationLine = {
  batch_id: string | null;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  purchase_price: number;
  supplier_id: string | null;
  supplier_name?: string | null;
  shelf_location: string | null;
  purchase_item_id?: string | null;
  legacy_remaining?: boolean;
  cost_missing?: boolean;
  note?: string | null;
};

export type BatchReconciliationItem = {
  product_id: string;
  product_name: string;
  barcode: string | null;
  inventory_quantity: number;
  batch_quantity: number;
  quantity_gap: number;
  legacy_rows: number;
  zero_cost_rows: number;
  duplicate_rows: number;
  verified_count_id: string | null;
  last_verified_at: string | null;
  ready_for_reconciliation: boolean;
  batches: BatchReconciliationLine[];
};

export type BatchReconciliationWorkspace = {
  branch_id: string;
  inventory_branch_id: string;
  items: BatchReconciliationItem[];
};

export type ExpiryActionResult = {
  ok: boolean;
  idempotent: boolean;
  action_id: string;
  action_type: "dispose" | "supplier_return";
  product_id?: string;
  batch_id?: string;
  batch_number?: string;
  quantity: number;
  batch_quantity_after?: number;
  inventory_quantity_after?: number;
  purchase_price: number;
  value_amount: number;
  cost_missing?: boolean;
  supplier_id?: string | null;
  supplier_return_id?: string | null;
  expense_id?: string | null;
};

export type SupplierReturnWorkspace = {
  branch_id: string;
  status: string;
  items: Array<{
    id: string;
    branch_id: string;
    supplier_id: string;
    supplier_name: string;
    status: "pending_credit" | "credited" | "cancelled";
    expected_credit_amount: number;
    actual_credit_amount: number | null;
    credit_note_number: string | null;
    notes: string | null;
    created_at: string;
    settled_at: string | null;
    items: Array<{
      id: string;
      product_id: string;
      product_name: string;
      batch_id: string;
      batch_number: string;
      quantity: number;
      purchase_price: number;
      line_amount: number;
    }>;
  }>;
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

export type StaffEmploymentProfile = {
  user: {
    id: string;
    name: string;
    username: string | null;
    phone: string | null;
    email: string | null;
    role: string;
    active: boolean;
    created_at: string;
  };
  profile: {
    employee_code: string | null;
    employment_status: string | null;
    work_mode: string | null;
    contract_type: string | null;
    hire_date: string | null;
    termination_date: string | null;
    notes: string | null;
    primary_branch_id: string | null;
    department_id: string | null;
    team_id: string | null;
    job_title_id: string | null;
    direct_manager_id: string | null;
  } | null;
  department: { id: string; name_ar: string; code: string | null } | null;
  team: { id: string; name_ar: string } | null;
  job_title: { id: string; name_ar: string; grade: string | null } | null;
  manager: { id: string; name: string } | null;
  branches: Array<{
    branch_id: string;
    branch_name: string;
    is_primary: boolean;
    active: boolean;
    role: string;
  }>;
};

export type StaffHrPerformance = {
  employee: {
    id: string;
    name: string;
    employee_code: string | null;
    department_name: string | null;
    team_name: string | null;
    job_title_name: string | null;
    work_mode: string | null;
  };
  period: { from: string; to: string; days: number };
  attendance: {
    sessions: number;
    checkins: number;
    completed_sessions: number;
    worked_minutes: number;
    scheduled_days: number;
    approved_leave_days: number;
    attended_scheduled_days: number;
    absence_days: number;
    attendance_rate: number | null;
    late_sessions: number;
    late_minutes: number;
    early_departure_sessions: number;
    early_departure_minutes: number;
    on_time_sessions: number;
    punctuality_rate: number | null;
  };
  tasks: {
    assigned: number;
    completed: number;
    completion_rate: number | null;
    overdue_open: number;
    sla_measured_completed: number;
    sla_met: number;
    completed_late: number;
    sla_rate: number | null;
    avg_completion_minutes: number;
  };
  inventory: {
    counts_completed: number;
    matched: number;
    with_variance: number;
    recounts_completed: number;
    count_accuracy_rate: number | null;
  };
  notes: string[];
};

export type StaffCashierPerformance = {
  applicable: boolean;
  role: string;
  period: { from: string; to: string };
  sales: {
    invoice_count: number; sales_total: number; average_ticket: number; items_sold: number;
    items_per_invoice: number | null; discounts: number; loyalty_voucher_amount: number; merchant_payment_fees: number;
  };
  returns: { approved_count: number; approved_amount: number; return_amount_pct: number | null };
  shifts: {
    count: number; closed_count: number; absolute_cash_variance: number; absolute_opening_variance: number;
    reconciliation_lines: number; variance_lines: number; absolute_payment_variance: number;
  };
  notes: string[];
};

export type StaffInventoryPerformance = {
  applicable: boolean;
  counts: {
    assigned: number; submitted: number; completion_rate: number | null; matched: number; discrepancy: number;
    match_rate: number | null; abs_variance_units: number; abs_variance_value: number; avg_active_minutes: number | null;
    completed_on_time: number; overdue_open: number;
  };
  recounts: {
    assigned: number; submitted: number; completion_rate: number | null; matched_system: number;
    confirmed_variance: number; conflicting: number; abs_variance_units: number; abs_variance_value: number;
    avg_active_minutes: number | null; overdue_open: number;
  };
  peer_review: { reviewed: number; confirmed: number; disagreed: number; confirmation_rate: number | null };
  notes: string[];
};

export type StaffDeliveryPerformance = {
  applicable: boolean;
  assignments: { records: number; assigned_in_period: number; reassigned_away_in_period: number; active_open_orders: number };
  delivery: {
    shipped_orders: number; delivered_orders: number; cancelled_orders: number; delivered_value: number;
    delivered_orders_with_returns: number; delivery_duration_samples: number; avg_delivery_minutes: number | null;
    pickup_duration_samples: number; avg_pickup_minutes: number | null;
  };
  notes: string[];
};

export type StaffOnlinePerformance = {
  applicable: boolean;
  orders: {
    status_transitions: number; handled_orders: number; confirmed: number; preparing: number; ready: number;
    shipped: number; delivered: number; cancelled: number; handled_orders_with_returns: number;
    first_response_samples: number; avg_first_response_minutes: number | null; preparation_samples: number;
    avg_preparation_minutes: number | null;
    sla: {
      enabled: boolean; rate: number | null; overall_rate: number | null; first_response_rate: number | null;
      preparation_rate: number | null; evaluated_samples: number; first_response_target_minutes: number;
      preparation_target_minutes: number; reason: string | null;
    };
  };
  customer_service: {
    created_by_employee: number; assigned: number; assigned_closed: number; assigned_closed_by_employee: number;
    assigned_closed_by_other: number; completion_rate: number | null; completed_by_employee: number;
    scheduled_due: number; completed_late_assigned: number; overdue_open: number;
    avg_assigned_lifecycle_minutes: number | null; outcomes: Record<string, number>;
  };
  notes: string[];
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
  return cachedRead(cacheKey("tasks",`${branchId}:${scope}`),async()=>unwrap<OperationsTask[]>(await rpc("list_operations_tasks", {
    p_branch_id: branchId,
    p_scope: scope,
    p_limit: 100,
  })));
}

export async function claimTask(id: string) {
  requireOnlineWrite();
  return unwrap(await rpc("claim_operations_task", { p_task_id: id }));
}

export async function startTask(id: string) {
  requireOnlineWrite();
  return unwrap(await rpc("start_operations_task", { p_task_id: id }));
}

export async function completeTask(id: string, note = "تم التنفيذ من تطبيق الموظفين") {
  requireOnlineWrite();
  return unwrap(await rpc("complete_operations_task", { p_task_id: id, p_note: note }));
}

export async function getAttendance(branchId: string) {
  return cachedRead(cacheKey("attendance",branchId),async()=>unwrap<AttendancePayload>(await rpc("get_my_attendance_v1", { p_branch_id: branchId })));
}


function hrSelfError(message?:string) {
  const value=message||"";
  if(value.includes("permission_denied"))return new Error("ليس لديك صلاحية عرض الملف الوظيفي.");
  if(value.includes("employee_out_of_scope"))return new Error("الحساب خارج نطاق الفرع الحالي.");
  if(value.includes("invalid_date_range"))return new Error("الفترة الزمنية غير صحيحة.");
  if(value.includes("date_range_too_large"))return new Error("أقصى فترة للأداء سنة واحدة.");
  return new Error(message||"تعذر تحميل بيانات الملف الوظيفي.");
}

export async function getMyEmploymentProfile(employeeId:string,branchId:string) {
  const result=await rpc("get_hr_employee_profile_v1",{p_employee_id:employeeId,p_branch_id:branchId});
  if(result.error)throw hrSelfError(result.error.message);
  return result.data as StaffEmploymentProfile;
}

export async function getMyHrPerformance(employeeId:string,branchId:string,from:string,to:string) {
  const result=await rpc("get_hr_employee_performance_detail_v1",{
    p_employee_id:employeeId,p_branch_id:branchId,p_from:from,p_to:to,
  });
  if(result.error)throw hrSelfError(result.error.message);
  return result.data as StaffHrPerformance;
}

export async function getMyCashierPerformance(employeeId:string,branchId:string,from:string,to:string) {
  const result=await rpc("get_hr_cashier_performance_v1",{p_employee_id:employeeId,p_branch_id:branchId,p_from:from,p_to:to});
  if(result.error)throw hrSelfError(result.error.message);
  return result.data as StaffCashierPerformance;
}

export async function getMyInventoryPerformance(employeeId:string,branchId:string,from:string,to:string) {
  const result=await rpc("get_hr_inventory_performance_v1",{p_employee_id:employeeId,p_branch_id:branchId,p_from:from,p_to:to});
  if(result.error)throw hrSelfError(result.error.message);
  return result.data as StaffInventoryPerformance;
}

export async function getMyDeliveryPerformance(employeeId:string,branchId:string,from:string,to:string) {
  const result=await rpc("get_hr_delivery_performance_v1",{p_employee_id:employeeId,p_branch_id:branchId,p_from:from,p_to:to});
  if(result.error)throw hrSelfError(result.error.message);
  return result.data as StaffDeliveryPerformance;
}

export async function superAdminSetOwnStaffPin(employeeId:string,newPin:string) {
  requireOnlineWrite();
  if(!/^\d{4,6}$/.test(newPin))throw new Error("PIN الجديد يجب أن يكون من 4 إلى 6 أرقام.");
  const result=await rpc("super_admin_set_staff_app_pin_v2",{
    p_user_id:employeeId,
    p_new_pin:newPin,
  });
  if(result.error){
    const value=result.error.message||"";
    if(value.includes("SUPER_ADMIN_REQUIRED"))throw new Error("هذه العملية متاحة لمدير النظام فقط.");
    if(value.includes("INVALID_APP_PIN"))throw new Error("PIN يجب أن يكون من 4 إلى 6 أرقام.");
    if(value.includes("TARGET_STAFF_INACTIVE"))throw new Error("حساب الموظف غير موجود أو غير نشط.");
    throw new Error(value||"تعذر تغيير PIN.");
  }
  return result.data as {ok:boolean;user_id:string;changed:boolean};
}

export async function getMyOnlinePerformance(employeeId:string,branchId:string,from:string,to:string) {
  const result=await rpc("get_hr_online_customer_service_performance_v1",{p_employee_id:employeeId,p_branch_id:branchId,p_from:from,p_to:to});
  if(result.error)throw hrSelfError(result.error.message);
  return result.data as StaffOnlinePerformance;
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

export async function getMyPushDeviceStatus() {
  const result=await rpc("get_my_push_device_status_v2");
  if(result.error)throw new Error(result.error.message||"تعذر تحميل حالة الإشعارات");
  const raw=(result.data||{}) as Record<string,unknown>;
  return {
    registered:Boolean(raw.registered),
    device_count:Number(raw.device_count||0),
    platforms:Array.isArray(raw.platforms)?raw.platforms.filter((value): value is string=>typeof value==="string"):[],
    providers:Array.isArray(raw.providers)?raw.providers.filter((value): value is string=>typeof value==="string"):[],
  } as PushDeviceStatus;
}

export async function registerPushDevice(token:string,platform:"android"|"ios"|"web",deviceKey?:string|null) {
  requireOnlineWrite();
  const result=await rpc("register_push_device_v2",{
    p_token:token,
    p_platform:platform,
    p_app_kind:"staff",
    p_device_key:deviceKey?.trim()||null,
    p_locale:"ar-EG",
  });
  if(result.error){
    const value=result.error.message||"";
    if(value.includes("STAFF_PROFILE_REQUIRED"))throw new Error("حساب الموظف غير نشط ولا يمكن تسجيل Push.");
    if(value.includes("INVALID_PUSH_TOKEN"))throw new Error("توكن الإشعارات غير صالح.");
    throw new Error(value||"تعذر تسجيل جهاز الإشعارات.");
  }
  return result.data as PushDeviceRegistration;
}

export async function unregisterPushDevice(token:string) {
  requireOnlineWrite();
  const result=await rpc("unregister_push_device_v2",{p_token:token});
  if(result.error)throw new Error(result.error.message||"تعذر إلغاء تسجيل جهاز الإشعارات.");
  return Boolean(result.data);
}

export async function getNotifications(branchId: string, filter = "all") {
  return cachedRead(cacheKey("notifications",`${branchId}:${filter}`),async()=>unwrap<NotificationCenter>(await rpc("get_my_notification_center_v2", {
    p_branch_id: branchId,
    p_filter: filter,
    p_category: null,
    p_limit: 100,
  })));
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
  requireOnlineWrite();
  const result = await rpc("submit_inventory_count_v2", {
    p_task_id: taskId,
    p_actual_count: actualCount,
    p_note: note?.trim() || null,
  });
  if (result.error) throw inventoryError(result.error.message);
  return result.data as InventoryCountSubmissionResult;
}

export async function submitInventoryRecount(taskId: string, actualCount: number, note?: string) {
  requireOnlineWrite();
  const result = await rpc("submit_inventory_recount_v2", {
    p_task_id: taskId,
    p_actual_count: actualCount,
    p_note: note?.trim() || null,
  });
  if (result.error) throw inventoryError(result.error.message);
  return result.data as InventoryCountSubmissionResult;
}

export async function approveInventoryAdjustment(taskId: string, reasonCode: InventoryAdjustmentReason, note: string) {
  requireOnlineWrite();
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
  requireOnlineWrite();
  const result = await rpc("reject_inventory_adjustment_v2", {
    p_task_id: taskId,
    p_reason_code: reasonCode,
    p_note: note.trim(),
  });
  if (result.error) throw inventoryError(result.error.message);
  return result.data as Record<string, unknown>;
}

export async function getInventoryTransferWorkspace(branchId: string) {
  return cachedRead(cacheKey("inventory_transfers",branchId),async()=>{
    const result = await rpc("get_inventory_transfer_workspace_v2", {
      p_branch_id: branchId,
      p_status: "active",
      p_limit: 100,
    });
    if (result.error) throw inventoryError(result.error.message);
    return result.data as InventoryTransferWorkspace;
  });
}

export async function dispatchInventoryTransfer(transferId: string, note?: string) {
  requireOnlineWrite();
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
  requireOnlineWrite();
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
  return cachedRead(cacheKey("inventory_risk",`${branchId}:${status}`),async()=>{
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
  });
}

export async function createSpotInventoryAudit(branchId: string, productIds: string[]) {
  requireOnlineWrite();
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



function substitutionError(message?: string){
  const value=message||"";
  if(value.includes("SUBSTITUTION_APPROVAL_DENIED"))return new Error("ليس لديك صلاحية اعتماد بدائل الطلبات.");
  if(value.includes("SUBSTITUTION_DECISION_NOTE_REQUIRED"))return new Error("اكتب ملاحظة واضحة للقرار.");
  if(value.includes("SUBSTITUTE_INSUFFICIENT_STOCK"))return new Error("مخزون المنتج البديل لم يعد كافيًا.");
  if(value.includes("PICKING_NOT_ACTIVE"))return new Error("الطلب لم يعد في مرحلة التجهيز.");
  if(value.includes("SUBSTITUTION_FINANCE_ACCESS_DENIED")||value.includes("SHORTAGE_FINANCE_ACCESS_DENIED"))return new Error("ليس لديك صلاحية التسوية المالية.");
  if(value.includes("PROVIDER_REFERENCE_REQUIRED"))return new Error("اكتب مرجع عملية التحصيل أو الرد.");
  if(value.includes("FINANCE_NOTE_REQUIRED"))return new Error("اكتب ملاحظة التسوية المالية.");
  if(value.includes("FINANCE_NOT_PENDING"))return new Error("هذه التسوية لم تعد معلقة.");
  return new Error(message||"تعذر تنفيذ قرار الطلب.");
}

export async function getOrderSubstitutionApproval(branchId:string,substitutionId:string){
  const result=await rpc("list_order_substitution_approvals_v1",{p_branch_id:branchId,p_limit:150});
  if(result.error)throw substitutionError(result.error.message);
  const raw=(result.data||{}) as {items?:OrderSubstitutionApprovalDetail[]};
  const item=Array.isArray(raw.items)?raw.items.find((row)=>row.id===substitutionId):undefined;
  if(!item)throw new Error("موافقة البديل لم تعد معلقة.");
  return item;
}

export async function decideOrderSubstitution(substitutionId:string,decision:"approve"|"reject",note:string){
  const result=await rpc("decide_order_fulfillment_substitution_v1",{
    p_substitution_id:substitutionId,p_decision:decision,p_note:note.trim(),
  });
  if(result.error)throw substitutionError(result.error.message);
  return result.data as {ok:boolean;status:string;price_delta_total?:number;financial_state?:string};
}

export async function getOrderSubstitutionFinancialAdjustment(adjustmentId:string){
  const result=await rpc("get_order_substitution_financial_adjustment_v1",{p_adjustment_id:adjustmentId});
  if(result.error)throw substitutionError(result.error.message);
  return result.data as OrderFinancialAdjustmentDetail;
}

export async function settleOrderSubstitutionFinancialAdjustment(adjustmentId:string,providerReference:string,note:string){
  const result=await rpc("settle_order_substitution_financial_adjustment_v1",{
    p_adjustment_id:adjustmentId,p_provider_reference:providerReference.trim(),p_note:note.trim(),
  });
  if(result.error)throw substitutionError(result.error.message);
  return result.data as Record<string,unknown>;
}

export async function getOrderShortageFinancialAdjustment(adjustmentId:string){
  const result=await rpc("get_order_shortage_financial_adjustment_v1",{p_adjustment_id:adjustmentId});
  if(result.error)throw substitutionError(result.error.message);
  return result.data as OrderFinancialAdjustmentDetail;
}

export async function settleOrderShortageFinancialAdjustment(adjustmentId:string,providerReference:string,note:string){
  const result=await rpc("settle_order_shortage_financial_adjustment_v1",{
    p_adjustment_id:adjustmentId,p_provider_reference:providerReference.trim(),p_note:note.trim(),
  });
  if(result.error)throw substitutionError(result.error.message);
  return result.data as Record<string,unknown>;
}



function expiryActionError(message?: string) {
  const value=message||"";
  if(value.includes("EXPIRY_VIEW_DENIED"))return new Error("ليس لديك صلاحية عرض دفعات الصلاحية.");
  if(value.includes("EXPIRY_DISPOSE_DENIED"))return new Error("ليس لديك صلاحية إهلاك منتجات الصلاحية.");
  if(value.includes("EXPIRY_SUPPLIER_RETURN_DENIED"))return new Error("ليس لديك صلاحية إرجاع دفعات للمورد.");
  if(value.includes("EXPIRY_SUPPLIER_REQUIRED"))return new Error("الدفعة غير مرتبطة بمورد أو فاتورة شراء؛ لا يمكن إنشاء إرجاع للمورد قبل ربطها.");
  if(value.includes("EXPIRY_BATCH_QUANTITY_EXCEEDED"))return new Error("الكمية المطلوبة أكبر من الكمية المسجلة في الدفعة.");
  if(value.includes("EXPIRY_LEGACY_DAMAGED_BATCH"))return new Error("هذه دفعة تالف قديمة ولا يسمح النظام بمعالجتها مرة ثانية.");
  if(value.includes("EXPIRY_LEGACY_REMAINING_REQUIRES_RECONCILIATION"))return new Error("هذه دفعة متبقية من النظام القديم. لازم تسوية بيانات الدفعة قبل الإهلاك أو الإرجاع.");
  if(value.includes("EXPIRY_DUPLICATE_BATCH_REQUIRES_RECONCILIATION"))return new Error("يوجد أكثر من سجل لنفس الدفعة. لازم دمج/تسوية البيانات قبل تنفيذ إجراء صلاحية.");
  if(value.includes("EXPIRY_COST_REQUIRED"))return new Error("تكلفة شراء الدفعة غير موثوقة أو تساوي صفر. اربط تكلفة صحيحة قبل الإهلاك أو الإرجاع.");
  if(value.includes("EXPIRY_RECENT_AUDIT_REQUIRED"))return new Error("لازم تعمل جرد تحقق مطابق للمنتج خلال آخر 4 ساعات قبل الإهلاك أو الإرجاع للمورد.");
  if(value.includes("INSUFFICIENT_STOCK"))return new Error("لا توجد كمية متاحة كافية بعد خصم حجوزات الطلبات الإلكترونية.");
  if(value.includes("EXPIRY_NOTE_REQUIRED"))return new Error("اكتب سببًا واضحًا للإجراء.");
  if(value.includes("REQUEST_CONFLICT"))return new Error("تم استخدام رقم العملية لطلب مختلف. حدّث الشاشة وحاول مرة أخرى.");
  if(value.includes("SUPPLIER_RETURN_SETTLE_DENIED"))return new Error("ليس لديك صلاحية تسوية إرجاع المورد.");
  if(value.includes("SUPPLIER_RETURN_CREDIT_NOTE_REQUIRED"))return new Error("اكتب رقم Credit Note أو مرجع اعتماد المورد.");
  if(value.includes("SUPPLIER_RETURN_NOT_PENDING"))return new Error("إرجاع المورد لم يعد بانتظار التسوية.");
  return new Error(message||"تعذر تنفيذ إجراء الصلاحية.");
}

export async function getExpiryWorkspace(branchId: string, daysAhead = 30) {
  const safeDays=Math.min(Math.max(Math.trunc(daysAhead||30),1),90);
  return cachedRead(cacheKey("expiry",`${branchId}:${safeDays}`),async()=>{
    const result=await rpc("get_expiry_workspace_v2",{
      p_branch_id:branchId,
      p_days_ahead:safeDays,
      p_limit:250,
    });
    if(result.error)throw expiryActionError(result.error.message);
    return result.data as ExpiryWorkspace;
  });
}

function batchReconciliationError(message?:string){
  const value=message||"";
  if(value.includes("BATCH_RECON_PERMISSION_DENIED"))return new Error("تسوية الدفعات تحتاج صلاحية إدارة المخزون والمشتريات معًا.");
  if(value.includes("BATCH_RECON_RECENT_MATCHED_COUNT_REQUIRED"))return new Error("لازم جرد مطابق حديث خلال آخر 4 ساعات ومساوي للرصيد الحالي قبل التسوية.");
  if(value.includes("BATCH_RECON_TOTAL_MUST_MATCH_INVENTORY"))return new Error("مجموع كميات الدفعات الجديدة لازم يساوي رصيد المخزون الحالي بالضبط.");
  if(value.includes("BATCH_RECON_LINES_REQUIRED"))return new Error("الرصيد الحالي أكبر من صفر، لذلك لازم تسجل دفعة واحدة على الأقل.");
  if(value.includes("BATCH_RECON_INVENTORY_INVALID"))return new Error("رصيد Inventory غير صالح للتسوية.");
  if(value.includes("BATCH_RECON_DUPLICATE_CANONICAL_LINE"))return new Error("لا تكرر نفس رقم الدفعة وتاريخ الصلاحية في التسوية الجديدة.");
  if(value.includes("BATCH_RECON_BATCH_NUMBER_INVALID"))return new Error("رقم الدفعة الجديد لازم يكون حقيقي ومش من REMAINING أو DAMAGED القديم.");
  if(value.includes("BATCH_RECON_COST_INVALID"))return new Error("كل دفعة لازم يكون لها سعر شراء صحيح أكبر من صفر.");
  if(value.includes("BATCH_RECON_QUANTITY_INVALID"))return new Error("كمية الدفعة غير صحيحة.");
  if(value.includes("BATCH_RECON_NOTE_REQUIRED"))return new Error("اكتب ملاحظة تسوية واضحة.");
  if(value.includes("REQUEST_CONFLICT"))return new Error("رقم طلب التسوية تم استخدامه لعملية مختلفة.");
  return new Error(message||"تعذر تنفيذ تسوية الدفعات.");
}

export async function getBatchReconciliationWorkspace(branchId:string){
  const result=await rpc("get_inventory_batch_reconciliation_workspace_v1",{
    p_branch_id:branchId,p_limit:100,
  });
  if(result.error)throw batchReconciliationError(result.error.message);
  return result.data as BatchReconciliationWorkspace;
}

export async function reconcileProductBatches(
  requestId:string,
  branchId:string,
  productId:string,
  lines:BatchReconciliationLine[],
  note:string,
){
  requireOnlineWrite();
  const result=await rpc("reconcile_product_batches_v1",{
    p_request_id:requestId,
    p_branch_id:branchId,
    p_product_id:productId,
    p_lines:lines.map((line)=>({
      batch_id:line.batch_id||null,
      batch_number:line.batch_number.trim(),
      expiry_date:line.expiry_date,
      quantity:Number(line.quantity),
      purchase_price:Number(line.purchase_price),
      supplier_id:line.supplier_id||null,
      shelf_location:line.shelf_location?.trim()||null,
      note:line.note?.trim()||null,
    })),
    p_note:note.trim(),
  });
  if(result.error)throw batchReconciliationError(result.error.message);
  return result.data as {
    ok:boolean;
    idempotent:boolean;
    reconciliation_id:string;
    product_id:string;
    inventory_quantity:number;
    verified_count_id:string;
    before_batches:unknown[];
    after_batches:unknown[];
  };
}

export async function processExpiryBatchAction(
  requestId:string,
  branchId:string,
  batchId:string,
  quantity:number,
  action:"dispose"|"supplier_return",
  note:string,
) {
  requireOnlineWrite();
  const result=await rpc("process_expiry_batch_action_v2",{
    p_request_id:requestId,
    p_branch_id:branchId,
    p_batch_id:batchId,
    p_quantity:quantity,
    p_action:action,
    p_note:note.trim(),
  });
  if(result.error)throw expiryActionError(result.error.message);
  return result.data as ExpiryActionResult;
}

export async function getSupplierReturnsWorkspace(branchId:string,status:"pending_credit"|"credited"|"cancelled"|"all"="pending_credit") {
  return cachedRead(cacheKey("supplier_returns",`${branchId}:${status}`),async()=>{
    const result=await rpc("get_supplier_returns_workspace_v2",{
      p_branch_id:branchId,
      p_status:status,
      p_limit:100,
    });
    if(result.error)throw expiryActionError(result.error.message);
    return result.data as SupplierReturnWorkspace;
  });
}

export async function settleSupplierReturn(returnId:string,actualCreditAmount:number,creditNoteNumber:string,note?:string) {
  requireOnlineWrite();
  const result=await rpc("settle_supplier_return_v2",{
    p_return_id:returnId,
    p_actual_credit_amount:actualCreditAmount,
    p_credit_note_number:creditNoteNumber.trim(),
    p_note:note?.trim()||null,
  });
  if(result.error)throw expiryActionError(result.error.message);
  return result.data as Record<string,unknown>;
}
