import { supabase } from "@/integrations/supabase/client";
import { getLocalTrustedStaffDevice, getOrCreateStaffDeviceKey } from "@/services/staffDeviceService";

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export type ITCapabilities = {
  secureContext: boolean;
  online: boolean;
  android: boolean;
  standalone: boolean;
  bluetooth: boolean;
  usb: boolean;
  serial: boolean;
  hid: boolean;
  camera: boolean;
  barcodeDetector: boolean;
  wakeLock: boolean;
};

export type ITSession = {
  session_id: string;
  user_id: string;
  employee_name: string | null;
  username: string | null;
  branch_id: string | null;
  branch_name: string | null;
  staff_device_id: string | null;
  device_key: string | null;
  device_name: string | null;
  platform: string | null;
  browser: string | null;
  app_version: string | null;
  current_route: string | null;
  visibility_state: string | null;
  capabilities: ITCapabilities | Record<string, unknown> | null;
  created_at: string;
  refreshed_at: string | null;
  last_seen_at: string | null;
  user_agent: string | null;
  trusted: boolean;
  blocked: boolean;
  online: boolean;
};

export type ITTrustedDevice = {
  id: string;
  user_id: string;
  employee_name: string | null;
  username: string | null;
  branch_id: string | null;
  branch_name: string | null;
  device_key: string;
  device_name: string;
  device_type: string;
  platform: string | null;
  metadata: Record<string, unknown> | null;
  active: boolean;
  trusted_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  approval_status: "pending" | "approved" | "rejected" | string;
  requested_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  online: boolean;
};

export type ITPOSDevice = {
  id: string;
  branch_id: string;
  branch_name: string | null;
  device_code: string;
  name: string;
  active: boolean;
  registered_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  auto_lock_minutes: number | null;
  cash_warning_threshold: number | null;
  online: boolean;
};

export type ITPeripheralType = "printer" | "barcode_scanner" | "scale" | "cash_drawer" | "customer_display" | "other";
export type ITConnectionType = "bluetooth" | "usb" | "serial" | "hid_keyboard" | "camera" | "system_print" | "network" | "manual" | "other";

export type ITPeripheral = {
  id: string;
  branch_id: string;
  branch_name: string | null;
  staff_device_id: string | null;
  device_key: string | null;
  peripheral_type: ITPeripheralType;
  name: string;
  connection_type: ITConnectionType;
  vendor_id: number | null;
  product_id: number | null;
  serial_number: string | null;
  config: Record<string, unknown>;
  active: boolean;
  last_seen_at: string | null;
  last_test_at: string | null;
  last_test_status: "success" | "warning" | "failed" | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type ITDeviceCenter = {
  trusted_devices: ITTrustedDevice[];
  pos_devices: ITPOSDevice[];
  sessions: ITSession[];
  peripherals: ITPeripheral[];
  generated_at: string;
  scope_branch_id: string | null;
  is_super_admin: boolean;
};

export type ITHeartbeatResult = {
  ok: boolean;
  session_id: string | null;
  blocked: boolean;
  block_reason?: string | null;
  staff_device_id?: string | null;
  trusted?: boolean;
  branch_id?: string | null;
  last_seen_at?: string;
};

function cleanUA() {
  return typeof navigator === "undefined" ? "" : navigator.userAgent || "";
}

export function detectPlatform(): string {
  const ua = cleanUA();
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS/iPadOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return typeof navigator !== "undefined" ? (navigator.platform || "Web") : "Web";
}

export function detectBrowser(): string {
  const ua = cleanUA();
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua) || /FxiOS\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua)) return "Safari";
  return "متصفح";
}

export function getITCapabilities(): ITCapabilities {
  const nav = typeof navigator === "undefined" ? ({} as any) : (navigator as any);
  const win = typeof window === "undefined" ? ({} as any) : (window as any);
  return {
    secureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    android: /Android/i.test(cleanUA()),
    standalone: Boolean(
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)")?.matches || nav.standalone),
    ),
    bluetooth: Boolean(nav.bluetooth),
    usb: Boolean(nav.usb),
    serial: Boolean(nav.serial),
    hid: Boolean(nav.hid),
    camera: Boolean(nav.mediaDevices?.getUserMedia),
    barcodeDetector: Boolean(win.BarcodeDetector),
    wakeLock: Boolean(nav.wakeLock),
  };
}

export function getCurrentDeviceDisplayName(): string {
  const trusted = typeof window !== "undefined" ? getLocalTrustedStaffDevice() : null;
  if (trusted?.device_name) return trusted.device_name;
  const platform = detectPlatform();
  const browser = detectBrowser();
  return `${platform} • ${browser}`;
}

export async function heartbeatITDevice(route?: string | null, branchId?: string | null): Promise<ITHeartbeatResult> {
  if (typeof window === "undefined") return { ok: false, session_id: null, blocked: false };
  const trusted = getLocalTrustedStaffDevice();
  const { data, error } = await rpc("heartbeat_it_device_v1", {
    p_branch_id: branchId || null,
    p_staff_device_id: trusted?.device_id || null,
    p_device_key: getOrCreateStaffDeviceKey(),
    p_device_name: getCurrentDeviceDisplayName(),
    p_platform: detectPlatform(),
    p_browser: detectBrowser(),
    p_app_version: import.meta.env.VITE_APP_VERSION || "web",
    p_current_route: route || window.location.pathname,
    p_visibility_state: document.visibilityState || null,
    p_capabilities: getITCapabilities(),
  });
  if (error) throw new Error(error.message || "تعذر تحديث حالة الجهاز");
  return data as ITHeartbeatResult;
}

