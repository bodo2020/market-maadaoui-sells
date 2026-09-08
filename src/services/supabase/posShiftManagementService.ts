import { supabase } from "@/integrations/supabase/client";
import type {
  PosShiftReconciliationInput,
  PosShiftReconciliationPreview,
  PosShiftReconciliationResult,
} from "@/services/supabase/posShiftService";

export type ManagedPosShift = {
  id: string;
  user_id: string;
  employee_name: string;
  device_id: string;
  device_name: string;
  device_code: string;
  branch_id: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_difference: number | null;
  closing_notes: string | null;
  sales_count: number;
  sales_total: number;
  cash_sales_total: number;
  card_sales_total: number;
  drawer_balance: number;
  reconciliation_version?: number;
  payment_reconciliations?: PosShiftReconciliationResult[];
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

const amount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("بيانات تسوية الوردية غير مكتملة. أعد التحميل قبل الإغلاق.");
  return parsed;
};

function managerShiftError(message?: string) {
  if (message?.startsWith("RECONCILIATION_REASON_REQUIRED|")) {
    const code = message.split("|")[1] || "وسيلة الدفع";
    return `فيه فرق في ${code}. اكتب سبب الفرق قبل الإغلاق الإداري.`;
  }
  switch (message) {
    case "CLOSING_REASON_REQUIRED": return "اكتب سبب الإغلاق الإداري.";
    case "INVALID_CLOSING_CASH": return "النقد المعدود غير صحيح.";
    case "SHIFT_NOT_OPEN": return "الوردية اتقفلت بالفعل أو لم تعد متاحة.";
    case "PERMISSION_DENIED": return "ليس لديك صلاحية إدارة ورديات POS.";
    case "INVALID_RECONCILIATION": return "بيانات تسوية وسائل الدفع غير صحيحة.";
    case "INVALID_RECONCILIATION_AMOUNT": return "راجع المبالغ الفعلية لكل وسيلة دفع.";
    case "RECONCILIATION_METHOD_MISMATCH": return "وسائل الدفع تغيرت أثناء شاشة الإغلاق. أعد تحميل التسوية قبل التأكيد.";
    case "CASH_RECONCILIATION_REQUIRED": return "لازم تدخل العد الفعلي للنقد قبل الإغلاق الإداري.";
    default: return message || "تعذر تحديث وردية POS";
  }
}

function normalizePreview(data: unknown): PosShiftReconciliationPreview {
  if (!data || typeof data !== "object") throw new Error("لم تصل تفاصيل تسوية الوردية.");
  const raw = data as Record<string, unknown>;
  if (!Array.isArray(raw.methods)) throw new Error("تفاصيل وسائل الدفع غير متاحة. أعد تحميل الوردية.");
  return {
    version: amount(raw.version),
    shift_id: String(raw.shift_id || ""),
    branch_id: String(raw.branch_id || ""),
    device_id: String(raw.device_id || ""),
    cashier_id: String(raw.cashier_id || ""),
    status: String(raw.status || ""),
    opened_at: String(raw.opened_at || ""),
    generated_at: String(raw.generated_at || ""),
    methods: raw.methods.map((entry) => {
      if (!entry || typeof entry !== "object") throw new Error("بيانات وسيلة دفع غير مكتملة.");
      const row = entry as Record<string, unknown>;
      return {
        payment_method_id: row.payment_method_id ? String(row.payment_method_id) : null,
        code: String(row.code || "other"),
        name: String(row.name || "وسيلة دفع"),
        method_type: String(row.method_type || "other"),
        settlement_account_id: row.settlement_account_id ? String(row.settlement_account_id) : null,
        expected_source: String(row.expected_source || "unknown"),
        sale_count: amount(row.sale_count),
        base_amount: amount(row.base_amount),
        charged_amount: amount(row.charged_amount),
        customer_fee_amount: amount(row.customer_fee_amount),
        merchant_fee_amount: amount(row.merchant_fee_amount),
        confirmed_refund_amount: amount(row.confirmed_refund_amount),
        pending_refund_amount: amount(row.pending_refund_amount),
        expected_amount: amount(row.expected_amount),
        account_balance: row.account_balance == null ? null : amount(row.account_balance),
      };
    }),
  };
}

export async function listBranchPosShifts(branchId: string, status?: "open" | "closed" | null): Promise<ManagedPosShift[]> {
  const { data, error } = await rpc("list_branch_pos_shifts", {
    p_branch_id: branchId,
    p_status: status || null,
    p_limit: 50,
  });
  if (error) throw new Error(error.message || "تعذر تحميل ورديات POS");
  return (Array.isArray(data) ? data : []) as ManagedPosShift[];
}

/** Legacy manager close kept only for older surfaces. New settings UI uses managerClosePosShiftV2. */
export async function managerClosePosShift(shiftId: string, closingCash: number, notes: string): Promise<ManagedPosShift> {
  const { data, error } = await rpc("manager_close_pos_shift", {
    p_shift_id: shiftId,
    p_closing_cash: closingCash,
    p_notes: notes.trim(),
  });
  if (error) throw new Error(managerShiftError(error.message));
  if (!data || typeof data !== "object") throw new Error("لم يصل تأكيد إغلاق الوردية.");
  return data as ManagedPosShift;
}

export async function getManagerPosShiftReconciliationPreview(shiftId: string): Promise<PosShiftReconciliationPreview> {
  const { data, error } = await rpc("get_manager_pos_shift_reconciliation_preview", {
    p_shift_id: shiftId,
  });
  if (error) throw new Error(managerShiftError(error.message));
  return normalizePreview(data);
}

export async function managerClosePosShiftV2(
  shiftId: string,
  reconciliation: PosShiftReconciliationInput[],
  notes: string,
): Promise<ManagedPosShift> {
  const { data, error } = await rpc("manager_close_pos_shift_v2", {
    p_shift_id: shiftId,
    p_reconciliation: reconciliation,
    p_notes: notes.trim(),
  });
  if (error) throw new Error(managerShiftError(error.message));
  if (!data || typeof data !== "object") throw new Error("لم يصل تأكيد إغلاق الوردية الإداري.");
  return data as ManagedPosShift;
}
