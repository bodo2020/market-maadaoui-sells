import { supabase } from "@/integrations/supabase/client";
import type { LocalPosDevice } from "@/services/supabase/posDeviceService";

export type PosPaymentSummary = {
  code: string;
  name: string;
  method_type: string;
  sale_count: number;
  base_amount: number;
  charged_amount: number;
  fee_amount: number;
  customer_fee_amount: number;
  merchant_fee_amount: number;
};

export type PosCashSummary = {
  drawer_account_id: string;
  drawer_balance: number;
  branch_id: string;
  device_id: string;
  device_name: string;
  shift_id: string | null;
  shift_opened_at: string | null;
  opening_cash: number;
  cash_sales: number;
  cash_refunds: number;
  cash_expenses: number;
  transfers_in: number;
  transfers_out: number;
  adjustments: number;
  sales_count: number;
  sales_total: number;
  card_sales: number;
  cash_paid_total: number;
  amount_charged_total: number;
  loyalty_voucher_total: number;
  customer_payment_fees: number;
  merchant_payment_fees: number;
  electronic_refunds_pending: number;
  electronic_refunds_confirmed: number;
  payment_breakdown: PosPaymentSummary[];
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function cashError(message?: string) {
  switch (message) {
    case "DEVICE_UNAVAILABLE": return "جهاز الكاشير غير متاح أو تم إلغاء تسجيله.";
    case "DRAWER_ACCOUNT_MISSING": return "حساب درج الكاشير غير مجهز. راجع إعدادات الجهاز.";
    case "SHIFT_NOT_OPEN": return "لازم تكون فيه وردية مفتوحة قبل تنفيذ حركة نقدية.";
    case "CASH_DROP_DENIED": return "حسابك غير مسموح له بتوريد النقدية للخزنة.";
    case "INSUFFICIENT_DRAWER_CASH": return "المبلغ أكبر من الرصيد المتوقع في درج الكاشير.";
    case "INVALID_AMOUNT": return "اكتب مبلغ صحيح أكبر من صفر.";
    default: return message || "تعذر تحديث رصيد درج الكاشير.";
  }
}

export async function getPosCashSummary(device: LocalPosDevice): Promise<PosCashSummary> {
  const { data, error } = await rpc("get_my_pos_cash_summary", {
    p_device_id: device.device_id,
    p_device_token: device.device_token,
  });
  if (error || !data || typeof data !== "object") throw new Error(cashError(error?.message));
  const row = data as Record<string, unknown>;
  // Missing or malformed financial data must not be shown as a zero balance.
  const amount = (value: unknown): number => {
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value))) {
      throw new Error("تعذر قراءة تفاصيل تحصيل الوردية. أعد التحديث قبل مراجعة الأرصدة.");
    }
    return Number(value);
  };
  if (!Array.isArray(row.payment_breakdown)) {
    throw new Error("تفاصيل وسائل الدفع غير متاحة. أعد التحديث أو راجع مسؤول النظام.");
  }
  const paymentBreakdown = row.payment_breakdown.map((value): PosPaymentSummary => {
    if (!value || typeof value !== "object") throw new Error("بيانات تحصيل الوردية غير مكتملة.");
    const payment = value as Record<string, unknown>;
    return {
      code: String(payment.code || "other"),
      name: String(payment.name || "وسيلة دفع"),
      method_type: String(payment.method_type || "other"),
      sale_count: amount(payment.sale_count),
      base_amount: amount(payment.base_amount),
      charged_amount: amount(payment.charged_amount),
      fee_amount: amount(payment.fee_amount),
      customer_fee_amount: amount(payment.customer_fee_amount),
      merchant_fee_amount: amount(payment.merchant_fee_amount),
    };
  });
  return {
    drawer_account_id: String(row.drawer_account_id || ""),
    drawer_balance: Number(row.drawer_balance || 0),
    branch_id: String(row.branch_id || ""),
    device_id: String(row.device_id || ""),
    device_name: String(row.device_name || device.device_name),
    shift_id: row.shift_id ? String(row.shift_id) : null,
    shift_opened_at: row.shift_opened_at ? String(row.shift_opened_at) : null,
    opening_cash: Number(row.opening_cash || 0),
    cash_sales: Number(row.cash_sales || 0),
    cash_refunds: Number(row.cash_refunds || 0),
    cash_expenses: Number(row.cash_expenses || 0),
    transfers_in: Number(row.transfers_in || 0),
    transfers_out: Number(row.transfers_out || 0),
    adjustments: Number(row.adjustments || 0),
    sales_count: Number(row.sales_count || 0),
    sales_total: Number(row.sales_total || 0),
    card_sales: Number(row.card_sales || 0),
    cash_paid_total: Number(row.cash_paid_total || 0),
    amount_charged_total: amount(row.amount_charged_total),
    loyalty_voucher_total: amount(row.loyalty_voucher_total),
    customer_payment_fees: amount(row.customer_payment_fees),
    merchant_payment_fees: amount(row.merchant_payment_fees),
    electronic_refunds_pending: amount(row.electronic_refunds_pending),
    electronic_refunds_confirmed: amount(row.electronic_refunds_confirmed),
    payment_breakdown: paymentBreakdown,
  };
}

export async function cashDropToSafe(device: LocalPosDevice, amount: number, note?: string) {
  const { data, error } = await rpc("cash_drop_to_safe", {
    p_device_id: device.device_id,
    p_device_token: device.device_token,
    p_amount: amount,
    p_note: note?.trim() || null,
  });
  if (error || !data || typeof data !== "object") throw new Error(cashError(error?.message));
  return data as { transfer_id: string; amount: number; drawer_balance: number };
}
