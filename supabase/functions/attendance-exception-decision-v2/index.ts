import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ ok: false, code: "AUTH_REQUIRED" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ ok: false, code: "SERVER_CONFIGURATION_ERROR" }, 500);
  }

  let payload: { exception_id?: string; decision?: string; note?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, code: "INVALID_JSON" }, 400);
  }

  if (!payload.exception_id || !["approved", "rejected"].includes(String(payload.decision))) {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: prepared, error: prepareError } = await userClient.rpc(
    "prepare_attendance_exception_decision_v2",
    {
      p_exception_id: payload.exception_id,
      p_decision: payload.decision,
      p_note: payload.note ?? null,
    },
  );

  if (prepareError) {
    return json({ ok: false, code: prepareError.message || "PREPARE_FAILED" }, 403);
  }
  if (!prepared?.ok) return json(prepared, prepared?.code === "DECISION_IN_PROGRESS" ? 409 : 400);
  if (prepared.finalized) {
    return json({ ...prepared, photo_deleted: true });
  }

  const photoPath = typeof prepared.photo_path === "string" ? prepared.photo_path : null;
  if (photoPath) {
    const { error: deleteError } = await adminClient.storage
      .from("hr_attendance_verification")
      .remove([photoPath]);

    if (deleteError) {
      // The DB remains pending and retryable. Never finalize after an unconfirmed delete.
      return json({ ok: false, code: "PHOTO_DELETE_FAILED", retryable: true }, 503);
    }
  }

  const { data: finalized, error: finalizeError } = await userClient.rpc(
    "finalize_attendance_exception_decision_v2",
    { p_exception_id: payload.exception_id },
  );

  if (finalizeError) {
    return json({ ok: false, code: finalizeError.message || "FINALIZE_FAILED", retryable: true }, 409);
  }
  if (!finalized?.ok) {
    return json({ ...finalized, retryable: true }, finalized?.code === "PHOTO_STILL_EXISTS" ? 503 : 409);
  }

  // Deliberately never return or log the private object path.
  return json(finalized);
});
