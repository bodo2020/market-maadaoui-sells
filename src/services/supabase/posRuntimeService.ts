import { supabase } from "@/integrations/supabase/client";
import type { LocalPosDevice } from "@/services/supabase/posDeviceService";

export type PosRuntimeStatus = {
  ready: boolean;
  code: string;
  branch_id?: string;
  device_id?: string;
  device_name?: string;
  shift_id?: string;
  opened_at?: string;
  drawer_balance?: number;
  auto_lock_minutes?: number;
  cash_warning_threshold?: number | null;
  checked_at?: string;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

function runtimeError(message?: string) {
  switch (message) {
    case "DEVICE_UNAVAILABLE": return "جهاز الكاشير غير متاح أو تم إلغاء تسجيله.";
    case "POS_NOT_ALLOWED": return "حسابك لم يعد مسموحًا له باستخدام POS على الفرع الحالي.";
    case "AUTH_REQUIRED": return "جلسة الموظف انتهت. سجّل الدخول مرة أخرى.";
    default: return message || "تعذر التحقق من حالة الكاشير.";
  }
}

export async function getPosRuntimeStatus(device: LocalPosDevice): Promise<PosRuntimeStatus> {
  const { data, error } = await rpc("get_pos_runtime_status", {
    p_device_id: device.device_id,
    p_device_token: device.device_token,
  });
  if (error) throw new Error(runtimeError(error.message));
  if (!data || typeof data !== "object") throw new Error("تعذر قراءة حالة الكاشير.");
  return data as PosRuntimeStatus;
}
