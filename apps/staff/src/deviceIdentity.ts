import { Capacitor, registerPlugin } from "@capacitor/core";

type StaffDeviceIdentityPlugin = {
  getAndroidId(): Promise<{ androidId: string; model?: string; manufacturer?: string }>;
};

const nativeDeviceIdentity = registerPlugin<StaffDeviceIdentityPlugin>("StaffDeviceIdentity");

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getPersistentStaffDeviceIdentity() {
  if (Capacitor.getPlatform() === "android") {
    const result = await nativeDeviceIdentity.getAndroidId();
    const androidId = result.androidId?.trim();
    if (!androidId) throw new Error("ANDROID_DEVICE_ID_UNAVAILABLE");
    const fingerprint = await sha256(`elmadawy-staff-v2|${androidId}|com.elmadawy.staff`);
    return {
      deviceKey: `android:${fingerprint}`,
      deviceName: [result.manufacturer, result.model].filter(Boolean).join(" ") || "هاتف الموظف",
      platform: "android",
      metadata: {
        identity_version: 2,
        source: "android_secure_id",
        manufacturer: result.manufacturer || null,
        model: result.model || null,
      },
    };
  }

  const storageKey = "elmadawy_staff_device_key";
  let deviceKey = localStorage.getItem(storageKey);
  if (!deviceKey) {
    deviceKey = `web:${crypto.randomUUID()}`;
    localStorage.setItem(storageKey, deviceKey);
  }
  return {
    deviceKey,
    deviceName: "متصفح الموظف",
    platform: "web",
    metadata: { identity_version: 2, source: "browser_local_storage" },
  };
}
