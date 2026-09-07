import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function staffAuthEmail(username: string): string {
  return `u-${toBase64Url(username.trim())}@staff.elmadawymarket.local`;
}

async function logAttempt(identifierHash: string, ipHash: string | null, success: boolean) {
  const { error } = await supabase.from("staff_login_attempts").insert({
    identifier_hash: identifierHash,
    ip_hash: ipHash,
    success,
  });
  if (error) console.error("Failed to record login attempt", error.message);
}

async function clearLegacyPassword(userId: string) {
  const legacyMarker = `__migrated__:${crypto.randomUUID()}`;
  const { error } = await supabase.from("users").update({ password: legacyMarker }).eq("id", userId);
  if (error) console.error("Auth account ready but legacy password could not be cleared", error.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!(req.headers.get("content-type") || "").includes("application/json")) {
      return json({ error: "Invalid request" }, 400);
    }

    const body = await req.json().catch(() => null) as
      | { username?: unknown; password?: unknown; branchCode?: unknown }
      | null;
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const branchCode = typeof body?.branchCode === "string" ? body.branchCode.trim() : "";

    if (!username || !password || username.length > 100 || password.length > 256 || branchCode.length > 100) {
      return json({ error: "بيانات الدخول غير صحيحة" }, 401);
    }

    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const identifierHash = await sha256(username.toLowerCase());
    const ipHash = forwarded ? await sha256(forwarded) : null;
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { count: identifierFailures } = await supabase.from("staff_login_attempts").select("id", { count: "exact", head: true }).eq("identifier_hash", identifierHash).eq("success", false).gte("created_at", cutoff);
    if ((identifierFailures || 0) >= 5) return json({ error: "محاولات كثيرة. حاول مرة أخرى بعد 15 دقيقة" }, 429);

    if (ipHash) {
      const { count: ipFailures } = await supabase.from("staff_login_attempts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).eq("success", false).gte("created_at", cutoff);
      if ((ipFailures || 0) >= 20) return json({ error: "محاولات كثيرة. حاول مرة أخرى لاحقاً" }, 429);
    }

    const { data: user, error: userError } = await supabase.from("users").select("id,name,username,password,phone,active,created_at,system_role_id").eq("username", username).maybeSingle();
    if (userError || !user || user.active === false) {
      await logAttempt(identifierHash, ipHash, false);
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيح" }, 401);
    }

    let isSuperAdmin = false;
    if (user.system_role_id) {
      const { data: systemRole } = await supabase.from("staff_roles").select("code,scope,active").eq("id", user.system_role_id).maybeSingle();
      isSuperAdmin = !!systemRole && systemRole.active !== false && systemRole.scope === "system" && systemRole.code === "super_admin";
    }

    if (branchCode) {
      const { data: branch } = await supabase.from("branches").select("id,active").eq("code", branchCode).maybeSingle();
      if (!branch || branch.active === false) {
        await logAttempt(identifierHash, ipHash, false);
        return json({ error: "اسم المستخدم أو كلمة المرور أو كود الماركت غير صحيح" }, 401);
      }
      if (!isSuperAdmin) {
        const { data: assignment } = await supabase.from("user_branch_roles").select("id").eq("user_id", user.id).eq("branch_id", branch.id).eq("active", true).maybeSingle();
        if (!assignment) {
          await logAttempt(identifierHash, ipHash, false);
          return json({ error: "اسم المستخدم أو كلمة المرور أو كود الماركت غير صحيح" }, 401);
        }
      }
    } else if (!isSuperAdmin) {
      const { data: assignments } = await supabase.from("user_branch_roles").select("branch_id").eq("user_id", user.id).eq("active", true).limit(20);
      const ids = (assignments || []).map((row) => row.branch_id).filter(Boolean);
      if (!ids.length) {
        await logAttempt(identifierHash, ipHash, false);
        return json({ error: "لا يوجد فرع نشط متاح لهذا الحساب" }, 403);
      }
      const { count: activeBranches } = await supabase.from("branches").select("id", { count: "exact", head: true }).in("id", ids).eq("active", true);
      if (!activeBranches) {
        await logAttempt(identifierHash, ipHash, false);
        return json({ error: "لا يوجد فرع نشط متاح لهذا الحساب" }, 403);
      }
    }

    const storedPassword = String(user.password ?? "");
    const alreadyMigrated = storedPassword.startsWith("__migrated__:");
    const { data: existingAuth } = await supabase.auth.admin.getUserById(user.id);

    if (existingAuth?.user && alreadyMigrated) {
      return json({ code: "already_migrated" }, 409);
    }

    const suppliedHash = await sha256(password);
    const storedHash = await sha256(storedPassword);
    if (!safeEqual(suppliedHash, storedHash)) {
      await logAttempt(identifierHash, ipHash, false);
      return json({ error: "اسم المستخدم أو كلمة المرور غير صحيح" }, 401);
    }

    if (existingAuth?.user) {
      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(user.id, {
        email: staffAuthEmail(user.username),
        password,
        email_confirm: true,
        app_metadata: { ...(existingAuth.user.app_metadata || {}), staff: true, pos_provisioned: false },
        user_metadata: { ...(existingAuth.user.user_metadata || {}), name: user.name },
      });
      if (updateAuthError) {
        console.error("Failed to finish POS-provisioned staff auth", updateAuthError.message);
        return json({ error: "تعذر ترقية حساب المستخدم. تواصل مع الإدارة" }, 500);
      }
      await clearLegacyPassword(user.id);
      await logAttempt(identifierHash, ipHash, true);
      return json({ migrated: true, user_id: user.id, upgraded_existing_auth: true });
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      id: user.id,
      email: staffAuthEmail(user.username),
      password,
      email_confirm: true,
      app_metadata: { staff: true },
      user_metadata: { name: user.name },
    });
    if (createError || !created.user) {
      console.error("Failed to migrate staff auth", createError?.message);
      return json({ error: "تعذر ترقية حساب المستخدم. تواصل مع الإدارة" }, 500);
    }

    await clearLegacyPassword(user.id);
    await logAttempt(identifierHash, ipHash, true);
    return json({ migrated: true, user_id: user.id });
  } catch (error) {
    console.error("Unexpected migrate-staff-login error", error);
    return json({ error: "حدث خطأ غير متوقع" }, 500);
  }
});
