import { supabase } from "@/integrations/supabase/client";

export type TreasurySourceKind = "branch_safe" | "pos_drawer" | "bank";

export type TreasuryStaff = {
  user_id: string;
  name: string;
  role?: string | null;
};

export type TreasuryCashAccount = {
  account_id: string;
  account_type: string;
  name: string;
  currency: string;
  active: boolean;
  balance: number;
  device_id?: string | null;
  device_name?: string | null;
  open_shift_id?: string | null;
  responsible_user_id?: string | null;
  responsible_user_name?: string | null;
  responsibility_source?: string | null;
  last_movement_at?: string | null;
};

export type TreasuryPaymentAccount = {
  account_id: string;
  account_type: string;
  provider_code: string;
  name: string;
  currency: string;
  active: boolean;
  balance: number;
  responsible_user_id?: string | null;
  responsible_user_name?: string | null;
  responsibility_source?: string | null;
  last_movement_at?: string | null;
};

export type UnlinkedSalaryAdvance = {
  advance_id: string;
  employee_id: string;
  employee_name: string;
  amount: number;
  outstanding_amount: number;
  status: string;
  paid_at?: string | null;
  payout_reference?: string | null;
  source_status: "unlinked";
};

export type PendingTreasuryDisbursement = {
  task_id: string;
  advance_id: string;
  employee_name: string;
  amount: number;
  source_kind: TreasurySourceKind;
  source_account_id: string;
  source_account_name: string;
  responsible_user_id: string;
  responsible_user_name: string;
  status: string;
  created_at: string;
};

export type TreasuryMovement = {
  id: string;
  ledger_kind: "cash" | "payment";
  account_id: string;
  account_type: string;
  account_name: string;
  entry_type: string;
  signed_amount: number;
  description?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  created_at: string;
  created_by?: string | null;
  actor_name?: string | null;
};

export type FinanceTreasuryWorkspaceV2 = {
  version: number;
  branch_id: string;
  permissions: { can_manage: boolean };
  cash_accounts: TreasuryCashAccount[];
  payment_accounts: TreasuryPaymentAccount[];
  eligible_staff: TreasuryStaff[];
  unlinked_salary_advances: UnlinkedSalaryAdvance[];
  pending_disbursements: PendingTreasuryDisbursement[];
  recent_movements: TreasuryMovement[];
  generated_at: string;
};

export type FinancePayoutSourceV2 = {
  account_id: string;
  source_kind: TreasurySourceKind;
  name: string;
  currency: string;
  balance: number;
  responsible_user_id?: string | null;
  responsible_user_name?: string | null;
  shift_id?: string | null;
  assignable: boolean;
};

export type TreasuryPayoutTaskDetail = {
  task: { id: string; status: string; claimed_by?: string | null; created_at: string };
  advance: {
    id: string;
    employee_id: string;
    employee_name: string;
    amount: number;
    outstanding_amount: number;
    status: string;
    original_paid_at?: string | null;
    legacy_reconciliation: boolean;
  };
  source: {
    kind: TreasurySourceKind;
    account_id: string;
    account_name: string;
    responsible_user_id: string;
    balance: number;
  };
  reference?: string | null;
  parent_task_id?: string | null;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function treasuryError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.");
  if (value.includes("FINANCE_VIEW_DENIED")) return new Error("ليس لديك صلاحية عرض مركز الخزن.");
  if (value.includes("FINANCE_MANAGE_DENIED")) return new Error("ليس لديك صلاحية إدارة الخزن أو إسناد عمليات الصرف.");
  if (value.includes("FINANCE_CUSTODIAN_INVALID")) return new Error("الموظف المختار ليس موظفًا نشطًا في هذا الفرع.");
  if (value.includes("FINANCE_ACCOUNT_UNAVAILABLE")) return new Error("الحساب أو الخزنة لم تعد متاحة.");
  if (value.includes("HR_PAYOUT_SOURCE_REQUIRED")) return new Error("اختر الخزنة أو الحساب الذي سيتم الصرف منه.");
  if (value.includes("HR_PAYOUT_SOURCE_UNAVAILABLE")) return new Error("مصدر الصرف غير متاح لهذا الفرع.");
  if (value.includes("HR_PAYOUT_SOURCE_HAS_NO_RESPONSIBLE")) return new Error("حدد مسؤولًا للخزنة/البنك أولًا. درج الكاشير يعتمد تلقائيًا على صاحب الوردية المفتوحة.");
  if (value.includes("HR_PAYOUT_RESPONSIBLE_UNAVAILABLE")) return new Error("مسؤول الخزنة الحالي غير متاح أو لم يعد ضمن الفرع.");
  if (value.includes("HR_PAYOUT_INSUFFICIENT_BALANCE")) return new Error("رصيد مصدر الصرف أقل من قيمة السلفة.");
  if (value.includes("HR_PAYOUT_ALREADY_DELEGATED")) return new Error("السلفة مرسلة بالفعل لمسؤول خزنة آخر. انتظر القرار أو أعدها للمالية بعد الرفض.");
  if (value.includes("HR_ADVANCE_NOT_PENDING_PAYOUT")) return new Error("السلفة لم تعد في مرحلة انتظار الصرف.");
  if (value.includes("HR_ADVANCE_NOT_UNLINKED")) return new Error("السلفة القديمة مرتبطة بالفعل بمصدر صرف أو ليست مؤهلة للتسوية.");
  if (value.includes("TREASURY_TASK_NOT_OWNER")) return new Error("مهمة الصرف ليست مسندة لحسابك.");
  if (value.includes("TREASURY_RESPONSIBILITY_CHANGED")) return new Error("مسؤولية الخزنة تغيرت بعد إنشاء المهمة. أعد العملية إلى المالية لإسنادها من جديد.");
  if (value.includes("TREASURY_DRAWER_SHIFT_CHANGED")) return new Error("وردية هذا الدرج تغيرت. لا يمكن الخصم من درج لم يعد في عهدتك.");
  if (value.includes("TREASURY_INSUFFICIENT_BALANCE")) return new Error("الرصيد الحالي لا يكفي للصرف. لم يتم خصم أي مبلغ.");
  if (value.includes("TREASURY_CONFIRM_NOTE_REQUIRED")) return new Error("اكتب ملاحظة تؤكد تسليم المبلغ قبل الخصم.");
  if (value.includes("TREASURY_REJECTION_REASON_REQUIRED")) return new Error("اكتب سبب رفض/تعذر الصرف.");
  if (value.includes("TASK_NOT_OWNER")) return new Error("المهمة لم تعد مسندة لحسابك.");
  return new Error(message || "تعذر تنفيذ عملية الخزنة.");
}

