import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { Channel } from "@capacitor/push-notifications";
import { getPersistentStaffDeviceIdentity } from "./deviceIdentity";
import * as staff from "./services/staffService";

const PUSH_TOKEN_KEY = "elmadawy_staff_push_token";
const PUSH_LAST_ERROR_KEY = "elmadawy_staff_push_last_error";

type ListenerHandle = { remove: () => Promise<void> };

type PushHandlers = {
  onOpen?: (path: string) => void;
  onReceived?: () => void;
  onStatus?: (status: "registered" | "denied" | "prompt" | "error", detail?: string) => void;
};

export function isStaffPushSupported() {
  return Capacitor.getPlatform() === "android";
}

export function getStoredStaffPushToken() {
  return localStorage.getItem(PUSH_TOKEN_KEY);
}

function safeStaffPath(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw.startsWith("/")) return "/notifications";
  if (raw === "/") return "/";
  const allowed = [
    "/tasks",
    "/operations",
    "/inventory",
    "/approvals",
    "/manager",
    "/handoffs",
    "/attendance",
    "/notifications",
    "/account",
  ];
  return allowed.some((prefix) => raw === prefix || raw.startsWith(prefix + "/") || raw.startsWith(prefix + "?"))
    ? raw
    : "/notifications";
}

async function ensureStaffPushChannels() {
  if (!isStaffPushSupported()) return;
  const channels: Channel[] = [
    { id: "general", name: "إشعارات العمل", description: "الإشعارات التشغيلية العامة", importance: 4 },
    { id: "orders", name: "الطلبات", description: "طلبات الأونلاين والتجهيز", importance: 5 },
    { id: "tasks", name: "المهام", description: "المهام والموافقات العاجلة", importance: 5 },
    { id: "offers", name: "التنبيهات", description: "تنبيهات إضافية", importance: 3 },
  ];
  for (const channel of channels) {
    try {
      await PushNotifications.createChannel(channel);
    } catch {
      // Channel creation is best-effort. FCM can still use its fallback channel.
    }
  }
}

async function persistToken(token: string) {
  const clean = token.trim();
  if (!clean) throw new Error("PUSH_TOKEN_EMPTY");
  localStorage.setItem(PUSH_TOKEN_KEY, clean);
  const device = await getPersistentStaffDeviceIdentity();
  await staff.registerPushDevice(clean, "android", device.deviceKey);
  localStorage.removeItem(PUSH_LAST_ERROR_KEY);
  return staff.getMyPushDeviceStatus();
}

export async function setupStaffPush(handlers: PushHandlers = {}) {
  if (!isStaffPushSupported()) return () => undefined;

  const handles: ListenerHandle[] = [];
  await ensureStaffPushChannels();

  handles.push(await PushNotifications.addListener("registration", (token) => {
    void persistToken(token.value)
      .then(() => handlers.onStatus?.("registered"))
      .catch((error) => {
        const message = error instanceof Error ? error.message : "PUSH_REGISTER_FAILED";
        localStorage.setItem(PUSH_LAST_ERROR_KEY, message);
        handlers.onStatus?.("error", message);
      });
  }));

  handles.push(await PushNotifications.addListener("registrationError", (error) => {
    const message = String(error?.error || "PUSH_NATIVE_REGISTRATION_FAILED");
    localStorage.setItem(PUSH_LAST_ERROR_KEY, message);
    handlers.onStatus?.("error", message);
  }));

  handles.push(await PushNotifications.addListener("pushNotificationReceived", () => {
    handlers.onReceived?.();
  }));

  handles.push(await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
    const data = event.notification?.data as Record<string, unknown> | undefined;
    handlers.onOpen?.(safeStaffPath(data?.action_url));
  }));

  try {
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive === "granted") {
      await PushNotifications.register();
    } else if (permission.receive === "denied") {
      handlers.onStatus?.("denied");
    } else {
      handlers.onStatus?.("prompt");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "PUSH_SETUP_FAILED";
    localStorage.setItem(PUSH_LAST_ERROR_KEY, message);
    handlers.onStatus?.("error", message);
  }

  return async () => {
    for (const handle of handles) {
      try {
        await handle.remove();
      } catch {
        // Ignore listener cleanup failures.
      }
    }
  };
}

export async function enableStaffPush() {
  if (!isStaffPushSupported()) throw new Error("الإشعارات Native متاحة على تطبيق Android فقط.");

  await ensureStaffPushChannels();
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt") permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") throw new Error("تم رفض إذن الإشعارات من إعدادات الهاتف.");

  return new Promise<staff.PushDeviceStatus>((resolve, reject) => {
    let settled = false;
    let registrationHandle: ListenerHandle | null = null;
    let errorHandle: ListenerHandle | null = null;

    const finish = async (error?: Error, value?: staff.PushDeviceStatus) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try { await registrationHandle?.remove(); } catch { /* ignore */ }
      try { await errorHandle?.remove(); } catch { /* ignore */ }
      if (error) reject(error);
      else resolve(value || { registered: false, device_count: 0, platforms: [], providers: [] });
    };

    const timer = window.setTimeout(() => {
      void finish(new Error("تعذر الحصول على Push token. تأكد من إعداد Firebase لهذه النسخة."));
    }, 15_000);

    void (async () => {
      registrationHandle = await PushNotifications.addListener("registration", (token) => {
        void persistToken(token.value)
          .then((status) => finish(undefined, status))
          .catch((error) => finish(error instanceof Error ? error : new Error("تعذر تسجيل جهاز الإشعارات.")));
      });
      errorHandle = await PushNotifications.addListener("registrationError", (error) => {
        void finish(new Error(String(error?.error || "تعذر تسجيل الإشعارات مع Firebase.")));
      });
      await PushNotifications.register();
    })().catch((error) => {
      void finish(error instanceof Error ? error : new Error("تعذر بدء تسجيل الإشعارات."));
    });
  });
}

export async function disableStaffPush() {
  if (!isStaffPushSupported()) return;
  const token = getStoredStaffPushToken();
  if (token) await staff.unregisterPushDevice(token);
  await PushNotifications.unregister();
  localStorage.removeItem(PUSH_TOKEN_KEY);
  localStorage.removeItem(PUSH_LAST_ERROR_KEY);
}

export async function getStaffPushPermissionState() {
  if (!isStaffPushSupported()) return "unsupported" as const;
  try {
    const permission = await PushNotifications.checkPermissions();
    return permission.receive;
  } catch {
    return "error" as const;
  }
}
