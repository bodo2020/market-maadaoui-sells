import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

type ProviderName = "gemini" | "groq" | "openrouter";
type ToolRequest = { name: string; args: Record<string, unknown>; callId?: string };
type ProviderResult = {
  text: string;
  toolCalls: ToolRequest[];
  rawAssistant?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  thoughtsTokens?: number;
  finishReason?: string;
};
type StoredMessage = { role: "user" | "assistant"; content: string };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const providerSecretCache = new Map<string, string>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const reportSections = [
  "overview", "sales", "profitability", "payments", "returns", "inventory", "products", "shifts",
  "online", "customers", "costs", "insights", "debts", "peak_hours", "waste", "staff_coverage", "inventory_transfers",
] as const;
type ReportSection = typeof reportSections[number];

const toolDeclarations = [
  {
    name: "search_products",
    description: "ابحث عن منتجات حقيقية في الفرع بالاسم أو الباركود. استخدمها دائمًا قبل ذكر سعر أو مخزون منتج محدد.",
    parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer" } }, required: ["query"] },
  },
  {
    name: "get_active_offers",
    description: "اعرض العروض النشطة والمتاحة حاليًا في الفرع.",
    parameters: { type: "object", properties: { limit: { type: "integer" } } },
  },
  {
    name: "get_order_status",
    description: "اقرأ حالة طلب حقيقي باستخدام UUID أو رقم التتبع.",
    parameters: { type: "object", properties: { order_ref: { type: "string" } }, required: ["order_ref"] },
  },
  { name: "get_branch_info", description: "اقرأ بيانات فرع العمل الحالي.", parameters: { type: "object", properties: {} } },
  {
    name: "get_management_report",
    description: "اقرأ تقريرًا إداريًا موثوقًا من Reporting V2. استخدمه لأي سؤال عن المبيعات أو الأرباح أو وسائل الدفع أو المرتجعات أو المخزون أو المنتجات أو الورديات والكاشير أو الأونلاين أو العملاء أو المصروفات والموردين أو الديون أو ساعات الذروة أو الهالك أو تغطية الموظفين أو تحويلات المخزون أو التنبيهات الذكية. لا تستنتج أرقامًا تشغيلية من الذاكرة؛ اطلب التقرير أولًا.",
    parameters: {
      type: "object",
      properties: {
        section: { type: "string", enum: reportSections },
        days: { type: "integer", description: "عدد الأيام السابقة حتى الآن، من 1 إلى 90. الافتراضي 7." },
        from: { type: "string", description: "ISO timestamp اختياري لبداية فترة مخصصة." },
        to: { type: "string", description: "ISO timestamp اختياري لنهاية فترة مخصصة." },
        limit: { type: "integer", description: "عدد الصفوف التفصيلية، من 10 إلى 50." },
      },
      required: ["section"],
    },
  },
];

