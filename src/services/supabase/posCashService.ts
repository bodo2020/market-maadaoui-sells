import { supabase } from "@/integrations/supabase/client";
import type { LocalPosDevice } from "@/services/supabase/posDeviceService";

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
