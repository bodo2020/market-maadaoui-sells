import { supabase } from "@/integrations/supabase/client";

export type StaffDeviceType = "personal" | "shared" | "remote";

export type StaffDevice = {
  id: string;
  user_id: string;
  branch_id: string | null;
  branch_name: string | null;
  device_key: string;
  device_name: string;
  device_type: StaffDeviceType;
  platform: string | null;
  metadata: Record<string, unknown>;
  active: boolean;
  trusted_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
};

export type StaffDevicePairing = {
  pairing_id: string;
  employee_id: string;
  employee_name: string;
  branch_id: string | null;
  device_type: StaffDeviceType;
  pairing_token: string;
  pairing_code: string;
  expires_at: string;
};

export type RedeemedStaffDevice = {
  ok: boolean;
  code?: string;
  device_id?: string;
  device_token?: string;
  device_key?: string;
  device_name?: string;
  device_type?: StaffDeviceType;
  employee_id?: string;
  employee_name?: string;
  branch_id?: string | null;
  branch_name?: string | null;
  trusted_at?: string;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export async function createStaffDevicePairing(params: {
  employeeId: string;
  branchId?: string | null;
  deviceType?: StaffDeviceType;
  expiresMinutes?: number;
}): Promise<StaffDevicePairing> {
  const { data, error } = await rpc("create_staff_device_pairing_v1", {
    p_employee_id: params.employeeId,
    p_branch_id: params.branchId || null,
    p_device_type: params.deviceType || "personal",
    p_expires_minutes: params.expiresMinutes ?? 10,
  });
  if (error) throw new Error(error.message || "تعذر إنشاء كود ربط الجهاز");
  return data as StaffDevicePairing;
}

export async function getEmployeeStaffDevices(employeeId: string, branchId?: string | null): Promise<StaffDevice[]> {
  const { data, error } = await rpc("get_employee_staff_devices_v1", {
    p_employee_id: employeeId,
    p_branch_id: branchId || null,
  });
  if (error) throw new Error(error.message || "تعذر تحميل أجهزة الموظف");
  return (Array.isArray(data) ? data : []) as StaffDevice[];
}

export async function revokeStaffDevice(deviceId: string, reason?: string): Promise<void> {
  const { error } = await rpc("revoke_staff_device_v1", {
    p_device_id: deviceId,
    p_reason: reason || null,
  });
  if (error) throw new Error(error.message || "تعذر إلغاء الثقة بالجهاز");
}

export async function redeemStaffDevicePairing(params: {
  pairingToken: string;
  pairingCode: string;
  deviceKey: string;
  deviceName: string;
  platform?: string | null;
  deviceType?: StaffDeviceType | null;
  metadata?: Record<string, unknown>;
}): Promise<RedeemedStaffDevice> {
  const { data, error } = await rpc("redeem_staff_device_pairing_v1", {
    p_pairing_token: params.pairingToken,
    p_pairing_code: params.pairingCode,
    p_device_key: params.deviceKey,
    p_device_name: params.deviceName,
    p_platform: params.platform || null,
    p_device_type: params.deviceType || null,
    p_metadata: params.metadata || {},
  });
  if (error) throw new Error(error.message || "تعذر تفعيل الجهاز");
  return data as RedeemedStaffDevice;
}

export async function validateMyStaffDevice(deviceId: string, deviceToken: string) {
  const { data, error } = await rpc("validate_my_staff_device_v1", {
    p_device_id: deviceId,
    p_device_token: deviceToken,
  });
  if (error) throw new Error(error.message || "تعذر التحقق من الجهاز");
  return data as { trusted: boolean; code?: string; [key: string]: unknown };
}

const DEVICE_KEY_STORAGE = "staffDeviceKey:v1";
const TRUSTED_DEVICE_STORAGE = "staffTrustedDevice:v1";

export function getOrCreateStaffDeviceKey(): string {
  let key = localStorage.getItem(DEVICE_KEY_STORAGE);
  if (key) return key;
  key = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(DEVICE_KEY_STORAGE, key);
  return key;
}

export function saveTrustedStaffDevice(device: RedeemedStaffDevice): void {
  if (!device.ok || !device.device_id || !device.device_token || !device.employee_id) return;
  localStorage.setItem(TRUSTED_DEVICE_STORAGE, JSON.stringify({
    device_id: device.device_id,
    device_token: device.device_token,
    employee_id: device.employee_id,
    branch_id: device.branch_id || null,
    device_name: device.device_name || "جهاز موظف",
    device_type: device.device_type || "personal",
    trusted_at: device.trusted_at || new Date().toISOString(),
  }));
}

export function getLocalTrustedStaffDevice(): {
  device_id: string;
  device_token: string;
  employee_id: string;
  branch_id: string | null;
  device_name: string;
  device_type: StaffDeviceType;
  trusted_at: string;
} | null {
  try {
    const raw = localStorage.getItem(TRUSTED_DEVICE_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearLocalTrustedStaffDevice(): void {
  localStorage.removeItem(TRUSTED_DEVICE_STORAGE);
}
