import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

type ProviderName = "gemini" | "groq" | "openrouter";
type ActionType =
  | "inventory_recount_review"
  | "low_stock_review"
  | "overdue_order_followup"
  | "shift_variance_review"
  | "expense_anomaly_review"
  | "supplier_reorder_review";

type ProviderAnswer = {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  thoughtsTokens?: number;
  finishReason?: string;
};

type ActionDecision = {
  should_propose: boolean;
  action_type?: ActionType;
  title?: string;
  description?: string;
  priority?: "normal" | "high" | "urgent";
  reason?: string;
  subject_ref?: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const secretCache = new Map<string, string>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const allowedActions: ActionType[] = [
  "inventory_recount_review",
  "low_stock_review",
  "overdue_order_followup",
  "shift_variance_review",
  "expense_anomaly_review",
  "supplier_reorder_review",
];

const actionSystemPrompt = `أنت Action Planner آمن للمعداوي ماركت. مهمتك الوحيدة تحويل تحليل إداري موجود بالفعل إلى اقتراح مراجعة بشرية، وليس تنفيذ أي تغيير.

القواعد:
- اعتمد فقط على نص التحليل ونتائج الأدوات المرسلة لك. لا تخترع أرقامًا أو أحداثًا.
- لو مفيش مشكلة واضحة قابلة لإجراء، أرجع should_propose=false.
- اختر نوعًا واحدًا فقط من الأنواع التالية:
  inventory_recount_review: فرق/شك في دقة الجرد ويحتاج إعادة عد.
  low_stock_review: مخزون منخفض أو نافد ويحتاج مراجعة إعادة التوريد.
  overdue_order_followup: طلبات أونلاين متأخرة أو SLA متجاوز.
  shift_variance_review: فرق وردية/كاش/وسائل دفع يحتاج مراجعة.
  expense_anomaly_review: مصروف غير طبيعي يحتاج موافقة/مراجعة مالية.
  supplier_reorder_review: اقتراح شراء/إعادة طلب من مورد ويحتاج موافقة.
- لا تحدد موظفًا، ولا تنفذ شراء، ولا تعدل مخزونًا أو سعرًا أو حسابًا ماليًا.
- priority تكون urgent فقط لو البيانات نفسها تشير لخطر فوري واضح، وإلا high أو normal.
- العنوان قصير ومحدد. الوصف يشرح المطلوب للمراجع البشري ويشير للأدلة فقط.
- الرد JSON فقط بدون Markdown بهذا الشكل:
{"should_propose":true,"action_type":"low_stock_review","title":"...","description":"...","priority":"high","reason":"...","subject_ref":"..."}
أو {"should_propose":false,"reason":"..."}.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
}

function safeText(value: unknown, max = 1200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function withTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function getProviderKey(name: "GEMINI_API_KEY" | "GROQ_API_KEY" | "OPENROUTER_API_KEY") {
  const cached = secretCache.get(name);
  if (cached) return cached;
  const { data, error } = await admin.rpc("get_ai_provider_secret", { p_name: name });
  const vaultValue = typeof data === "string" ? data.trim() : "";
  if (!error && vaultValue) {
    secretCache.set(name, vaultValue);
    return vaultValue;
  }
  const envValue = Deno.env.get(name)?.trim();
  if (envValue) {
    secretCache.set(name, envValue);
    return envValue;
  }
  return null;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (!value || typeof value !== "object") return typeof value === "string" ? value.slice(0, 1500) : value;
  const blocked = /(purchase_price|unit_cost|cost_price|customer_phone|phone|email|address|receipt_url|provider_reference|tax_number|commercial_registration|payout_destination)/i;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!blocked.test(key)) output[key] = sanitize(item, depth + 1);
  }
  return output;
}

function parseDecision(raw: string): ActionDecision {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("ACTION_JSON_INVALID");
  const parsed = JSON.parse(clean.slice(start, end + 1)) as ActionDecision;
  if (parsed.should_propose !== true) return { should_propose: false, reason: safeText(parsed.reason, 700) || "لا يوجد إجراء واضح يحتاج إنشاء مهمة." };
  if (!parsed.action_type || !allowedActions.includes(parsed.action_type)) throw new Error("ACTION_TYPE_INVALID");
  const title = safeText(parsed.title, 200);
  if (title.length < 3) throw new Error("ACTION_TITLE_INVALID");
  const priority = ["normal", "high", "urgent"].includes(parsed.priority || "") ? parsed.priority : "normal";
  return {
    should_propose: true,
    action_type: parsed.action_type,
    title,
    description: safeText(parsed.description, 1800),
    priority: priority as "normal" | "high" | "urgent",
    reason: safeText(parsed.reason, 900),
    subject_ref: safeText(parsed.subject_ref, 200),
  };
}

async function callGemini(model: string, prompt: string, timeoutMs: number): Promise<ProviderAnswer> {
  const key = await getProviderKey("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_NOT_CONFIGURED");
  const response = await withTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: actionSystemPrompt }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 1000,
        thinkingConfig: { thinkingLevel: "LOW" },
        responseMimeType: "application/json",
      },
    }),
  }, timeoutMs);
  if (!response.ok) throw new Error(`GEMINI_${response.status}`);
  const payload = await response.json();
  const candidate = payload?.candidates?.[0] || {};
  const finishReason = safeText(candidate?.finishReason, 80) || undefined;
  if (finishReason === "MAX_TOKENS") throw new Error("GEMINI_MAX_TOKENS");
  return {
    text: (candidate?.content?.parts || []).map((part: any) => part?.text || "").join("\n").trim(),
    inputTokens: payload?.usageMetadata?.promptTokenCount,
    outputTokens: payload?.usageMetadata?.candidatesTokenCount,
    thoughtsTokens: payload?.usageMetadata?.thoughtsTokenCount,
    finishReason,
  };
}

async function callOpenAiCompatible(provider: "groq" | "openrouter", model: string, prompt: string, timeoutMs: number): Promise<ProviderAnswer> {
  const keyName = provider === "groq" ? "GROQ_API_KEY" : "OPENROUTER_API_KEY";
  const key = await getProviderKey(keyName);
  if (!key) throw new Error(`${provider.toUpperCase()}_NOT_CONFIGURED`);
  const url = provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  if (provider === "openrouter") headers["X-Title"] = "Elmadawy Market AI Action Engine";
  const response = await withTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: actionSystemPrompt }, { role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 1000,
    }),
  }, timeoutMs);
  if (!response.ok) throw new Error(`${provider.toUpperCase()}_${response.status}`);
  const payload = await response.json();
  return {
    text: payload?.choices?.[0]?.message?.content || "",
    inputTokens: payload?.usage?.prompt_tokens,
    outputTokens: payload?.usage?.completion_tokens,
    finishReason: payload?.choices?.[0]?.finish_reason || undefined,
  };
}

async function callProvider(provider: ProviderName, model: string, prompt: string, timeoutMs: number) {
  if (provider === "gemini") return callGemini(model, prompt, timeoutMs);
  return callOpenAiCompatible(provider, model, prompt, timeoutMs);
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
  const branchId = safeText(body?.branch_id, 80);
  const conversationId = safeText(body?.conversation_id, 80);
  const messageId = safeText(body?.message_id, 80);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(branchId) || !uuid.test(conversationId) || !uuid.test(messageId)) return json({ error: "بيانات التحليل غير صالحة." }, 400);

  const [{ data: identity, error: identityError }, { data: branchContexts, error: branchesError }] = await Promise.all([
    userClient.rpc("get_my_staff_identity"),
    userClient.rpc("get_my_staff_branches"),
  ]);
  const branchContext = Array.isArray(branchContexts) ? branchContexts.find((item: any) => item?.branch_id === branchId) : null;
  const permissions = new Set<string>(Array.isArray(branchContext?.permissions) ? branchContext.permissions : []);
  const isSuperAdmin = identity?.user_id === authData.user.id && identity?.is_super_admin === true;
  if (identityError || branchesError || identity?.user_id !== authData.user.id || !branchContext || (!isSuperAdmin && !permissions.has("reports.view"))) {
    return json({ error: "ليس لديك صلاحية إنشاء اقتراحات AI لهذا الفرع." }, 403);
  }

  const [{ data: conversation }, { data: assistantMessage }, { data: settings }] = await Promise.all([
    admin.from("ai_conversations").select("id,created_by,branch_id").eq("id", conversationId).maybeSingle(),
    admin.from("ai_messages").select("id,conversation_id,role,content,provider,model").eq("id", messageId).maybeSingle(),
    admin.from("ai_runtime_settings").select("*").eq("scope", "global").single(),
  ]);
  if (!conversation || conversation.created_by !== authData.user.id || conversation.branch_id !== branchId) return json({ error: "المحادثة غير متاحة." }, 403);
  if (!assistantMessage || assistantMessage.conversation_id !== conversationId || assistantMessage.role !== "assistant") return json({ error: "اختار رد AI صالح لتحويله لإجراء." }, 400);
  if (!settings?.enabled) return json({ error: "بوابة AI متوقفة حاليًا." }, 503);

  const { data: toolRows } = await admin.from("ai_tool_calls")
    .select("tool_name,arguments,result_summary,status,created_at")
    .eq("conversation_id", conversationId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(8);

  const safeTools = sanitize(Array.isArray(toolRows) ? [...toolRows].reverse() : []);
  const prompt = `حلل الرد التالي وحدد هل يوجد إجراء تشغيلي واضح يستحق Task أو Approval.\n\nرد المساعد:\n${safeText(assistantMessage.content, 6000)}\n\nأدلة الأدوات الموثوقة المرتبطة بالمحادثة:\n${JSON.stringify(safeTools).slice(0, 14000)}`;

  const providers = [
    { provider: settings.primary_provider as ProviderName, model: settings.primary_model as string },
    ...(settings.fallback_provider && settings.fallback_model ? [{ provider: settings.fallback_provider as ProviderName, model: settings.fallback_model as string }] : []),
    ...(settings.tertiary_provider && settings.tertiary_model ? [{ provider: settings.tertiary_provider as ProviderName, model: settings.tertiary_model as string }] : []),
  ].filter((item, index, all) => all.findIndex((candidate) => candidate.provider === item.provider && candidate.model === item.model) === index);

  const started = Date.now();
  let selected = providers[0];
  let answer: ProviderAnswer | null = null;
  let decision: ActionDecision | null = null;
  let selectedAttempt = 1;

  for (let index = 0; index < providers.length && !decision; index += 1) {
    selected = providers[index];
    selectedAttempt = index + 1;
    const providerStarted = Date.now();
    try {
      answer = await callProvider(selected.provider, selected.model, prompt, Math.min(60000, Math.max(5000, Number(settings.timeout_ms || 60000))));
      decision = parseDecision(answer.text);
    } catch (error) {
      await admin.from("ai_usage_logs").insert({
        conversation_id: conversationId,
        user_id: authData.user.id,
        branch_id: branchId,
        provider: selected.provider,
        model: selected.model,
        fallback_used: index > 0,
        status: "error",
        latency_ms: Date.now() - providerStarted,
        error_code: (error instanceof Error ? error.message : "ACTION_PROVIDER_FAILED").slice(0, 120),
        metadata: { channel: "admin_action_engine", provider_attempt: selectedAttempt, milestone: "actions_m3" },
      });
    }
  }

  if (!decision || !answer) return json({ error: "تعذر تكوين اقتراح آمن من التحليل الحالي." }, 503);

  await admin.from("ai_usage_logs").insert({
    conversation_id: conversationId,
    user_id: authData.user.id,
    branch_id: branchId,
    provider: selected.provider,
    model: selected.model,
    fallback_used: selectedAttempt > 1,
    status: "success",
    latency_ms: Date.now() - started,
    input_tokens: answer.inputTokens || null,
    output_tokens: answer.outputTokens || null,
    metadata: {
      channel: "admin_action_engine",
      provider_attempt: selectedAttempt,
      milestone: "actions_m3",
      finish_reason: answer.finishReason || null,
      thoughts_tokens: answer.thoughtsTokens || null,
      should_propose: decision.should_propose,
    },
  });

  if (!decision.should_propose) {
    return json({ proposal: null, reason: decision.reason || "التحليل لا يحتاج إجراء تشغيلي مباشر حاليًا.", provider: selected.provider, model: selected.model });
  }

  const { data: proposal, error: proposalError } = await userClient.rpc("create_ai_action_proposal_v1", {
    p_branch_id: branchId,
    p_conversation_id: conversationId,
    p_action_type: decision.action_type,
    p_title: decision.title,
    p_description: decision.description || null,
    p_priority: decision.priority || "normal",
    p_evidence: {
      reason: decision.reason || null,
      assistant_message_id: messageId,
      source_tools: Array.isArray(toolRows) ? toolRows.map((row: any) => row?.tool_name).filter(Boolean).slice(0, 8) : [],
    },
    p_payload: { subject_ref: decision.subject_ref || null },
    p_provider: selected.provider,
    p_model: selected.model,
  });
  if (proposalError) return json({ error: proposalError.message || "تعذر حفظ اقتراح الإجراء." }, 400);

  return json({ proposal, reason: decision.reason || null, provider: selected.provider, model: selected.model });
});