export async function fetchFinanceTreasuryWorkspaceV2(branchId: string, limit = 100): Promise<FinanceTreasuryWorkspaceV2> {
  const { data, error } = await rpc("get_finance_treasury_workspace_v2", { p_branch_id: branchId, p_limit: limit });
  if (error) throw treasuryError(error.message);
  return data as FinanceTreasuryWorkspaceV2;
}

export async function fetchFinancePayoutSourcesV2(branchId: string): Promise<FinancePayoutSourceV2[]> {
  const { data, error } = await rpc("get_finance_payout_sources_v2", { p_branch_id: branchId });
  if (error) throw treasuryError(error.message);
  const items = (data as { items?: FinancePayoutSourceV2[] } | null)?.items;
  return Array.isArray(items) ? items : [];
}

export async function setFinanceAccountCustodian(input: {
  branchId: string;
  accountKind: "cash" | "payment";
  accountId: string;
  userId?: string | null;
}) {
  const { data, error } = await rpc("set_finance_account_custodian_v1", {
    p_branch_id: input.branchId,
    p_account_kind: input.accountKind,
    p_account_id: input.accountId,
    p_user_id: input.userId || null,
  });
  if (error) throw treasuryError(error.message);
  return data as { ok: boolean; account_id: string; account_name: string; custodian_user_id?: string | null; custodian_user_name?: string | null };
}

export async function delegateHrSalaryAdvancePayout(input: {
  taskId: string;
  sourceKind: TreasurySourceKind;
  sourceAccountId: string;
  note: string;
  reference?: string | null;
}) {
  const { data, error } = await rpc("delegate_hr_salary_advance_payout_v3", {
    p_task_id: input.taskId,
    p_source_kind: input.sourceKind,
    p_source_account_id: input.sourceAccountId,
    p_note: input.note.trim(),
    p_reference: input.reference?.trim() || null,
  });
  if (error) throw treasuryError(error.message);
  return data as { ok: boolean; idempotent?: boolean; delegated_task_id: string; responsible_user_id: string; responsible_user_name: string; source_account_name: string; amount: number };
}

export async function delegateLegacySalaryAdvanceSource(input: {
  advanceId: string;
  sourceKind: TreasurySourceKind;
  sourceAccountId: string;
  note: string;
  reference?: string | null;
}) {
  const { data, error } = await rpc("delegate_legacy_hr_salary_advance_source_v1", {
    p_advance_id: input.advanceId,
    p_source_kind: input.sourceKind,
    p_source_account_id: input.sourceAccountId,
    p_note: input.note.trim(),
    p_reference: input.reference?.trim() || null,
  });
  if (error) throw treasuryError(error.message);
  return data as { ok: boolean; delegated_task_id: string; responsible_user_id: string; responsible_user_name: string; source_account_name: string; amount: number };
}

export async function getTreasuryPayoutTask(taskId: string): Promise<TreasuryPayoutTaskDetail> {
  const { data, error } = await rpc("get_my_hr_treasury_payout_task_v1", { p_task_id: taskId });
  if (error) throw treasuryError(error.message);
  return data as TreasuryPayoutTaskDetail;
}

export async function confirmTreasuryPayout(taskId: string, note: string, reference?: string | null) {
  const { data, error } = await rpc("confirm_hr_treasury_payout_v1", {
    p_task_id: taskId,
    p_note: note.trim(),
    p_reference: reference?.trim() || null,
  });
  if (error) throw treasuryError(error.message);
  return data as { ok: boolean; idempotent?: boolean; advance_id: string; amount: number; source_account_name: string; source_balance_after: number; legacy_reconciliation?: boolean };
}

export async function rejectTreasuryPayout(taskId: string, reason: string) {
  const { data, error } = await rpc("reject_hr_treasury_payout_v1", { p_task_id: taskId, p_reason: reason.trim() });
  if (error) throw treasuryError(error.message);
  return data as { ok: boolean; advance_id: string; status: string; legacy_reconciliation?: boolean };
}
