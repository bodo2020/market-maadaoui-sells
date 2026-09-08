import { supabase } from "@/integrations/supabase/client";
import type { LocalPosDevice } from "@/services/supabase/posDeviceService";

export type PosShiftReconciliationResult = {
  code: string;
  name: string;
  method_type: string;
  expected_amount: number;
  counted_amount: number;
  variance_amount: number;
  variance_reason: string | null;
  expected_source: string;
};

export type PosShift = {
  id: string;
  user_id: string;
  branch_id: string;
  device_id: string;
  drawer_account_id?: string | null;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  opening_system_balance?: number | null;
  opening_variance?: number | null;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_difference: number | null;
  closing_notes: string | null;
  branch_name?: string;
  device_name?: string;
  employee_name?: string;
  sales_count?: number;
  sales_total?: number;
  product_discount_total?: number;
  loyalty_discount_total?: number;
  net_sales_total?: number;
  cash_movement?: number;
  drawer_balance?: number;
  drawer_balance_after?: number;
  already_open?: boolean;
  reconciliation_version?: number;
  payment_reconciliations?: PosShiftReconciliationResult[];
};

export type PosShiftReconciliationMethod = {
  payment_method_id: string | null;
  code: string;
  name: string;
  method_type: "cash" | "card" | "digital_wallet" | "bank_transfer" | "other" | string;
  settlement_account_id: string | null;
  expected_source: string;
  sale_count: number;
  base_amount: number;
  charged_amount: number;
  customer_fee_amount: number;
  merchant_fee_amount: number;
  confirmed_refund_amount: number;
  pending_refund_amount: number;
  expected_amount: number;
  account_balance: number | null;
};

export type PosShiftReconciliationPreview = {
  version: number;
  shift_id: string;
  branch_id: string;
  device_id: string;
  cashier_id: string;
  status: string;
  opened_at: string;
  generated_at: string;
  methods: PosShiftReconciliationMethod[];
};

export type PosShiftReconciliationInput = {
  code: string;
  counted_amount: number;
  variance_reason?: string | null;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function shiftError(message?: string) {
  if (message?.startsWith("OPENING_CASH_MISMATCH|")) {
    const expected = Number(message.split("|")[1] || 0);
    return `رصيد الدرج المسجل في النظام ${expected.toFixed(2)} ج.م. لو العد الفعلي مختلف، لازم مدير الفرع يعمل تسوية واضحة للفرق.`;
  }
  if (message?.startsWith("RECONCILIATION_REASON_REQUIRED|")) {
    const code = message.split("|")[1] || "وسيلة الدفع";
    return `فيه فرق في ${code}. اكتب سبب الفرق قبل إغلاق الوردية.`;
  }
  switch (message) {
    case "DEVICE_UNAVAILABLE": return "جهاز الكاشير غير متاح أو تم إلغاء تسجيله.";
    case "POS_NOT_ALLOWED": return "حسابك غير مسموح له باستخدام نقطة البيع على هذا الفرع.";
    case "DEVICE_SHIFT_BUSY": return "فيه موظف آخر عنده وردية مفتوحة على جهاز الكاشير ده.";
    case "USER_SHIFT_ALREADY_OPEN": return "عندك وردية مفتوحة بالفعل على جهاز كاشير آخر.";
    case "INVALID_OPENING_CASH": return "الرصيد الافتتاحي غير صحيح.";
    case "INVALID_CLOSING_CASH": return "الرصيد الفعلي عند الإغلاق غير صحيح.";
    case "INVALID_RECONCILIATION": return "بيانات تسوية وسائل الدفع غير صحيحة.";
    case "INVALID_RECONCILIATION_AMOUNT": return "راجع المبالغ الفعلية المدخلة لكل وسيلة دفع.";
    case "RECONCILIATION_METHOD_MISMATCH": return "وسائل الدفع تغيرت أثناء شاشة الإغلاق. أعد تحميل ملخص الوردية قبل التأكيد.";
    case "CASH_RECONCILIATION_REQUIRED": return "لازم تدخل العد الفعلي للنقد قبل الإغلاق.";
    case "SHIFT_NOT_OPEN": return "الوردية دي مقفولة أو غير متاحة.";
    case "SHIFT_ACCESS_DENIED": return "مش مسموح لك تقفل الوردية دي.";
    default: return message || "تعذر تحديث وردية الكاشير.";
  }
}

const amount = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("بيانات تسوية الوردية غير مكتملة. أعد التحميل قبل الإغلاق.");
  return parsed;
};

export async function getMyOpenPosShift(device: LocalPosDevice): Promise<PosShift | null> {
  const { data, error } = await rpc("get_my_open_pos_shift", {
    p_device_id: device.device_id,
    p_device_token: device.device_token,
  });
  if (error) throw new Error(shiftError(error.message));
  return data && typeof data === "object" ? data as PosShift : null;
}

export async function openPosShift(device: LocalPosDevice, openingCash: number): Promise<PosShift> {
  const { data, error } = await rpc("open_pos_shift", {
    p_device_id: device.device_id,
    p_device_token: device.device_token,
    p_opening_cash: openingCash,
  });
  if (error || !data || typeof data !== "object") throw new Error(shiftError(error?.message));
  return data as PosShift;
}

/** Legacy close method kept for compatibility with older POS surfaces. New POS uses closePosShiftV2. */
export async function closePosShift(
  device: LocalPosDevice,
  shiftId: string,
  closingCash: number,
  notes?: string,
): Promise<PosShift> {
  const { data, error } = await rpc("close_pos_shift", {
    p_shift_id: shiftId,
    p_device_id: device.device_id,
    p_device_token: device.device_token,
    p_closing_cash: closingCash,
    p_notes: notes?.trim() || null,
  });
  if (error || !data || typeof data !== "object") throw new Error(shiftError(error?.message));
  return data as PosShift;
}

export async function getMyPosShiftReconciliationPreview(device: LocalPosDevice): Promise<PosShiftReconciliationPreview> {
  const { data, error } = await rpc("get_my_pos_shift_reconciliation_preview", {
    p_device_id: device.device_id,
    p_device_token: device.device_token,
  });
  if (error || !data || typeof data !== "object") throw new Error(shiftError(error?.message));
  const raw = data as Record<string, unknown>;
  if (!Array.isArray(raw.methods)) throw new Error("تفاصيل تسوية وسائل الدفع غير متاحة. أعد تحميل الوردية.");
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
        account_balance: row.account_balance === null || row.account_balance === undefined ? null : amount(row.account_balance),
      };
    }),
  };
}

export async function closePosShiftV2(
  device: LocalPosDevice,
  shiftId: string,
  reconciliation: PosShiftReconciliationInput[],
  notes?: string,
): Promise<PosShift> {
  const { data, error } = await rpc("close_pos_shift_v2", {
    p_shift_id: shiftId,
    p_device_id: device.device_id,
    p_device_token: device.device_token,
    p_reconciliation: reconciliation,
    p_notes: notes?.trim() || null,
  });
  if (error || !data || typeof data !== "object") throw new Error(shiftError(error?.message));
  return data as PosShift;
}