const systemPrompt = `أنت مساعد الإدارة الخاص بالمعداوي ماركت. رد بالعربية المصرية المهنية المختصرة.
قواعد إلزامية:
- لا تخمّن أي رقم تشغيلي متغير. استخدم Tool موثوق قبل ذكر السعر أو المخزون أو المبيعات أو الربح أو المدفوعات أو المرتجعات أو أداء الكاشير أو العملاء أو الموردين.
- استخدم get_management_report لأي سؤال تحليلي أو إداري، واختر القسم المناسب والفترة الأقرب لسؤال المستخدم.
- لو المستخدم لم يحدد فترة في سؤال إداري، ابدأ بآخر 7 أيام واذكر الفترة التي استخدمتها.
- فرّق بين الأرقام الموثقة وبين التحليل. قسم insights مبني على قواعد حتمية من Reporting V2 وليس رأيًا من الموديل.
- لا تعرض purchase_price الخام أو أسرار أو بيانات شخصية مثل الهاتف والبريد والعنوان، حتى لو ظهرت في مصدر البيانات.
- الربح والتكاليف لا تُعرض إلا إذا رجعت من الـTool حسب صلاحيات المستخدم؛ لا تحاول تجاوز الصلاحيات.
- لا تدّعي تنفيذ تعديل. هذه النسخة قراءة فقط، وأي Action مالي أو مخزني أو تسعيري يحتاج موافقة بشرية.
- لو التقرير كبير، أكمل الإجابة للنهاية بخلاصة مرتبة ومكتملة بدل بدء قائمة طويلة ثم قطعها. ركّز على أهم النتائج والإجراءات.
- لو الأداة فشلت أو البيانات غير كافية، قل ذلك بوضوح من غير اختلاق إجابة.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
}
function safeText(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function parseToolArguments(value: unknown) {
  if (typeof value !== "string") return {};
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}
async function withTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); } finally { clearTimeout(timer); }
}
async function sleep(ms: number) { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function getProviderKey(name: "GEMINI_API_KEY" | "GROQ_API_KEY" | "OPENROUTER_API_KEY") {
  const cached = providerSecretCache.get(name);
  if (cached) return cached;
  const { data, error } = await admin.rpc("get_ai_provider_secret", { p_name: name });
  const vaultValue = typeof data === "string" ? data.trim() : "";
  if (!error && vaultValue) {
    providerSecretCache.set(name, vaultValue);
    return vaultValue;
  }
  const envValue = Deno.env.get(name)?.trim();
  if (envValue) {
    providerSecretCache.set(name, envValue);
    return envValue;
  }
  return null;
}

function sanitizeForAi(value: unknown, depth = 0): unknown {
  if (depth > 7) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 60).map((item) => sanitizeForAi(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const blocked = /(purchase_price|unit_cost|cost_price|customer_phone|phone|email|address|receipt_url|provider_reference|tax_number|commercial_registration|payout_destination)/i;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (blocked.test(key)) continue;
    output[key] = sanitizeForAi(item, depth + 1);
  }
  return output;
}

function resolveReportRange(args: Record<string, unknown>) {
  const customFrom = safeText(args.from, 80);
  const customTo = safeText(args.to, 80);
  if (customFrom && customTo) {
    const from = new Date(customFrom);
    const to = new Date(customTo);
    const span = to.getTime() - from.getTime();
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && span > 0 && span <= 732 * 86400000) {
      return { from: from.toISOString(), to: to.toISOString(), requested_days: null };
    }
  }
  const days = Math.round(clampNumber(args.days, 1, 90, 7));
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  return { from: from.toISOString(), to: to.toISOString(), requested_days: days };
}

function toGeminiHistory(messages: StoredMessage[]) {
  return messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }));
}
function toOpenAiHistory(messages: StoredMessage[]) { return messages.map((message) => ({ role: message.role, content: message.content })); }

async function callGemini(model: string, messages: unknown[], timeoutMs: number, maxTokens: number): Promise<ProviderResult> {
  const key = await getProviderKey("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_NOT_CONFIGURED");
  const transient = new Set([429, 500, 502, 503, 504]);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const isGemini3 = /^gemini-3(?:\.|-)/i.test(model);
    const generationConfig = isGemini3
      ? { maxOutputTokens: maxTokens, thinkingConfig: { thinkingLevel: "LOW" } }
      : { maxOutputTokens: maxTokens, temperature: 0.15 };

    const response = await withTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages,
        tools: [{ functionDeclarations: toolDeclarations }],
        generationConfig,
      }),
    }, timeoutMs);

    if (response.ok) {
      const payload = await response.json();
      const candidate = payload?.candidates?.[0] || {};
      const parts = candidate?.content?.parts || [];
      const finishReason = safeText(candidate?.finishReason, 80) || undefined;
      const thoughtsTokens = Number(payload?.usageMetadata?.thoughtsTokenCount || 0) || undefined;
      const outputTokens = Number(payload?.usageMetadata?.candidatesTokenCount || 0) || undefined;

      if (finishReason === "MAX_TOKENS") {
        throw new Error(`GEMINI_MAX_TOKENS_output_${outputTokens || 0}_thoughts_${thoughtsTokens || 0}`);
      }

      return {
        text: parts.map((part: any) => part.text || "").join("\n").trim(),
        toolCalls: parts.filter((part: any) => part.functionCall).map((part: any) => ({
          name: part.functionCall.name,
          args: part.functionCall.args || {},
          callId: part.functionCall.id || undefined,
        })),
        rawAssistant: candidate?.content,
        inputTokens: payload?.usageMetadata?.promptTokenCount,
        outputTokens,
        thoughtsTokens,
        finishReason,
      };
    }

    let detail = "";
    try {
      const payload = await response.json();
      detail = safeText(payload?.error?.status || payload?.error?.message || "", 80).replace(/[^A-Za-z0-9_.:-]/g, "_");
    } catch { detail = ""; }

    if (attempt === 0 && transient.has(response.status)) {
      await sleep(700);
      continue;
    }
    throw new Error(`GEMINI_${response.status}${detail ? `_${detail}` : ""}`);
  }
  throw new Error("GEMINI_FAILED");
}

async function callGroq(model: string, messages: unknown[], timeoutMs: number, maxTokens: number): Promise<ProviderResult> {
  const key = await getProviderKey("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_NOT_CONFIGURED");
  const response = await withTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, ...messages], tools: toolDeclarations.map((tool) => ({ type: "function", function: tool })), tool_choice: "auto", temperature: 0.15, max_tokens: maxTokens }),
  }, timeoutMs);
  if (!response.ok) throw new Error(`GROQ_${response.status}`);
  const payload = await response.json();
  const assistant = payload?.choices?.[0]?.message || {};
  return {
    text: assistant.content || "",
    toolCalls: (assistant.tool_calls || []).map((call: any) => ({ name: call.function.name, args: parseToolArguments(call.function.arguments), callId: call.id || crypto.randomUUID() })),
    rawAssistant: assistant,
    inputTokens: payload?.usage?.prompt_tokens,
    outputTokens: payload?.usage?.completion_tokens,
    finishReason: payload?.choices?.[0]?.finish_reason || undefined,
  };
}

async function callOpenRouter(model: string, messages: unknown[], timeoutMs: number, maxTokens: number): Promise<ProviderResult> {
  const key = await getProviderKey("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_NOT_CONFIGURED");
  const response = await withTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Title": "Elmadawy Market AI Gateway" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, ...messages], tools: toolDeclarations.map((tool) => ({ type: "function", function: tool })), tool_choice: "auto", temperature: 0.15, max_tokens: maxTokens }),
  }, timeoutMs);
  if (!response.ok) throw new Error(`OPENROUTER_${response.status}`);
  const payload = await response.json();
  const assistant = payload?.choices?.[0]?.message || {};
  return {
    text: assistant.content || "",
    toolCalls: (assistant.tool_calls || []).map((call: any) => ({ name: call.function.name, args: parseToolArguments(call.function.arguments), callId: call.id || crypto.randomUUID() })),
    rawAssistant: assistant,
    inputTokens: payload?.usage?.prompt_tokens,
    outputTokens: payload?.usage?.completion_tokens,
    finishReason: payload?.choices?.[0]?.finish_reason || undefined,
  };
}

async function callProvider(provider: ProviderName, model: string, messages: unknown[], timeoutMs: number, maxTokens: number) {
  if (provider === "gemini") return callGemini(model, messages, timeoutMs, maxTokens);
  if (provider === "groq") return callGroq(model, messages, timeoutMs, maxTokens);
  return callOpenRouter(model, messages, timeoutMs, maxTokens);
}

async function executeManagementReport(userClient: any, branchId: string, request: ToolRequest) {
  const section = safeText(request.args.section, 40) as ReportSection;
  if (!reportSections.includes(section)) throw new Error("INVALID_REPORT_SECTION");
  const range = resolveReportRange(request.args);
  const limit = Math.round(clampNumber(request.args.limit, 10, 50, 25));
  const common = { p_branch_id: branchId, p_from: range.from, p_to: range.to };
  const rpcMap: Record<ReportSection, { name: string; args: Record<string, unknown> }> = {
    overview: { name: "get_reporting_overview_v2", args: common },
    sales: { name: "get_reporting_sales_v2", args: { ...common, p_channel: "all", p_cashier_id: null, p_payment_code: null, p_search: null, p_limit: limit, p_offset: 0 } },
    profitability: { name: "get_reporting_profitability_v2", args: common },
    payments: { name: "get_reporting_payments_v2", args: common },
    returns: { name: "get_reporting_returns_v2", args: common },
    inventory: { name: "get_reporting_inventory_v2", args: common },
    products: { name: "get_reporting_products_v2", args: { ...common, p_limit: limit } },
    shifts: { name: "get_reporting_shifts_v2", args: { ...common, p_limit: limit } },
    online: { name: "get_reporting_online_v2", args: { ...common, p_limit: limit } },
    customers: { name: "get_reporting_customers_v2", args: { ...common, p_limit: limit } },
    costs: { name: "get_reporting_costs_v2", args: { ...common, p_limit: limit } },
    insights: { name: "get_reporting_insights_v2", args: common },
    debts: { name: "get_reporting_debts_v1", args: { ...common, p_limit: limit } },
    peak_hours: { name: "get_reporting_peak_hours_v1", args: common },
    waste: { name: "get_reporting_waste_v1", args: { ...common, p_limit: limit } },
    staff_coverage: { name: "get_reporting_staff_coverage_v1", args: common },
    inventory_transfers: { name: "get_reporting_inventory_transfers_v2", args: common },
  };
  const selected = rpcMap[section];
  const { data, error } = await userClient.rpc(selected.name, selected.args);
  if (error) throw new Error(error.message || "REPORT_TOOL_FAILED");
  return sanitizeForAi({ section, range, report: data });
}

async function executeTool(userClient: any, branchId: string, request: ToolRequest, permissions: Set<string>, isSuperAdmin: boolean) {
  const started = Date.now();
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await userClient.rpc(name, args);
    if (error) throw new Error(error.message || "TOOL_FAILED");
    return data;
  };
  try {
    let result: unknown;
    const safeCatalog = (rows: unknown) => (Array.isArray(rows) ? rows : []).map((row: any) => ({
      id: row?.id, record_type: row?.record_type, name: row?.name, barcode: row?.barcode, price: row?.price,
      offer_price: row?.offer_price, is_offer: row?.is_offer, quantity: row?.quantity, unit_of_measure: row?.unit_of_measure, stock_status: row?.stock_status,
    }));

    if (request.name === "search_products") {
      if (!isSuperAdmin && !permissions.has("inventory.manage") && !permissions.has("products.manage")) throw new Error("TOOL_PERMISSION_DENIED");
      result = safeCatalog(await rpc("get_product_management_catalog", { p_branch_id: branchId, p_search: safeText(request.args.query, 120), p_company_id: null, p_category_id: null, p_limit: Math.round(clampNumber(request.args.limit, 1, 20, 8)), p_offset: 0 }));
    } else if (request.name === "get_active_offers") {
      if (!isSuperAdmin && !permissions.has("inventory.manage") && !permissions.has("products.manage")) throw new Error("TOOL_PERMISSION_DENIED");
      const rows = await rpc("get_product_management_catalog", { p_branch_id: branchId, p_search: null, p_company_id: null, p_category_id: null, p_limit: 200, p_offset: 0 });
      result = safeCatalog(rows).filter((row: any) => row?.is_offer).slice(0, Math.round(clampNumber(request.args.limit, 1, 30, 10)));
    } else if (request.name === "get_order_status") {
      if (!isSuperAdmin && !permissions.has("online_orders.view") && !permissions.has("online_orders.manage")) throw new Error("TOOL_PERMISSION_DENIED");
      const orderRef = safeText(request.args.order_ref, 120);
      if (!/^[a-zA-Z0-9-]{1,120}$/.test(orderRef)) throw new Error("INVALID_ORDER_REFERENCE");
      const baseQuery = userClient.from("online_orders").select("id,tracking_number,status,payment_status,total,created_at,updated_at").eq("branch_id", branchId);
      const query = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderRef) ? baseQuery.eq("id", orderRef) : baseQuery.eq("tracking_number", orderRef);
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw new Error(error.message || "TOOL_FAILED");
      result = data ? { found: true, ...data } : { found: false };
    } else if (request.name === "get_branch_info") {
      const { data, error } = await userClient.from("branches").select("id,name,code,active").eq("id", branchId).maybeSingle();
      if (error) throw new Error(error.message || "TOOL_FAILED");
      result = data || { found: false };
    } else if (request.name === "get_management_report") {
      if (!isSuperAdmin && !permissions.has("reports.view")) throw new Error("TOOL_PERMISSION_DENIED");
      result = await executeManagementReport(userClient, branchId, request);
    } else {
      throw new Error("TOOL_NOT_ALLOWED");
    }
    return { ok: true, result, duration_ms: Date.now() - started };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "TOOL_FAILED", duration_ms: Date.now() - started };
  }
}

function appendToolRound(provider: ProviderName, messages: any[], assistant: ProviderResult, calls: Array<{ request: ToolRequest; output: unknown }>) {
  if (provider === "gemini") {
    messages.push(assistant.rawAssistant || { role: "model", parts: [] });
    messages.push({
      role: "user",
      parts: calls.map(({ request, output }) => ({
        functionResponse: {
          name: request.name,
          ...(request.callId ? { id: request.callId } : {}),
          response: output,
        },
      })),
    });
  } else {
    messages.push(assistant.rawAssistant || { role: "assistant", content: assistant.text });
    for (const { request, output } of calls) messages.push({ role: "tool", tool_call_id: request.callId || crypto.randomUUID(), content: JSON.stringify(output) });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "سجل الدخول أولاً." }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "جلسة الدخول غير صالحة." }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "طلب غير صالح." }, 400); }
  const message = safeText(body?.message, 3000);
  const branchId = safeText(body?.branch_id, 80);
  const channel = safeText(body?.channel, 40) || "admin_sandbox";
  if (!message || !/^[0-9a-f-]{36}$/i.test(branchId)) return json({ error: "الرسالة أو الفرع غير صالح." }, 400);

  const [{ data: identity, error: identityError }, { data: branchContexts, error: branchesError }] = await Promise.all([
    userClient.rpc("get_my_staff_identity"),
    userClient.rpc("get_my_staff_branches"),
  ]);
  const branchContext = Array.isArray(branchContexts) ? branchContexts.find((item: any) => item?.branch_id === branchId) : null;
  const permissions = new Set<string>(Array.isArray(branchContext?.permissions) ? branchContext.permissions : []);
  const isSuperAdmin = identity?.user_id === authData.user.id && identity?.is_super_admin === true;
  const canUseAi = isSuperAdmin || ["reports.view", "products.manage", "inventory.manage", "online_orders.view"].some((permission) => permissions.has(permission));
  if (identityError || branchesError || identity?.user_id !== authData.user.id || !branchContext || !canUseAi) return json({ error: "ليس لديك صلاحية استخدام مساعد AI في هذا الفرع." }, 403);

  const { data: settings } = await admin.from("ai_runtime_settings").select("*").eq("scope", "global").single();
  if (!settings?.enabled) return json({ error: "بوابة AI متوقفة من الإعدادات حاليًا." }, 503);

  const suppliedConversationId = /^[0-9a-f-]{36}$/i.test(body?.conversation_id || "") ? body.conversation_id : null;
  const conversationId = suppliedConversationId || crypto.randomUUID();
  if (suppliedConversationId) {
    const { data: existing } = await admin.from("ai_conversations").select("id,created_by,branch_id").eq("id", suppliedConversationId).maybeSingle();
    if (!existing || existing.created_by !== authData.user.id || existing.branch_id !== branchId) return json({ error: "المحادثة غير متاحة لهذا المستخدم أو الفرع." }, 403);
    await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  } else {
    await admin.from("ai_conversations").insert({ id: conversationId, branch_id: branchId, created_by: authData.user.id, channel, assistant: "admin_copilot", status: "active" });
  }

  await admin.from("ai_messages").insert({ conversation_id: conversationId, role: "user", content: message, created_by: authData.user.id });
  const { data: historyRows } = await admin.from("ai_messages").select("role,content").eq("conversation_id", conversationId).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(12);
  const history = (Array.isArray(historyRows) ? [...historyRows].reverse() : []).map((row: any) => ({ role: row.role as "user" | "assistant", content: safeText(row.content, 3000) }));

  const providers = [
    { provider: settings.primary_provider as ProviderName, model: settings.primary_model as string },
    ...(settings.fallback_provider && settings.fallback_model ? [{ provider: settings.fallback_provider as ProviderName, model: settings.fallback_model as string }] : []),
    ...(settings.tertiary_provider && settings.tertiary_model ? [{ provider: settings.tertiary_provider as ProviderName, model: settings.tertiary_model as string }] : []),
  ].filter((item, index, all) => all.findIndex((candidate) => candidate.provider === item.provider && candidate.model === item.model) === index);

  const started = Date.now();
  let selected = providers[0];
  let selectedAttempt = 1;
  let fallbackUsed = false;
  let final: ProviderResult | null = null;
  let finalMessages: any[] = [];
  const toolAudit: Array<{ name: string; status: "success" | "error"; duration_ms: number }> = [];

  for (let providerIndex = 0; providerIndex < providers.length && !final; providerIndex += 1) {
    selected = providers[providerIndex];
    selectedAttempt = providerIndex + 1;
    fallbackUsed = providerIndex > 0;
    const providerStarted = Date.now();
    const messages: any[] = selected.provider === "gemini" ? toGeminiHistory(history) : toOpenAiHistory(history);
    let providerError = "";

    try {
      for (let round = 0; round < 5; round += 1) {
        const answer = await callProvider(
          selected.provider,
          selected.model,
          messages,
          Math.min(60000, Math.max(5000, Number(settings.timeout_ms || 60000))),
          Math.min(8192, Math.max(512, Number(settings.max_output_tokens || 4096))),
        );
        if (!answer.toolCalls.length) { final = answer; finalMessages = messages; break; }

        const calls = [];
        for (const request of answer.toolCalls.slice(0, 5)) {
          const output = await executeTool(userClient, branchId, request, permissions, isSuperAdmin);
          toolAudit.push({ name: request.name, status: output.ok ? "success" : "error", duration_ms: output.duration_ms });
          calls.push({ request, output });
          await admin.from("ai_tool_calls").insert({ conversation_id: conversationId, user_id: authData.user.id, branch_id: branchId, tool_name: request.name, risk_level: "read", arguments: request.args, result_summary: output.ok ? output.result : { error: output.error }, status: output.ok ? "success" : "error", duration_ms: output.duration_ms });
        }
        appendToolRound(selected.provider, messages, answer, calls);
      }
      if (!final) throw new Error("TOOL_LOOP_LIMIT");
    } catch (error) {
      providerError = error instanceof Error ? error.message : "PROVIDER_FAILED";
      await admin.from("ai_usage_logs").insert({
        conversation_id: conversationId,
        user_id: authData.user.id,
        branch_id: branchId,
        provider: selected.provider,
        model: selected.model,
        fallback_used: providerIndex > 0,
        status: "error",
        latency_ms: Date.now() - providerStarted,
        error_code: providerError.slice(0, 120),
        metadata: { provider_attempt: selectedAttempt, channel, stage: "provider_attempt", milestone: "reporting_v2", response_complete: false },
      });
    }
  }

  if (!final) return json({ error: "مزودو الذكاء الاصطناعي غير متاحين حاليًا. حاول مرة أخرى بعد قليل." }, 503);

  const reply = final.text || "لم أتمكن من تكوين إجابة واضحة من البيانات المتاحة.";
  const { data: savedMessage } = await admin.from("ai_messages").insert({ conversation_id: conversationId, role: "assistant", content: reply, provider: selected.provider, model: selected.model, created_by: authData.user.id }).select("id").single();
  await admin.from("ai_usage_logs").insert({
    conversation_id: conversationId,
    user_id: authData.user.id,
    branch_id: branchId,
    provider: selected.provider,
    model: selected.model,
    fallback_used: fallbackUsed,
    status: "success",
    latency_ms: Date.now() - started,
    input_tokens: final.inputTokens || null,
    output_tokens: final.outputTokens || null,
    metadata: {
      rounds: finalMessages.length,
      channel,
      provider_attempt: selectedAttempt,
      milestone: "reporting_v2",
      finish_reason: final.finishReason || null,
      thoughts_tokens: final.thoughtsTokens || null,
      response_complete: final.finishReason !== "MAX_TOKENS",
    },
  });

  return json({
    conversation_id: conversationId,
    message_id: savedMessage?.id || crypto.randomUUID(),
    reply,
    provider: selected.provider,
    model: selected.model,
    fallback_used: fallbackUsed,
    provider_attempt: selectedAttempt,
    tool_calls: toolAudit,
    usage: { input_tokens: final.inputTokens, output_tokens: final.outputTokens, thoughts_tokens: final.thoughtsTokens },
    finish_reason: final.finishReason || null,
  });
});