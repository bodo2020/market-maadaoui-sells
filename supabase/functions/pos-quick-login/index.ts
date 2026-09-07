import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json().catch(() => null) as {
      action?: string;
      deviceId?: string;
      deviceToken?: string;
      userId?: string;
      pin?: string;
    } | null;

    if (!body?.deviceId || !body?.deviceToken) return json({ error: "DEVICE_REQUIRED" }, 400);

    if (body.action === "staff_list") {
      const { data, error } = await admin.rpc("list_pos_quick_staff", {
        p_device_id: body.deviceId,
        p_device_token: body.deviceToken,
      });
      if (error) return json({ error: "DEVICE_UNAVAILABLE" }, 401);
      return json({ staff: Array.isArray(data) ? data : [] });
    }

    if (body.action !== "login" || !body.userId || !body.pin) {
      return json({ error: "INVALID_REQUEST" }, 400);
    }

    const { data: verified, error: verifyError } = await admin.rpc("verify_pos_quick_login", {
      p_device_id: body.deviceId,
      p_device_token: body.deviceToken,
      p_user_id: body.userId,
      p_pin: body.pin,
    });

    if (verifyError || !verified || typeof verified !== "object") {
      return json({ error: "AUTH_FAILED" }, 401);
    }

    const result = verified as Record<string, unknown>;
    if (result.ok !== true) {
      const code = typeof result.error === "string" ? result.error : "AUTH_FAILED";
      return json({
        error: code,
        remaining_attempts: result.remaining_attempts ?? null,
        locked_until: result.locked_until ?? null,
      }, code === "PIN_LOCKED" ? 423 : 401);
    }

    const username = typeof result.username === "string" ? result.username.trim() : "";
    const name = typeof result.name === "string" ? result.name : "موظف";
    if (!username) return json({ error: "STAFF_ACCOUNT_INVALID" }, 409);

    let { data: authUserData } = await admin.auth.admin.getUserById(body.userId);
    let authUser = authUserData?.user || null;

    if (!authUser) {
      const randomPassword = `${crypto.randomUUID()}-${crypto.randomUUID()}-Aa9!`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        id: body.userId,
        email: staffAuthEmail(username),
        password: randomPassword,
        email_confirm: true,
        app_metadata: { staff: true, pos_provisioned: true },
        user_metadata: { name },
      });
      if (createError || !created.user) {
        console.error("Failed to provision POS staff auth", createError?.message);
        return json({ error: "SESSION_CREATE_FAILED" }, 500);
      }
      authUser = created.user;
    }

    if (!authUser.email) return json({ error: "SESSION_CREATE_FAILED" }, 500);

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: authUser.email,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) return json({ error: "SESSION_CREATE_FAILED" }, 500);

    const { data: sessionData, error: sessionError } = await anon.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    const session = sessionData?.session;
    if (sessionError || !session?.access_token || !session.refresh_token) {
      return json({ error: "SESSION_CREATE_FAILED" }, 500);
    }

    return json({
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
      },
      staff: {
        user_id: result.user_id,
        name: result.name,
        username: result.username,
        role_name_ar: result.role_name_ar,
      },
      branch: {
        branch_id: result.branch_id,
        device_id: result.device_id,
        device_code: result.device_code,
      },
    });
  } catch (error) {
    console.error("pos-quick-login failed", error);
    return json({ error: "QUICK_LOGIN_FAILED" }, 500);
  }
});
