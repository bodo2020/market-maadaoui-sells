import { supabase } from "@/integrations/supabase/client";

export type PosDevice = {
  device_id: string;
  device_code: string;
  device_name: string;
  active: boolean;
  registered_at: string;
  last_seen_at: string | null;
  auto_lock_minutes: number;
  cash_warning_threshold: number | null;
};

export type LocalPosDevice = {
  device_id: string;
  device_code: string;
  device_name: string;
  branch_id: string;
  device_token: string;
  registered_at: string;
};

export type PosQuickStaff = {
  user_id: string;
  name: string;
  role_name_ar: string;
};

export type BranchPosStaffStatus = {
  user_id: string;
  name: string;
  username: string;
  role_code: string;
  role_name_ar: string;
  active: boolean;
  pos_enabled: boolean;
  has_pin: boolean;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

const storageKey = (branchId: string) => `posDevice:${branchId}`;

export function getLocalPosDevice(branchId: string): LocalPosDevice | null {
  try {
    const raw = localStorage.getItem(storageKey(branchId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalPosDevice;
    return parsed?.branch_id === branchId && parsed?.device_id && parsed?.device_token ? parsed : null;
  } catch {
    return null;
  }
}

export function getLocalPosDevices(): LocalPosDevice[] {
  const devices: LocalPosDevice[] = [];
  const seen = new Set<string>();
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("posDevice:")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as LocalPosDevice;
      if (!parsed?.device_id || !parsed?.device_token || !parsed?.branch_id || seen.has(parsed.device_id)) continue;
      seen.add(parsed.device_id);
      devices.push(parsed);
    }
  } catch {
    return [];
  }
  return devices.sort((a, b) => (b.registered_at || "").localeCompare(a.registered_at || ""));
}

export function getAnyLocalPosDevice(): LocalPosDevice | null {
  return getLocalPosDevices()[0] || null;
}

export function clearLocalPosDevice(branchId: string) {
  localStorage.removeItem(storageKey(branchId));
}

export async function listPosDevices(branchId: string): Promise<PosDevice[]> {
  const { data, error } = await rpc("list_pos_devices", { p_branch_id: branchId });
  if (error) throw new Error(error.message || "تعذر تحميل أجهزة نقطة البيع");
  return (Array.isArray(data) ? data : []) as PosDevice[];
}

export async function updatePosDeviceRuntimeSettings(
  deviceId: string,
  autoLockMinutes: number,
  cashWarningThreshold: number | null,
): Promise<void> {
  const { error } = await rpc("update_pos_device_runtime_settings", {
    p_device_id: deviceId,
    p_auto_lock_minutes: autoLockMinutes,
    p_cash_warning_threshold: cashWarningThreshold,
  });
  if (error) {
    if (error.message === "INVALID_AUTO_LOCK_MINUTES") throw new Error("مدة القفل التلقائي لازم تكون من 1 إلى 120 دقيقة.");
    if (error.message === "INVALID_CASH_WARNING_THRESHOLD") throw new Error("حد تنبيه النقدية غير صحيح.");
    throw new Error(error.message || "تعذر حفظ إعدادات جهاز الكاشير");
  }
}

export async function registerThisPosDevice(branchId: string, name: string): Promise<LocalPosDevice> {
  const { data, error } = await rpc("register_pos_device", {
    p_branch_id: branchId,
    p_name: name.trim(),
  });
  if (error || !data || typeof data !== "object") {
    throw new Error(error?.message || "تعذر تسجيل الجهاز");
  }

  const registered = data as LocalPosDevice;
  if (!registered.device_id || !registered.device_token || registered.branch_id !== branchId) {
    throw new Error("استجابة تسجيل الجهاز غير صالحة");
  }

  localStorage.setItem(storageKey(branchId), JSON.stringify(registered));
  return registered;
}

export async function revokePosDevice(deviceId: string, branchId: string): Promise<void> {
  const { error } = await rpc("revoke_pos_device", { p_device_id: deviceId });
  if (error) throw new Error(error.message || "تعذر إلغاء الجهاز");
  const local = getLocalPosDevice(branchId);
  if (local?.device_id === deviceId) clearLocalPosDevice(branchId);
}

export async function hasMyPosPin(branchId: string): Promise<boolean> {
  const { data, error } = await rpc("has_my_pos_pin", { p_branch_id: branchId });
  if (error) throw new Error(error.message || "تعذر قراءة حالة PIN");
  return data === true;
}

export async function setMyPosPin(branchId: string, pin: string): Promise<void> {
  const { error } = await rpc("set_my_pos_pin", {
    p_branch_id: branchId,
    p_pin: pin,
  });
  if (error) throw new Error(error.message || "تعذر حفظ PIN");
}

export async function getBranchPosStaffStatus(branchId: string): Promise<BranchPosStaffStatus[]> {
  const { data, error } = await rpc("get_branch_pos_staff_status", { p_branch_id: branchId });
  if (error) throw new Error(error.message || "تعذر تحميل حالة موظفي نقطة البيع");
  return (Array.isArray(data) ? data : []) as BranchPosStaffStatus[];
}

export async function setStaffPosAccess(userId: string, branchId: string, enabled: boolean): Promise<void> {
  const { error } = await rpc("set_staff_pos_access", {
    p_user_id: userId,
    p_branch_id: branchId,
    p_enabled: enabled,
  });
  if (error) {
    const message = error.message === "ROLE_NOT_ALLOWED_POS"
      ? "الدور الحالي للموظف غير مسموح له باستخدام نقطة البيع"
      : error.message || "تعذر تحديث صلاحية نقطة البيع";
    throw new Error(message);
  }
}

export async function setStaffPosPin(userId: string, branchId: string, pin: string): Promise<void> {
  const { error } = await rpc("set_staff_pos_pin", {
    p_user_id: userId,
    p_branch_id: branchId,
    p_pin: pin,
  });
  if (error) throw new Error(error.message || "تعذر تعيين PIN للموظف");
}

export async function resetStaffPosPin(userId: string, branchId: string): Promise<void> {
  const { error } = await rpc("reset_staff_pos_pin", {
    p_user_id: userId,
    p_branch_id: branchId,
  });
  if (error) throw new Error(error.message || "تعذر إعادة ضبط PIN");
}

async function functionError(error: any): Promise<{ code?: string; message?: string; remainingAttempts?: number; lockedUntil?: string }> {
  try {
    if (error?.context && typeof error.context.json === "function") {
      const payload = await error.context.json();
      return {
        code: typeof payload?.error === "string" ? payload.error : undefined,
        message: typeof payload?.message === "string" ? payload.message : undefined,
        remainingAttempts: typeof payload?.remaining_attempts === "number" ? payload.remaining_attempts : undefined,
        lockedUntil: typeof payload?.locked_until === "string" ? payload.locked_until : undefined,
      };
    }
  } catch {
    // Use generic fallback below.
  }
  return {};
}

export async function fetchPosQuickStaff(device: LocalPosDevice): Promise<PosQuickStaff[]> {
  const { data, error } = await supabase.functions.invoke("pos-quick-login", {
    body: {
      action: "staff_list",
      deviceId: device.device_id,
      deviceToken: device.device_token,
    },
  });
  if (error) throw new Error("تعذر التحقق من جهاز الكاشير");
  return (Array.isArray(data?.staff) ? data.staff : []) as PosQuickStaff[];
}

export async function createPosQuickSession(device: LocalPosDevice, userId: string, pin: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("pos-quick-login", {
    body: {
      action: "login",
      deviceId: device.device_id,
      deviceToken: device.device_token,
      userId,
      pin,
    },
  });

  if (error || !data?.session?.access_token || !data?.session?.refresh_token) {
    const details = await functionError(error);
    if (details.code === "PIN_LOCKED") throw new Error("تم إيقاف PIN مؤقتًا بعد محاولات غير صحيحة. حاول بعد 10 دقائق.");
    if (details.code === "INVALID_PIN" || details.code === "AUTH_FAILED") {
      const suffix = typeof details.remainingAttempts === "number" ? ` — متبقي ${details.remainingAttempts} محاولات` : "";
      throw new Error(`PIN غير صحيح${suffix}`);
    }
    if (details.code === "PIN_NOT_CONFIGURED") throw new Error("PIN غير مفعّل لهذا الموظف");
    if (details.code === "POS_NOT_ALLOWED") throw new Error("الموظف غير مسموح له باستخدام نقطة البيع");
    if (details.code === "AUTH_PROVISION_FAILED") throw new Error("تم قبول PIN لكن تعذر تجهيز حساب الموظف. حاول مرة أخرى.");
    if (details.code === "AUTH_ACCOUNT_INVALID") throw new Error("حساب الموظف يحتاج إعادة تهيئة من الإدارة.");
    if (details.code === "SESSION_LINK_FAILED" || details.code === "SESSION_EXCHANGE_FAILED") {
      throw new Error("تم قبول PIN لكن تعذر بدء جلسة الكاشير. حاول مرة أخرى.");
    }
    throw new Error("تعذر تسجيل الدخول السريع. حاول مرة أخرى أو استخدم دخول المدير.");
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (sessionError) throw new Error("تعذر بدء جلسة الموظف");
}
