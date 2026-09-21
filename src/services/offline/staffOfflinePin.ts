const PREFIX = "staff-app-pin-offline:v1:";
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;
const ITERATIONS = 250_000;

type OfflinePinRecord = {
  salt: string;
  verifier: string;
  verifiedAt: number;
  failedAttempts: number;
  lockedUntil: number | null;
};

function key(userId: string) { return `${PREFIX}${userId}`; }

function encode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decode(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function derive(pin: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, material, 256);
  return new Uint8Array(bits);
}

function read(userId: string): OfflinePinRecord | null {
  try {
    const record = JSON.parse(localStorage.getItem(key(userId)) || "null") as OfflinePinRecord | null;
    if (!record?.salt || !record.verifier || Date.now() - Number(record.verifiedAt || 0) > TTL_MS) return null;
    return record;
  } catch {
    return null;
  }
}

function equal(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

export async function rememberOfflineStaffPin(userId: string, pin: string) {
  if (!/^\d{4,6}$/.test(pin)) return;
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const verifier = await derive(pin, salt);
    const record: OfflinePinRecord = {
      salt: encode(salt),
      verifier: encode(verifier),
      verifiedAt: Date.now(),
      failedAttempts: 0,
      lockedUntil: null,
    };
    localStorage.setItem(key(userId), JSON.stringify(record));
  } catch {
    // Online unlock remains available if this browser blocks local cryptography/storage.
  }
}

export function offlineStaffPinStatus(userId: string) {
  const record = read(userId);
  return {
    configured: Boolean(record),
    locked: Boolean(record?.lockedUntil && record.lockedUntil > Date.now()),
    failedAttempts: record?.failedAttempts || 0,
    lockedUntil: record?.lockedUntil ? new Date(record.lockedUntil).toISOString() : null,
  };
}

export async function verifyOfflineStaffPin(userId: string, pin: string) {
  const record = read(userId);
  if (!record) throw new Error("لا توجد صلاحية أوفلاين حديثة. وصّل الإنترنت وافتح التطبيق مرة واحدة.");
  if (record.lockedUntil && record.lockedUntil > Date.now()) throw new Error("تم قفل PIN أوفلاين لمدة 10 دقائق بسبب المحاولات الخاطئة.");
  const actual = await derive(pin, decode(record.salt));
  if (!equal(actual, decode(record.verifier))) {
    const failedAttempts = Number(record.failedAttempts || 0) + 1;
    const lockedUntil = failedAttempts >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : null;
    localStorage.setItem(key(userId), JSON.stringify({ ...record, failedAttempts: lockedUntil ? 0 : failedAttempts, lockedUntil }));
    const remaining = Math.max(0, MAX_ATTEMPTS - failedAttempts);
    throw new Error(lockedUntil ? "تم قفل PIN أوفلاين لمدة 10 دقائق." : `PIN غير صحيح. متبقي ${remaining} محاولات.`);
  }
  localStorage.setItem(key(userId), JSON.stringify({ ...record, failedAttempts: 0, lockedUntil: null }));
  return { ok: true };
}

export function clearOfflineStaffPins() {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean) as string[];
    keys.filter(item => item.startsWith(PREFIX)).forEach(item => localStorage.removeItem(item));
  } catch {
    // Storage may be disabled by the browser.
  }
}
