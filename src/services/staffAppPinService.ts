import { supabase } from "@/integrations/supabase/client";

export type StaffAppPinStatus = {
  configured: boolean;
  locked: boolean;
  locked_until?: string | null;
  failed_attempts: number;
  last_verified_at?: string | null;
  updated_at?: string | null;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

function pinError(message?: string) {
  const value = message || "";
  if (value.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.");
  if (value.includes("STAFF_ACCOUNT_INACTIVE")) return new Error("حساب الموظف غير نشط.");
  if (value.includes("INVALID_APP_PIN")) return new Error("PIN يجب أن يكون من 4 إلى 6 أرقام.");
  if (value.includes("APP_PIN_ALREADY_CONFIGURED")) return new Error("تم إنشاء PIN لهذا الحساب بالفعل.");
  if (value.includes("APP_PIN_NOT_CONFIGURED")) return new Error("لم يتم إنشاء PIN لهذا الحساب بعد.");
  if (value.includes("APP_PIN_LOCKED")) return new Error("تم قفل PIN مؤقتًا بسبب محاولات خاطئة متكررة.");
  if (value.includes("CURRENT_APP_PIN_INVALID")) return new Error("PIN الحالي غير صحيح.");
  if (value.includes("APP_PIN_RESET_DENIED")) return new Error("ليس لديك صلاحية إعادة تعيين PIN لهذا الموظف.");
  return new Error(message || "تعذر تنفيذ عملية PIN.");
}

export async function getMyStaffAppPinStatus(): Promise<StaffAppPinStatus> {
  const { data, error } = await rpc("get_my_staff_app_pin_status_v1");
  if (error) throw pinError(error.message);
  return data as StaffAppPinStatus;
}

export async function setMyStaffAppPin(pin: string) {
  const { data, error } = await rpc("set_my_staff_app_pin_v1", { p_pin: pin });
  if (error) throw pinError(error.message);
  return data as { ok: boolean; configured: boolean };
}

export async function verifyMyStaffAppPin(pin: string) {
  const { data, error } = await rpc("verify_my_staff_app_pin_v1", { p_pin: pin });
  if (error) throw pinError(error.message);
  return data as {
    ok: boolean;
    error?: "INVALID_APP_PIN" | "APP_PIN_LOCKED" | "APP_PIN_NOT_CONFIGURED";
    remaining_attempts?: number;
    locked_until?: string | null;
    verified_at?: string;
  };
}

export async function changeMyStaffAppPin(currentPin: string, newPin: string) {
  const { data, error } = await rpc("change_my_staff_app_pin_v1", {
    p_current_pin: currentPin,
    p_new_pin: newPin,
  });
  if (error) throw pinError(error.message);
  return data as { ok: boolean; changed: boolean };
}

export async function resetStaffAppPin(userId: string, branchId?: string | null) {
  const { data, error } = await rpc("reset_staff_app_pin_v1", {
    p_user_id: userId,
    p_branch_id: branchId || null,
  });
  if (error) throw pinError(error.message);
  return data as { ok: boolean; user_id: string; configured: boolean };
}
