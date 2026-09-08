import { supabase } from "@/integrations/supabase/client";

export type FinanceCashHandoffPendingV2 = {
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
  status: "pending";
};

export type FinanceCashHandoffRecentV2 = {
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
  received_by: string;
  received_by_name: string;
  received_at: string;
  transfer_id: string | null;
  status: "completed";
};

export type FinanceCashHandoffWorkspaceV2 = {
  version: number;
  branch_id: string;
  branch_name: string;
  generated_at: string;
  permissions: { can_manage: boolean };
  safe: null | {
    account_id: string;
    name: string;
    balance: number;
  };
  pending: FinanceCashHandoffPendingV2[];
  recent: FinanceCashHandoffRecentV2[];
};

export type FinanceCashHandoffReceiveResultV2 = {
  handoff_id: string;
  shift_id: string;
  status: "completed";
  already_completed: boolean;
  expected_amount: number;
  received_amount: number;
  variance_amount: number;
  variance_reason: string | null;
  transfer_id: string | null;
  drawer_balance?: number;
  safe_balance?: number;
  received_at: string;
  received_by_name: string;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function handoffError(message?: string) {
  const value = message || "";
  if (value.includes("FINANCE_CASH_HANDOFF_ACCESS_DENIED")) return new Error("ليس لديك صلاحية عرض تسليمات نقدية الورديات.");
  if (value.includes("FINANCE_CASH_HANDOFF_MANAGE_DENIED")) return new Error("تنفيذ استلام النقدية يحتاج صلاحية إدارة المالية.");
  if (value.includes("CASH_HANDOFF_NOT_FOUND")) return new Error("تسليم النقدية غير موجود أو لم يعد متاحًا.");
  if (value.includes("CASH_HANDOFF_SHIFT_NOT_CLOSED")) return new Error("لا يمكن استلام النقدية قبل إغلاق الوردية.");
  if (value.includes("INVALID_HANDOFF_AMOUNT")) return new Error("المبلغ المستلم غير صحيح.");
  if (value.includes("CASH_HANDOFF_VARIANCE_REASON_REQUIRED")) return new Error("اكتب سبب فرق الاستلام قبل التأكيد.");
  if (value.includes("CASH_HANDOFF_DRAWER_CHANGED|")) {
    const balance = Number(value.split("|")[1] || 0);
    return new Error(`رصيد الدرج تغيّر بعد إغلاق الوردية وأصبح ${balance.toFixed(2)} ج.م. راجع حركة الدرج قبل الاستلام.`);
  }
  return new Error(message || "تعذر تنفيذ استلام نقدية الوردية.");
}

const normalizeWorkspace = (raw: FinanceCashHandoffWorkspaceV2): FinanceCashHandoffWorkspaceV2 => ({
  ...raw,
  version: Number(raw.version || 2),
  safe: raw.safe ? { ...raw.safe, balance: Number(raw.safe.balance || 0) } : null,
  pending: (raw.pending || []).map((row) => ({
    ...row,
    drawer_balance: Number(row.drawer_balance || 0),
    expected_amount: Number(row.expected_amount || 0),
  })),
  recent: (raw.recent || []).map((row) => ({
    ...row,
    expected_amount: Number(row.expected_amount || 0),
    received_amount: Number(row.received_amount || 0),
    variance_amount: Number(row.variance_amount || 0),
  })),
});

export async function fetchFinanceCashHandoffWorkspaceV2(branchId: string, limit = 100) {
  const { data, error } = await rpc("get_finance_cash_handoff_workspace_v2", {
    p_branch_id: branchId,
    p_limit: limit,
  });
  if (error) throw handoffError(error.message);
  if (!data || typeof data !== "object") throw new Error("تعذر تحميل تسليمات نقدية الورديات.");
  return normalizeWorkspace(data as FinanceCashHandoffWorkspaceV2);
}

export async function receiveFinanceCashHandoffV2(input: {
  handoffId: string;
  receivedAmount: number;
  varianceReason?: string | null;
}) {
  const { data, error } = await rpc("receive_pos_shift_cash_handoff_v2", {
    p_handoff_id: input.handoffId,
    p_received_amount: input.receivedAmount,
    p_variance_reason: input.varianceReason?.trim() || null,
  });
  if (error) throw handoffError(error.message);
  if (!data || typeof data !== "object") throw new Error("لم يصل تأكيد استلام النقدية.");
  const result = data as FinanceCashHandoffReceiveResultV2;
  return {
    ...result,
    expected_amount: Number(result.expected_amount || 0),
    received_amount: Number(result.received_amount || 0),
    variance_amount: Number(result.variance_amount || 0),
    drawer_balance: result.drawer_balance == null ? undefined : Number(result.drawer_balance),
    safe_balance: result.safe_balance == null ? undefined : Number(result.safe_balance),
  };
}
