import { supabase } from "@/integrations/supabase/client";
import type { LocalPosDevice } from "@/services/supabase/posDeviceService";

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
  switch (message) {
    case "DEVICE_UNAVAILABLE": return "جهاز الكاشير غير متاح أو تم إلغاء تسجيله.";
    case "POS_NOT_ALLOWED": return "حسابك غير مسموح له باستخدام نقطة البيع على هذا الفرع.";
    case "DEVICE_SHIFT_BUSY": return "فيه موظف آخر عنده وردية مفتوحة على جهاز الكاشير ده.";
    case "USER_SHIFT_ALREADY_OPEN": return "عندك وردية مفتوحة بالفعل على جهاز كاشير آخر.";
    case "INVALID_OPENING_CASH": return "الرصيد الافتتاحي غير صحيح.";
    case "INVALID_CLOSING_CASH": return "الرصيد الفعلي عند الإغلاق غير صحيح.";
    case "SHIFT_NOT_OPEN": return "الوردية دي مقفولة أو غير متاحة.";
    case "SHIFT_ACCESS_DENIED": return "مش مسموح لك تقفل الوردية دي.";
    default: return message || "تعذر تحديث وردية الكاشير.";
  }
}

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
