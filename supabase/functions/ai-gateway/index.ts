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
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const toolDeclarations = [
  { name: "search_products", description: "ابحث عن منتجات حقيقية في الفرع بالاسم أو الباركود. استخدمها دائمًا قبل ذكر سعر أو مخزون.", parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer" } }, required: ["query"] } },
  { name: "get_active_offers", description: "اعرض العروض النشطة والمتاحة حاليًا في الفرع.", parameters: { type: "object", properties: { limit: { type: "integer" } } } },
  { name: "get_order_status", description: "اقرأ حالة طلب حقيقي باستخدام UUID أو رقم التتبع.", parameters: { type: "object", properties: { order_ref: { type: "string" } }, required: ["order_ref"] } },
  { name: "get_branch_info", description: "اقرأ بيانات فرع العمل الحالي.", parameters: { type: "object", properties: {} } },
];

const systemPrompt = `أنت مساعد الإدارة الخاص بالمعداوي ماركت. رد بالعربية المصرية المهنية المختصرة.
قواعد إلزامية:
- لا تخمّن سعرًا أو مخزونًا أو عرضًا أو حالة طلب؛ استخدم الأداة المناسبة أولًا.
- اعرض الكمية ووحدة القياس كما رجعت من الأداة، واذكر أن عدم ظهور المنتج لا يثبت عدم وجوده إذا كان البحث غير واضح.
- لا تطلب ولا تعرض purchase_price أو أسرار أو بيانات عميل غير لازمة.
- لا تدّعي تنفيذ تعديل. هذه النسخة قراءة فقط، وأي طلب تعديل اشرح أنه يحتاج موافقة بشرية.
- لو الأداة فشلت أو البيانات غير كافية، قل ذلك بوضوح من غير اختلاق إجابة.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
}

function safeText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function withTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function callGemini(model: string, messages: unknown[], timeoutMs: number, maxTokens: number): Promise<ProviderResult> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_NOT_CONFIGURED");
  const response = await withTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: messages,
      tools: [{ functionDeclarations: toolDeclarations }],
      generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
    }),
  }, timeoutMs);
  if (!response.ok) throw new Error(`GEMINI_${response.status}`);
  const payload = await response.json();
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return {
    text: parts.map((part: any) => part.text || "").join("\n").trim(),
    toolCalls: parts.filter((part: any) => part.functionCall).map((part: any) => ({ name: part.functionCall.name, args: part.functionCall.args || {} })),
    rawAssistant: payload?.candidates?.[0]?.content,
    inputTokens: payload?.usageMetadata?.promptTokenCount,
    outputTokens: payload?.usageMetadata?.candidatesTokenCount,
  };
}

async function callGroq(model: string, messages: unknown[], timeoutMs: number, maxTokens: number): Promise<ProviderResult> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_NOT_CONFIGURED");
  const response = await withTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, ...messages], tools: toolDeclarations.map((tool) => ({ type: "function", function: tool })), tool_choice: "auto", temperature: 0.2, max_tokens: maxTokens }),
  }, timeoutMs);
  if (!response.ok) throw new Error(`GROQ_${response.status}`);
  const payload = await response.json();
  const assistant = payload?.choices?.[0]?.message || {};
  return {
    text: assistant.content || "",
    toolCalls: (assistant.tool_calls || []).map((call: any) => ({ name: call.function.name, args: JSON.parse(call.function.arguments || "{}"), callId: call.id })),
    rawAssistant: assistant,
    inputTokens: payload?.usage?.prompt_tokens,
    outputTokens: payload?.usage?.completion_tokens,
  };
}

async function callOpenRouter(model: string, messages: unknown[], timeoutMs: number, maxTokens: number): Promise<ProviderResult> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_NOT_CONFIGURED");
  const response = await withTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "X-Title": "Elmadawy Market AI Gateway",
    },
    body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, ...messages], tools: toolDeclarations.map((tool) => ({ type: "function", function: tool })), tool_choice: "auto", temperature: 0.2, max_tokens: maxTokens }),
  }, timeoutMs);
  if (!response.ok) throw new Error(`OPENROUTER_${response.status}`);
  const payload = await response.json();
  const assistant = payload?.choices?.[0]?.message || {};
  return {
    text: assistant.content || "",
    toolCalls: (assistant.tool_calls || []).map((call: any) => ({ name: call.function.name, args: JSON.parse(call.function.arguments || "{}"), callId: call.id })),
    rawAssistant: assistant,
    inputTokens: payload?.usage?.prompt_tokens,
    outputTokens: payload?.usage?.completion_tokens,
  };
}

async function callProvider(provider: ProviderName, model: string, messages: unknown[], timeoutMs: number, maxTokens: number) {
  if (provider === "gemini") return callGemini(model, messages, timeoutMs, maxTokens);
  if (provider === "groq") return callGroq(model, messages, timeoutMs, maxTokens);
  return callOpenRouter(model, messages, timeoutMs, maxTokens);
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
      id: row?.id,
      record_type: row?.record_type,
      name: row?.name,
      barcode: row?.barcode,
      price: row?.price,
      offer_price: row?.offer_price,
      is_offer: row?.is_offer,
      quantity: row?.quantity,
      unit_of_measure: row?.unit_of_measure,
      stock_status: row?.stock_status,
    }));
    if (request.name === "search_products") {
      if (!isSuperAdmin && !permissions.has("inventory.manage") && !permissions.has("products.manage")) throw new Error("TOOL_PERMISSION_DENIED");
      result = safeCatalog(await rpc("get_product_management_catalog", { p_branch_id: branchId, p_search: safeText(request.args.query, 120), p_company_id: null, p_category_id: null, p_limit: Math.min(20, Math.max(1, Number(request.args.limit || 8))), p_offset: 0 }));
    } else if (request.name === "get_active_offers") {
      if (!isSuperAdmin && !permissions.has("inventory.manage") && !permissions.has("products.manage")) throw new Error("TOOL_PERMISSION_DENIED");
      const rows = await rpc("get_product_management_catalog", { p_branch_id: branchId, p_search: null, p_company_id: null, p_category_id: null, p_limit: 200, p_offset: 0 });
      result = safeCatalog(rows).filter((row: any) => row?.is_offer).slice(0, Math.min(30, Math.max(1, Number(request.args.limit || 10))));
    } else if (request.name === "get_order_status") {
      if (!isSuperAdmin && !permissions.has("online_orders.view") && !permissions.has("online_orders.manage")) throw new Error("TOOL_PERMISSION_DENIED");
      const orderRef = safeText(request.args.order_ref, 120);
      if (!/^[a-zA-Z0-9-]{1,120}$/.test(orderRef)) throw new Error("INVALID_ORDER_REFERENCE");
      const { data, error } = await userClient.from("online_orders").select("id,tracking_number,status,payment_status,total,created_at,updated_at").eq("branch_id", branchId).or(`id.eq.${orderRef},tracking_number.eq.${orderRef}`).limit(1).maybeSingle();
      if (error) throw new Error(error.message || "TOOL_FAILED");
      result = data ? { found: true, ...data } : { found: false };
    } else if (request.name === "get_branch_info") {
      const { data, error } = await userClient.from("branches").select("id,name,code,active").eq("id", branchId).maybeSingle();
      if (error) throw new Error(error.message || "TOOL_FAILED");
      result = data || { found: false };
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
    messages.push({ role: "user", parts: calls.map(({ request, output }) => ({ functionResponse: { name: request.name, response: output } })) });
  } else {
    messages.push(assistant.rawAssistant || { role: "assistant", content: assistant.text });
    for (const { request, output } of calls) messages.push({ role: "tool", tool_call_id: request.callId, content: JSON.stringify(output) });
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
    if (!existing || existing.created_by !== authData.user.id || existing.branch_id !== branchId) {
      return json({ error: "المحادثة غير متاحة لهذا المستخدم أو الفرع." }, 403);
    }
    await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  } else {
    await admin.from("ai_conversations").insert({ id: conversationId, branch_id: branchId, created_by: authData.user.id, channel, assistant: "admin_copilot", status: "active" });
  }
  await admin.from("ai_messages").insert({ conversation_id: conversationId, role: "user", content: message, created_by: authData.user.id });

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
  let providerError = "";

  for (let providerIndex = 0; providerIndex < providers.length && !final; providerIndex += 1) {
    selected = providers[providerIndex];
    selectedAttempt = providerIndex + 1;
    fallbackUsed = providerIndex > 0;
    const messages: any[] = selected.provider === "gemini" ? [{ role: "user", parts: [{ text: message }] }] : [{ role: "user", content: message }];
    try {
      for (let round = 0; round < 4; round += 1) {
        const answer = await callProvider(selected.provider, selected.model, messages, Math.min(60000, Math.max(5000, Number(settings.timeout_ms || 20000))), Math.min(4096, Math.max(128, Number(settings.max_output_tokens || 800))));
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
    }
  }

  if (!final) {
    await admin.from("ai_usage_logs").insert({ conversation_id: conversationId, user_id: authData.user.id, branch_id: branchId, provider: selected.provider, model: selected.model, fallback_used: fallbackUsed, status: "error", latency_ms: Date.now() - started, error_code: providerError.slice(0, 120), metadata: { provider_attempt: selectedAttempt, channel } });
    return json({ error: "مزودو الذكاء الاصطناعي غير متاحين حاليًا. حاول مرة أخرى بعد قليل." }, 503);
  }

  const reply = final.text || "لم أتمكن من تكوين إجابة واضحة من البيانات المتاحة.";
  const { data: savedMessage } = await admin.from("ai_messages").insert({ conversation_id: conversationId, role: "assistant", content: reply, provider: selected.provider, model: selected.model, created_by: authData.user.id }).select("id").single();
  await admin.from("ai_usage_logs").insert({ conversation_id: conversationId, user_id: authData.user.id, branch_id: branchId, provider: selected.provider, model: selected.model, fallback_used: fallbackUsed, status: "success", latency_ms: Date.now() - started, input_tokens: final.inputTokens || null, output_tokens: final.outputTokens || null, metadata: { rounds: finalMessages.length, channel, provider_attempt: selectedAttempt } });

  return json({ conversation_id: conversationId, message_id: savedMessage?.id || crypto.randomUUID(), reply, provider: selected.provider, model: selected.model, fallback_used: fallbackUsed, provider_attempt: selectedAttempt, tool_calls: toolAudit, usage: { input_tokens: final.inputTokens, output_tokens: final.outputTokens } });
});
