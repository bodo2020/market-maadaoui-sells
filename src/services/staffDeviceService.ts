import { supabase } from "@/integrations/supabase/client";

export type StaffDeviceType = "personal" | "shared" | "remote";
export type StaffDeviceApprovalStatus = "pending" | "approved" | "rejected";

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
  trusted_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  approval_status: StaffDeviceApprovalStatus;
  requested_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
};

export type StaffDeviceApprovalItem = {
  device_id: string;
  user_id: string;
  employee_name: string;
  username: string | null;
  branch_id: string | null;
  branch_name: string | null;
  device_name: string;
  device_type: StaffDeviceType;
  platform: string | null;
  metadata: Record<string, unknown>;
  requested_at: string;
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
  approval_status?: StaffDeviceApprovalStatus;
  device_id?: string;
  device_token?: string;
  device_key?: string;
  device_name?: string;
  device_type?: StaffDeviceType;
  employee_id?: string;
  employee_name?: string;
  branch_id?: string | null;
  branch_name?: string | null;
  trusted_at?: string | null;
  requested_at?: string;
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

export async function listPendingStaffDeviceApprovals(limit = 100): Promise<StaffDeviceApprovalItem[]> {
  const { data, error } = await rpc("list_pending_staff_device_approvals_v1", { p_limit: limit });
  if (error) throw new Error(error.message || "تعذر تحميل طلبات اعتماد الأجهزة");
  return (Array.isArray(data) ? data : []) as StaffDeviceApprovalItem[];
}

export async function approveStaffDevice(deviceId: string): Promise<void> {
  const { error } = await rpc("approve_staff_device_v1", { p_device_id: deviceId });
  if (error) throw new Error(error.message || "تعذر اعتماد الجهاز");
}

export async function rejectStaffDevice(deviceId: string, reason: string): Promise<void> {
  const { error } = await rpc("reject_staff_device_v1", { p_device_id: deviceId, p_reason: reason });
  if (error) throw new Error(error.message || "تعذر رفض الجهاز");
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
  if (error) throw new Error(error.message || "تعذر تسجيل الجهاز");
  return data as RedeemedStaffDevice;
}

export async function quickTrustMyStaffDevice(params: {
  branchId?: string | null;
  deviceKey: string;
  deviceName: string;
  platform?: string | null;
  deviceType?: StaffDeviceType;
  metadata?: Record<string, unknown>;
}): Promise<RedeemedStaffDevice> {
  const { data, error } = await rpc("quick_trust_my_staff_device_v1", {
    p_branch_id: params.branchId || null,
    p_device_key: params.deviceKey,
    p_device_name: params.deviceName,
    p_platform: params.platform || null,
    p_device_type: params.deviceType || "personal",
    p_metadata: params.metadata || {},
  });
  if (error) {
    const message = error.message || "تعذر اعتماد الجهاز الحالي";
    if (message.includes("SUPER_ADMIN_REQUIRED")) throw new Error("الاعتماد المباشر متاح للسوبر أدمن فقط.");
    throw new Error(message);
  }
  return data as RedeemedStaffDevice;
}

export async function validateMyStaffDevice(deviceId: string, deviceToken: string) {
  const { data, error } = await rpc("validate_my_staff_device_v1", {
    p_device_id: deviceId,
    p_device_token: deviceToken,
  });
  if (error) throw new Error(error.message || "تعذر التحقق من الجهاز");
  return data as { trusted: boolean; code?: string; reason?: string; [key: string]: unknown };
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
    trusted_at: device.trusted_at || null,
    approval_status: device.approval_status || "pending",
    requested_at: device.requested_at || new Date().toISOString(),
  }));
}

export function getLocalTrustedStaffDevice(): {
  device_id: string;
  device_token: string;
  employee_id: string;
  branch_id: string | null;
  device_name: string;
  device_type: StaffDeviceType;
  trusted_at: string | null;
  approval_status?: StaffDeviceApprovalStatus;
  requested_at?: string;
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
