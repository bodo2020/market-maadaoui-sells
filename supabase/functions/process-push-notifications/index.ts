import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type PushDevice = {
  device_id: string;
  token: string;
  platform: "android" | "ios" | "web";
  app_kind: string;
  locale?: string;
};

type QueueItem = {
  queue_id: string;
  attempts: number;
  delivery_type: "transactional" | "marketing";
  recipient_user_id: string;
  notification_id: string | null;
  title: string;
  body: string;
  action_url?: string | null;
  category?: string;
  severity?: string;
  event_key?: string;
  metadata?: Record<string, unknown>;
  devices?: PushDevice[];
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8" },
});

function base64Url(bytes: Uint8Array | string) {
  const binary = typeof bytes === "string"
    ? Array.from(new TextEncoder().encode(bytes), b => String.fromCharCode(b)).join("")
    : Array.from(bytes, b => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getGoogleAccessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenBody?.access_token) {
    throw new Error(`FCM_OAUTH_FAILED:${tokenResponse.status}`);
  }
  return String(tokenBody.access_token);
}

function priorityFor(severity?: string) {
  return severity === "critical" || severity === "high" ? "high" : "normal";
}

function channelFor(category?: string) {
  if (category === "orders") return "orders";
  if (category === "marketing") return "offers";
  if (category === "tasks") return "tasks";
  return "general";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRole) return json({ error: "SUPABASE_SERVER_CONFIG_MISSING" }, 500);

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const workerSecret = req.headers.get("x-notification-worker-secret") || "";
  const { data: secretOk, error: secretError } = await admin.rpc("verify_notification_worker_secret_v2", {
    p_secret: workerSecret,
  });
  if (secretError || secretOk !== true) return json({ error: "UNAUTHORIZED" }, 401);

  const rawAccount = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!rawAccount) {
    return json({ error: "FCM_NOT_CONFIGURED", configured: false }, 503);
  }

  let account: ServiceAccount;
  try {
    account = JSON.parse(rawAccount);
    if (!account.project_id || !account.client_email || !account.private_key) throw new Error("invalid");
  } catch {
    return json({ error: "FCM_SERVICE_ACCOUNT_INVALID" }, 500);
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(account);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "FCM_OAUTH_FAILED" }, 502);
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_push_delivery_batch_v2", { p_limit: 25 });
  if (claimError) return json({ error: "QUEUE_CLAIM_FAILED", detail: claimError.message }, 500);

  const items = (Array.isArray(claimed) ? claimed : []) as QueueItem[];
  let sent = 0;
  let failed = 0;
  let retried = 0;
  let suppressed = 0;

  for (const item of items) {
    const devices = Array.isArray(item.devices) ? item.devices : [];
    if (!devices.length) {
      await admin.rpc("complete_push_delivery_v2", {
        p_queue_id: item.queue_id,
        p_state: "suppressed",
        p_error: "NO_ACTIVE_PUSH_DEVICE",
        p_metadata: { device_count: 0 },
      });
      suppressed += 1;
      continue;
    }

    const refs: string[] = [];
    let successCount = 0;
    let transientFailures = 0;
    let permanentFailures = 0;

    for (const device of devices) {
      const dataPayload: Record<string, string> = {
        notification_id: String(item.notification_id || ""),
        event_key: String(item.event_key || ""),
        category: String(item.category || "system"),
        severity: String(item.severity || "normal"),
        action_url: String(item.action_url || ""),
        delivery_type: String(item.delivery_type || "transactional"),
      };

      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: { title: item.title || "المعداوي ماركت", body: item.body || "" },
            data: dataPayload,
            android: {
              priority: priorityFor(item.severity),
              notification: { channel_id: channelFor(item.category) },
            },
            apns: {
              headers: { "apns-priority": priorityFor(item.severity) === "high" ? "10" : "5" },
              payload: { aps: { sound: priorityFor(item.severity) === "high" ? "default" : undefined } },
            },
          },
        }),
      });

      const responseText = await response.text();
      if (response.ok) {
        successCount += 1;
        try {
          const parsed = JSON.parse(responseText);
          if (parsed?.name) refs.push(String(parsed.name));
        } catch { /* ignore malformed success body */ }
        continue;
      }

      const invalidToken = response.status === 404 || responseText.includes("UNREGISTERED") || responseText.includes("registration-token-not-registered");
      const transient = response.status === 429 || response.status >= 500;
      if (invalidToken) {
        permanentFailures += 1;
        await admin.rpc("disable_push_device_token_v2", {
          p_token: device.token,
          p_error: `FCM_${response.status}:${responseText.slice(0, 500)}`,
        });
      } else if (transient) {
        transientFailures += 1;
      } else {
        permanentFailures += 1;
      }
    }

    if (successCount > 0) {
      await admin.rpc("complete_push_delivery_v2", {
        p_queue_id: item.queue_id,
        p_state: "sent",
        p_provider_reference: refs[0] || null,
        p_error: permanentFailures || transientFailures ? "PARTIAL_DEVICE_FAILURE" : null,
        p_metadata: {
          device_count: devices.length,
          success_count: successCount,
          transient_failures: transientFailures,
          permanent_failures: permanentFailures,
          provider_references: refs,
        },
      });
      sent += 1;
    } else if (transientFailures > 0 && Number(item.attempts || 0) < 6) {
      await admin.rpc("complete_push_delivery_v2", {
        p_queue_id: item.queue_id,
        p_state: "retrying",
        p_error: "FCM_TRANSIENT_FAILURE",
        p_metadata: { device_count: devices.length, transient_failures: transientFailures, permanent_failures: permanentFailures },
      });
      retried += 1;
    } else {
      await admin.rpc("complete_push_delivery_v2", {
        p_queue_id: item.queue_id,
        p_state: "failed",
        p_error: "FCM_DELIVERY_FAILED",
        p_metadata: { device_count: devices.length, transient_failures: transientFailures, permanent_failures: permanentFailures },
      });
      failed += 1;
    }
  }

  return json({ processed: items.length, sent, failed, retried, suppressed, configured: true });
});
