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

const PROD_FALLBACK = "https://elmaday-market.lovable.app";

function cleanBaseUrl(value: string | null | undefined) {
  return (value || "").trim().replace(/\/+$/, "");
}

function portalBaseUrl(req: Request) {
  const configured = cleanBaseUrl(Deno.env.get("FRANCHISE_PORTAL_BASE_URL"));
  if (configured) return configured;
  const origin = cleanBaseUrl(req.headers.get("origin"));
  if (origin === PROD_FALLBACK || /^http:\/\/localhost:\d+$/.test(origin)) return origin;
  return PROD_FALLBACK;
}

function compactError(error: any) {
  return String(error?.code || error?.message || "unknown_error").slice(0, 180);
}

function rpcError(error: any, fallback: string) {
  const message = String(error?.message || fallback);
  const forbidden = error?.code === "42501" || message.includes("REQUIRED");
  const missing = error?.code === "P0002" || message.includes("NOT_FOUND");
  return json({ error: message }, forbidden ? 403 : missing ? 404 : 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
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

  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !callerData.user) return json({ error: "invalid_session" }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const action = typeof payload?.action === "string" ? payload.action.trim() : "";
  const baseUrl = portalBaseUrl(req);

  if (action === "invite" || action === "resend_invite") {
    const merchantId = typeof payload?.merchant_id === "string" ? payload.merchant_id.trim() : "";
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    const role = typeof payload?.role === "string" ? payload.role.trim() : "";
    if (!merchantId || !email || !role) return json({ error: "invite_payload_required" }, 400);

    const { data: invitation, error: inviteError } = await callerClient.rpc("create_franchise_account_invitation_v1", {
      p_merchant_id: merchantId,
      p_email: email,
      p_role: role,
    });
    if (inviteError || !invitation?.id) return rpcError(inviteError, "invitation_create_failed");

    const { data: existingUser, error: resolveError } = await adminClient.rpc("service_resolve_auth_user_by_email_v1", { p_email: email });
    if (resolveError) return json({ error: "auth_user_lookup_failed" }, 500);

    const redirectTo = `${baseUrl}/franchise-auth`;
    let targetUserId = existingUser?.user_id || null;
    let deliveryKind: "invite" | "recovery" = targetUserId ? "recovery" : "invite";
    let deliveryError: any = null;

    if (targetUserId) {
      const result = await adminClient.auth.resetPasswordForEmail(email, { redirectTo });
      deliveryError = result.error;
    } else {
      const result = await adminClient.auth.admin.inviteUserByEmail(email, { redirectTo });
      targetUserId = result.data.user?.id || null;
      deliveryError = result.error;

      // Handle a concurrent account creation without exposing an Auth Admin error to the UI.
      if (deliveryError) {
        const { data: retryUser } = await adminClient.rpc("service_resolve_auth_user_by_email_v1", { p_email: email });
        if (retryUser?.user_id) {
          targetUserId = retryUser.user_id;
          deliveryKind = "recovery";
          const retry = await adminClient.auth.resetPasswordForEmail(email, { redirectTo });
          deliveryError = retry.error;
        }
      }
    }

    const errorCode = deliveryError ? compactError(deliveryError) : null;
    await adminClient.rpc("service_mark_franchise_invitation_delivery_v1", {
      p_invitation_id: invitation.id,
      p_actor_user_id: callerData.user.id,
      p_auth_user_id: targetUserId,
      p_delivery_kind: deliveryKind,
      p_success: !deliveryError,
      p_error_code: errorCode,
    });

    if (deliveryError) {
      return json({ error: "invitation_delivery_failed", invitation_id: invitation.id }, 502);
    }

    return json({
      ok: true,
      invitation_id: invitation.id,
      delivery_kind: deliveryKind,
      existing_account: deliveryKind === "recovery",
      expires_at: invitation.expires_at,
    });
  }

  if (action === "reset_password") {
    const merchantId = typeof payload?.merchant_id === "string" ? payload.merchant_id.trim() : "";
    const targetUserId = typeof payload?.target_user_id === "string" ? payload.target_user_id.trim() : "";
    if (!merchantId || !targetUserId) return json({ error: "reset_payload_required" }, 400);

    const { data: prepared, error: prepareError } = await callerClient.rpc("prepare_franchise_password_reset_v1", {
      p_merchant_id: merchantId,
      p_user_id: targetUserId,
    });
    if (prepareError || !prepared?.email) return rpcError(prepareError, "password_reset_prepare_failed");

    const redirectTo = `${baseUrl}/franchise-auth?mode=reset`;
    const result = await adminClient.auth.resetPasswordForEmail(prepared.email, { redirectTo });
    const errorCode = result.error ? compactError(result.error) : null;

    await adminClient.rpc("service_log_franchise_password_reset_v1", {
      p_merchant_id: merchantId,
      p_actor_user_id: callerData.user.id,
      p_target_user_id: targetUserId,
      p_success: !result.error,
      p_error_code: errorCode,
    });

    if (result.error) return json({ error: "password_reset_delivery_failed" }, 502);
    return json({ ok: true, target_user_id: targetUserId });
  }

  return json({ error: "unsupported_action" }, 400);
});
