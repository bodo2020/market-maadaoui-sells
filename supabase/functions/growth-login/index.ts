import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extra, "Content-Type": "application/json; charset=utf-8" },
  });
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function staffAuthEmail(username: string): string {
  return `u-${toBase64Url(username.trim())}@staff.elmadawymarket.local`;
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function consumeRateLimit(key: string, limit: number) {
  const keyHash = await sha256(key);
  const { data, error } = await admin.rpc("consume_edge_rate_limit_v1", {
    p_endpoint: "growth-login",
    p_key_hash: keyHash,
    p_window_seconds: 900,
    p_limit: limit,
  });
  if (error) throw new Error("RATE_LIMIT_UNAVAILABLE");
  return data as { allowed?: boolean; retry_after_seconds?: number } | null;
}

async function resolveStaff(identifier: string) {
  const escaped = identifier.replace(/([\\%_])/g, "\\$1");
  const { data, error } = await admin
    .from("users")
    .select("id,name,username,password,active")
    .ilike("username", escaped)
    .limit(2);
  if (error || !Array.isArray(data) || data.length !== 1) return null;
  return data[0] as { id: string; name: string; username: string; password: string | null; active: boolean | null };
}

async function signIn(email: string, password: string) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token || !data.session.refresh_token) return null;
  return data.session;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "طلب غير صالح" }, 400);

  try {
    const raw = await req.text();
    if (!raw || raw.length > 4096) return json({ error: "طلب غير صالح" }, 400);
    const body = JSON.parse(raw) as { identifier?: unknown; password?: unknown };
    const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!identifier || !password || identifier.length > 150 || password.length > 256) {
      return json({ error: "اكتب اسم المستخدم وكلمة المرور" }, 400);
    }

    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const identifierLimit = await consumeRateLimit(`id:${identifier.toLowerCase()}`, 8);
    if (identifierLimit?.allowed === false) {
      const retry = Math.max(1, Number(identifierLimit.retry_after_seconds || 60));
      return json({ error: "محاولات كثيرة. حاول مرة أخرى بعد قليل", retry_after_seconds: retry }, 429, { "Retry-After": String(retry) });
    }
    if (forwarded) {
      const ipLimit = await consumeRateLimit(`ip:${forwarded}`, 30);
      if (ipLimit?.allowed === false) {
        const retry = Math.max(1, Number(ipLimit.retry_after_seconds || 60));
        return json({ error: "محاولات كثيرة. حاول مرة أخرى لاحقاً", retry_after_seconds: retry }, 429, { "Retry-After": String(retry) });
      }
    }

    if (identifier.includes("@")) {
      const direct = await signIn(identifier.toLowerCase(), password);
      if (direct) {
        return json({ session: {
          access_token: direct.access_token,
          refresh_token: direct.refresh_token,
          expires_at: direct.expires_at,
          expires_in: direct.expires_in,
        }});
      }
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, 401);
    }

    const user = await resolveStaff(identifier);
    if (!user || user.active === false) return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, 401);

    const authEmail = staffAuthEmail(user.username);
    let session = await signIn(authEmail, password);
    if (!session) {
      const stored = String(user.password ?? "");
      const alreadyMigrated = stored.startsWith("__migrated__:");
      if (!alreadyMigrated) {
        const suppliedHash = await sha256(password);
        const storedHash = await sha256(stored);
        if (!safeEqual(suppliedHash, storedHash)) return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, 401);

        const { data: existing } = await admin.auth.admin.getUserById(user.id);
        if (existing?.user) {
          const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
            email: authEmail,
            password,
            email_confirm: true,
            app_metadata: { ...(existing.user.app_metadata || {}), staff: true },
            user_metadata: { ...(existing.user.user_metadata || {}), name: user.name },
          });
          if (updateError) return json({ error: "تعذر تجهيز حساب الدخول" }, 500);
        } else {
          const { error: createError } = await admin.auth.admin.createUser({
            id: user.id,
            email: authEmail,
            password,
            email_confirm: true,
            app_metadata: { staff: true },
            user_metadata: { name: user.name },
          });
          if (createError) return json({ error: "تعذر تجهيز حساب الدخول" }, 500);
        }

        await admin.from("users").update({ password: `__migrated__:${crypto.randomUUID()}` }).eq("id", user.id);
        session = await signIn(authEmail, password);
      }
    }

    if (!session) return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, 401);

    return json({ session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
    }});
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "RATE_LIMIT_UNAVAILABLE") return json({ error: "تعذر التحقق من محاولات الدخول حالياً" }, 503);
    console.error("growth-login failed", message);
    return json({ error: "تعذر الاتصال بخدمة تسجيل الدخول" }, 500);
  }
});
