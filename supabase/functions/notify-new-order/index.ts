import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extra, "Content-Type": "application/json; charset=utf-8" },
  });

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "AUTH_REQUIRED" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceRole || !resendKey) return json({ error: "SERVER_CONFIG_MISSING" }, 500);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return json({ error: "AUTH_REQUIRED" }, 401);

  const raw = await req.text();
  if (!raw || raw.length > 4096) return json({ error: "INVALID_REQUEST" }, 400);
  let body: { orderId?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    return json({ error: "INVALID_ORDER_ID" }, 400);
  }

  const userRateKey = await sha256(`notify-new-order:user:${user.id}`);
  const orderRateKey = await sha256(`notify-new-order:order:${orderId}`);
  const [{ data: userRate, error: userRateError }, { data: orderRate, error: orderRateError }] = await Promise.all([
    admin.rpc("consume_edge_rate_limit_v1", { p_endpoint: "notify-new-order-user", p_key_hash: userRateKey, p_window_seconds: 600, p_limit: 10 }),
    admin.rpc("consume_edge_rate_limit_v1", { p_endpoint: "notify-new-order-order", p_key_hash: orderRateKey, p_window_seconds: 300, p_limit: 1 }),
  ]);
  if (userRateError || orderRateError) return json({ error: "RATE_LIMIT_UNAVAILABLE" }, 503);
  if (userRate?.allowed === false || orderRate?.allowed === false) {
    const retry = Math.max(1, Number(orderRate?.retry_after_seconds || userRate?.retry_after_seconds || 60));
    return json({ error: "RATE_LIMITED", retry_after_seconds: retry }, 429, { "Retry-After": String(retry) });
  }

  // This query runs with the caller's JWT. Existing RLS therefore guarantees
  // a customer can only notify for their own order (admins retain normal access).
  const { data: order, error: orderError } = await userClient
    .from("online_orders")
    .select("id,total,items,tracking_number,created_at,customer_snapshot")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) {
    console.error("notify-new-order order lookup failed", orderError.message);
    return json({ error: "ORDER_LOOKUP_FAILED" }, 500);
  }
  if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404);

  const customerSnapshot = order.customer_snapshot && typeof order.customer_snapshot === "object"
    ? order.customer_snapshot as Record<string, unknown>
    : {};
  const customerName = String(customerSnapshot.name || "عميل");
  const orderNumber = String(order.tracking_number || order.id.slice(0, 8).toUpperCase());
  const total = Number(order.total || 0);
  const items = Array.isArray(order.items) ? order.items as Array<Record<string, unknown>> : [];
  const itemsList = items.slice(0, 100).map((item) => {
    const name = escapeHtml(item.product_name || item.name || "منتج");
    const quantity = escapeHtml(item.quantity ?? "-");
    const price = Number(item.price || 0);
    return `<li>${name} - الكمية: ${quantity} - السعر: ${Number.isFinite(price) ? price.toFixed(2) : "0.00"} ج.م</li>`;
  }).join("");

  const resend = new Resend(resendKey);
  const { data: emailData, error: emailError } = await resend.emails.send({
    from: "المعداوي ماركت <onboarding@resend.dev>",
    to: ["elmadawymarket@gmail.com"],
    subject: `طلب إلكتروني جديد #${escapeHtml(orderNumber)}`,
    html: `<div style="font-family:Arial,sans-serif;direction:rtl;text-align:right">
      <h1>طلب إلكتروني جديد</h1>
      <p><strong>رقم الطلب:</strong> ${escapeHtml(orderNumber)}</p>
      <p><strong>اسم العميل:</strong> ${escapeHtml(customerName)}</p>
      <p><strong>الإجمالي:</strong> ${Number.isFinite(total) ? total.toFixed(2) : "0.00"} ج.م</p>
      <h3>المنتجات:</h3><ul>${itemsList}</ul>
    </div>`,
  });

  if (emailError) {
    console.error("notify-new-order email failed", emailError.message);
    return json({ error: "EMAIL_SEND_FAILED" }, 502);
  }

  return json({ success: true, provider_id: emailData?.id || null });
});
