import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "content-type": "application/json; charset=utf-8" },
});

function validPassword(value: string) {
  return value.length >= 12 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "authentication_required" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "invalid_session" }, 401);

  const { data: isSuper, error: superError } = await callerClient.rpc("is_growth_it_super_admin_v1");
  if (superError || isSuper !== true) return json({ error: "super_admin_required" }, 403);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const targetUserId = typeof payload?.target_user_id === "string" ? payload.target_user_id.trim() : "";
  const newPassword = typeof payload?.new_password === "string" ? payload.new_password : "";
  const reason = typeof payload?.reason === "string" ? payload.reason.trim().slice(0, 300) : "";
  if (!targetUserId) return json({ error: "target_required" }, 400);
  if (!validPassword(newPassword)) return json({ error: "weak_password" }, 400);

  const { data: target, error: targetError } = await adminClient
    .from("users")
    .select("id,username,name,role,active")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetError) return json({ error: "target_lookup_failed" }, 500);
  if (!target) return json({ error: "target_not_found" }, 404);
  if (target.active === false) return json({ error: "target_inactive" }, 400);
  if (["customer", "client"].includes(String(target.role || "").toLowerCase())) {
    return json({ error: "customer_password_reset_not_allowed" }, 403);
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(target.id, { password: newPassword });
  if (updateError) return json({ error: "password_update_failed" }, 500);

  await adminClient.from("staff_password_reset_audit_v1").insert({
    actor_user_id: userData.user.id,
    target_user_id: target.id,
    target_username: target.username,
    target_role: target.role,
    reason: reason || null,
    source: "admin-reset-staff-password",
  });

  return json({ ok: true, target_user_id: target.id, username: target.username, name: target.name });
});
