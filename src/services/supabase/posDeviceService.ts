import { supabase } from "@/integrations/supabase/client";

export type PosDevice = {
  device_id: string;
  device_code: string;
  device_name: string;
  active: boolean;
  registered_at: string;
  last_seen_at: string | null;
};

export type LocalPosDevice = {
  device_id: string;
  device_code: string;
  device_name: string;
  branch_id: string;
  device_token: string;
  registered_at: string;
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

export function clearLocalPosDevice(branchId: string) {
  localStorage.removeItem(storageKey(branchId));
}

export async function listPosDevices(branchId: string): Promise<PosDevice[]> {
  const { data, error } = await rpc("list_pos_devices", { p_branch_id: branchId });
  if (error) throw new Error(error.message || "تعذر تحميل أجهزة نقطة البيع");
  return (Array.isArray(data) ? data : []) as PosDevice[];
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