export async function checkMyITSession(): Promise<{ blocked: boolean; reason?: string | null; session_id?: string | null }> {
  const { data, error } = await rpc("check_my_it_session_v1");
  if (error) throw new Error(error.message || "تعذر التحقق من حالة الجلسة");
  return (data || { blocked: false }) as { blocked: boolean; reason?: string | null; session_id?: string | null };
}

export async function fetchITDeviceCenter(branchId?: string | null): Promise<ITDeviceCenter> {
  const { data, error } = await rpc("get_it_device_center_v1", { p_branch_id: branchId || null });
  if (error) throw new Error(error.message || "تعذر تحميل مركز الأجهزة");
  const raw = (data || {}) as Partial<ITDeviceCenter>;
  return {
    trusted_devices: Array.isArray(raw.trusted_devices) ? raw.trusted_devices : [],
    pos_devices: Array.isArray(raw.pos_devices) ? raw.pos_devices : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    peripherals: Array.isArray(raw.peripherals) ? raw.peripherals : [],
    generated_at: raw.generated_at || new Date().toISOString(),
    scope_branch_id: raw.scope_branch_id || null,
    is_super_admin: Boolean(raw.is_super_admin),
  };
}

export async function endITSession(sessionId: string, branchId?: string | null, reason?: string): Promise<void> {
  const { error } = await rpc("end_it_session_v1", {
    p_session_id: sessionId,
    p_branch_id: branchId || null,
    p_reason: reason?.trim() || null,
  });
  if (error) throw new Error(error.message || "تعذر إنهاء الجلسة");
}

export async function unblockITSession(sessionId: string, branchId?: string | null): Promise<void> {
  const { error } = await rpc("unblock_it_session_v1", {
    p_session_id: sessionId,
    p_branch_id: branchId || null,
  });
  if (error) throw new Error(error.message || "تعذر إعادة السماح للجلسة");
}

export async function upsertITPeripheral(input: {
  id?: string | null;
  branchId: string;
  staffDeviceId?: string | null;
  deviceKey?: string | null;
  type: ITPeripheralType;
  name: string;
  connectionType: ITConnectionType;
  vendorId?: number | null;
  productId?: number | null;
  serialNumber?: string | null;
  config?: Record<string, unknown>;
}): Promise<ITPeripheral> {
  const { data, error } = await rpc("upsert_it_peripheral_v1", {
    p_id: input.id || null,
    p_branch_id: input.branchId,
    p_staff_device_id: input.staffDeviceId || null,
    p_device_key: input.deviceKey || getOrCreateStaffDeviceKey(),
    p_peripheral_type: input.type,
    p_name: input.name.trim(),
    p_connection_type: input.connectionType,
    p_vendor_id: input.vendorId ?? null,
    p_product_id: input.productId ?? null,
    p_serial_number: input.serialNumber?.trim() || null,
    p_config: input.config || {},
  });
  if (error) throw new Error(error.message || "تعذر حفظ الجهاز الطرفي");
  return data as ITPeripheral;
}

export async function setITPeripheralActive(id: string, branchId: string, active: boolean): Promise<void> {
  const { error } = await rpc("set_it_peripheral_active_v1", {
    p_id: id,
    p_branch_id: branchId,
    p_active: active,
  });
  if (error) throw new Error(error.message || "تعذر تحديث حالة الجهاز الطرفي");
}

export async function recordITPeripheralTest(id: string, branchId: string, status: "success" | "warning" | "failed", errorMessage?: string | null): Promise<void> {
  const { error } = await rpc("record_it_peripheral_test_v1", {
    p_id: id,
    p_branch_id: branchId,
    p_status: status,
    p_error: errorMessage?.trim() || null,
  });
  if (error) throw new Error(error.message || "تعذر تسجيل نتيجة اختبار الجهاز");
}

export async function requestUSBDevice(): Promise<{ name: string; vendorId: number | null; productId: number | null; serialNumber: string | null }> {
  const usb = (navigator as any).usb;
  if (!usb?.requestDevice) throw new Error("USB_NOT_SUPPORTED");
  const device = await usb.requestDevice({ filters: [] });
  return {
    name: device.productName || device.manufacturerName || "جهاز USB",
    vendorId: Number.isFinite(device.vendorId) ? device.vendorId : null,
    productId: Number.isFinite(device.productId) ? device.productId : null,
    serialNumber: device.serialNumber || null,
  };
}

export async function requestSerialPort(): Promise<{ name: string; info: Record<string, unknown> }> {
  const serial = (navigator as any).serial;
  if (!serial?.requestPort) throw new Error("SERIAL_NOT_SUPPORTED");
  const port = await serial.requestPort();
  const info = typeof port.getInfo === "function" ? port.getInfo() : {};
  return { name: "ميزان / جهاز Serial", info: info || {} };
}
