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
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const providerSecretCache = new Map<string, string>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const hrAreas = ["today", "team_performance", "period_comparison", "leave_calendar"] as const;
type HrArea = typeof hrAreas[number];

const toolDeclarations = [
  {
    name: "get_hr_workspace",
    description: "اقرأ بيانات HR الحقيقية والمسموح بها للمستخدم الحالي. استخدم today لملخص اليوم والتنبيهات، team_performance لأداء الفريق خلال فترة، period_comparison لمقارنة الفترة السابقة، وleave_calendar للإجازات المعتمدة.",
    parameters: {
      type: "object",
      properties: {
        area: { type: "string", enum: hrAreas },
        days: { type: "integer", description: "عدد الأيام حتى اليوم من 1 إلى 90. الافتراضي 7، ولا يستخدم مع today." },
      },
      required: ["area"],
    },
  },
  {
    name: "get_branch_info",
    description: "اقرأ اسم وكود فرع العمل الحالي فقط.",
    parameters: { type: "object", properties: {} },
  },
];

const systemPrompt = `أنت Elmadawy HR AI، مساعد الموارد البشرية الإداري للمعداوي ماركت. رد بالعربية المصرية المهنية المختصرة.
قواعد إلزامية:
- أنت مخصص لمديري ومشرفي HR والفِرق فقط، وتلتزم بصلاحيات المستخدم والفرع الحالي.
- لا تخمّن حضور أو غياب أو تأخير أو أداء أو مهام أو إجازات. استخدم get_hr_workspace قبل ذكر أي معلومة تشغيلية متغيرة.
- لو المستخدم لم يحدد فترة لسؤال تحليلي، استخدم آخر 7 أيام واذكر الفترة المستخدمة.
- في سؤال "النهارده" أو المتابعة الحالية استخدم area=today.
- لتحليل أداء الفريق استخدم area=team_performance، وللمقارنة استخدم area=period_comparison.
- لا تعرض أرقام هواتف أو بريد أو عنوان أو أسرار أو كلمات مرور أو رموز أجهزة أو مسارات/صور تحقق الحضور.
- لا تعرض بيانات رواتب أو تعويضات أو معلومات مالية شخصية في هذه النسخة.
- لا تنشئ Score أو ترتيبًا شخصيًا من عندك. يمكنك وصف مؤشرات موثقة مثل الغياب والتأخير والمهام المتأخرة مع توضيح الفترة.
- لا تدّعي تنفيذ إجراء إداري أو عقوبة أو تعديل راتب أو حضور. هذه النسخة قراءة وتحليل فقط.
- إذا كانت البيانات غير كافية أو الأداة رفضت الصلاحية، وضّح ذلك بدون اختلاق بيانات.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function safeText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function parseToolArguments(value: unknown) {
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function withTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getProviderKey(name: "GEMINI_API_KEY" | "GROQ_API_KEY" | "OPENROUTER_API_KEY") {
  const cached = providerSecretCache.get(name);
  if (cached) return cached;
  const { data, error } = await admin.rpc("get_ai_provider_secret", { p_name: name });
  const value = typeof data === "string" ? data.trim() : "";
  if (error || !value) return null;
  providerSecretCache.set(name, value);
  return value;
}

function sanitizeForAi(value: unknown, depth = 0): unknown {
  if (depth > 7) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeForAi(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const blocked = /(password|secret|token|phone|email|address|verification_photo|photo_sha|device_key|device_token|pairing|receipt_url|provider_reference)/i;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (blocked.test(key)) continue;
    output[key] = sanitizeForAi(item, depth + 1);
  }
  return output;
}

function cairoToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function offsetDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function resolveHrRange(value: unknown) {
  const days = Math.round(clampNumber(value, 1, 90, 7));
  const to = cairoToday();
  const from = offsetDate(to, -(days - 1));
  return { from, to, days };
}

function toGeminiHistory(messages: StoredMessage[]) {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
}

function toOpenAiHistory(messages: StoredMessage[]) {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

async function callGemini(model: string, messages: unknown[], timeoutMs: number, maxTokens: number): Promise<ProviderResult> {
  const key = await getProviderKey("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_NOT_CONFIGURED");
  const transient = new Set([429, 500, 502, 503, 504]);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const isGemini3 = /^gemini-3(?:\.|-)/i.test(model);
    const generationConfig = isGemini3
      ? { maxOutputTokens: maxTokens, thinkingConfig: { thinkingLevel: "LOW" } }
      : { maxOutputTokens: maxTokens, temperature: 0.15 };

    const response = await withTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: messages,
          tools: [{ functionDeclarations: toolDeclarations }],
          generationConfig,
        }),
      },
      timeoutMs,
    );

    if (response.ok) {
      const payload = await response.json();
      const candidate = payload?.candidates?.[0] || {};
      const parts = candidate?.content?.parts || [];
      const finishReason = safeText(candidate?.finishReason, 80) || undefined;
      const thoughtsTokens = Number(payload?.usageMetadata?.thoughtsTokenCount || 0) || undefined;
      const outputTokens = Number(payload?.usageMetadata?.candidatesTokenCount || 0) || undefined;
      if (finishReason === "MAX_TOKENS") throw new Error("GEMINI_MAX_TOKENS");
      return {
        text: parts.map((part: any) => part.text || "").join("\n").trim(),
        toolCalls: parts
          .filter((part: any) => part.functionCall)
          .map((part: any) => ({
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
    } catch {
      detail = "";
    }
    if (attempt === 0 && transient.has(response.status)) {
      await sleep(700);
      continue;
    }
    throw new Error(`GEMINI_${response.status}${detail ? `_${detail}` : ""}`);
  }
  throw new Error("GEMINI_FAILED");
}

async function callOpenAiCompatible(
  provider: "groq" | "openrouter",
  model: string,
  messages: unknown[],
  timeoutMs: number,
  maxTokens: number,
): Promise<ProviderResult> {
  const key = await getProviderKey(provider === "groq" ? "GROQ_API_KEY" : "OPENROUTER_API_KEY");
  if (!key) throw new Error(`${provider.toUpperCase()}_NOT_CONFIGURED`);
  const url = provider === "groq"
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  if (provider === "openrouter") headers["X-Title"] = "Elmadawy HR AI";

  const response = await withTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      tools: toolDeclarations.map((tool) => ({ type: "function", function: tool })),
      tool_choice: "auto",
      temperature: 0.15,
      max_tokens: maxTokens,
    }),
  }, timeoutMs);
  if (!response.ok) throw new Error(`${provider.toUpperCase()}_${response.status}`);
  const payload = await response.json();
  const assistant = payload?.choices?.[0]?.message || {};
  return {
    text: assistant.content || "",
    toolCalls: (assistant.tool_calls || []).map((call: any) => ({
      name: call.function.name,
      args: parseToolArguments(call.function.arguments),
      callId: call.id || crypto.randomUUID(),
    })),
    rawAssistant: assistant,
    inputTokens: payload?.usage?.prompt_tokens,
    outputTokens: payload?.usage?.completion_tokens,
    finishReason: payload?.choices?.[0]?.finish_reason || undefined,
  };
}

async function callProvider(provider: ProviderName, model: string, messages: unknown[], timeoutMs: number, maxTokens: number) {
  if (provider === "gemini") return callGemini(model, messages, timeoutMs, maxTokens);
  return callOpenAiCompatible(provider, model, messages, timeoutMs, maxTokens);
}

async function executeTool(userClient: any, branchId: string, request: ToolRequest) {
  const started = Date.now();
  try {
    if (request.name === "get_branch_info") {
      const { data, error } = await userClient
        .from("branches")
        .select("id,name,code,active")
        .eq("id", branchId)
        .maybeSingle();
      if (error) throw new Error(error.message || "BRANCH_TOOL_FAILED");
      return { ok: true, result: sanitizeForAi(data || { found: false }), duration_ms: Date.now() - started };
    }

    if (request.name !== "get_hr_workspace") throw new Error("TOOL_NOT_ALLOWED");
    const area = safeText(request.args.area, 40) as HrArea;
    if (!hrAreas.includes(area)) throw new Error("INVALID_HR_AREA");
    const range = resolveHrRange(request.args.days);
    let rpcName = "";
    let rpcArgs: Record<string, unknown> = {};

    if (area === "today") {
      rpcName = "get_hr_workspace_dashboard_v1";
      rpcArgs = { p_branch_id: branchId, p_date: range.to };
    } else if (area === "team_performance") {
      rpcName = "get_hr_employee_performance_v1";
      rpcArgs = { p_branch_id: branchId, p_from: range.from, p_to: range.to };
    } else if (area === "period_comparison") {
      rpcName = "get_hr_manager_team_period_comparison_v1";
      rpcArgs = { p_branch_id: branchId, p_from: range.from, p_to: range.to };
    } else {
      rpcName = "get_hr_leave_calendar_v1";
      rpcArgs = { p_branch_id: branchId, p_from: range.from, p_to: range.to };
    }

    const { data, error } = await userClient.rpc(rpcName, rpcArgs);
    if (error) throw new Error(error.message || "HR_TOOL_FAILED");
    return {
      ok: true,
      result: sanitizeForAi({ area, range, data }),
      duration_ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "HR_TOOL_FAILED",
      duration_ms: Date.now() - started,
    };
  }
}

function appendToolRound(
  provider: ProviderName,
  messages: any[],
  assistant: ProviderResult,
  calls: Array<{ request: ToolRequest; output: unknown }>,
) {
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
    return;
  }

  const safeCalls = assistant.toolCalls.map((call) => ({ ...call, callId: call.callId || crypto.randomUUID() }));
  const raw = assistant.rawAssistant && typeof assistant.rawAssistant === "object"
    ? { ...(assistant.rawAssistant as Record<string, unknown>) }
    : { role: "assistant", content: assistant.text };
  (raw as any).tool_calls = safeCalls.map((call) => ({
    id: call.callId,
    type: "function",
    function: { name: call.name, arguments: JSON.stringify(call.args || {}) },
  }));
  messages.push(raw);
  calls.forEach(({ request, output }, index) => {
    messages.push({
      role: "tool",
      tool_call_id: safeCalls[index]?.callId || request.callId || crypto.randomUUID(),
      content: JSON.stringify(output),
    });
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "سجل الدخول أولاً." }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "جلسة الدخول غير صالحة." }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "طلب غير صالح." }, 400);
  }
  const message = safeText(body?.message, 3000);
  const branchId = safeText(body?.branch_id, 80);
  if (!message || !/^[0-9a-f-]{36}$/i.test(branchId)) {
    return json({ error: "الرسالة أو الفرع غير صالح." }, 400);
  }

  const [{ data: identity, error: identityError }, { data: branchContexts, error: branchesError }] = await Promise.all([
    userClient.rpc("get_my_staff_identity"),
    userClient.rpc("get_my_staff_branches"),
  ]);
  const branchContext = Array.isArray(branchContexts)
    ? branchContexts.find((item: any) => item?.branch_id === branchId)
    : null;
  const permissions = new Set<string>(Array.isArray(branchContext?.permissions) ? branchContext.permissions : []);
  const isSuperAdmin = identity?.user_id === authData.user.id && identity?.is_super_admin === true;
  const canUseHrAi = isSuperAdmin || [
    "hr.admin",
    "hr.reports.view",
    "hr.team.view",
    "hr.manage_employees",
    "hr.attendance.manage",
  ].some((permission) => permissions.has(permission));

  if (identityError || branchesError || identity?.user_id !== authData.user.id || !branchContext || !canUseHrAi) {
    return json({ error: "ليس لديك صلاحية استخدام مساعد HR AI في هذا الفرع." }, 403);
  }

  const { data: settings } = await admin
    .from("ai_runtime_settings")
    .select("*")
    .eq("scope", "global")
    .single();
  if (!settings?.enabled) return json({ error: "بوابة AI متوقفة من الإعدادات حاليًا." }, 503);

  const suppliedConversationId = /^[0-9a-f-]{36}$/i.test(body?.conversation_id || "")
    ? body.conversation_id
    : null;
  const conversationId = suppliedConversationId || crypto.randomUUID();
  if (suppliedConversationId) {
    const { data: existing } = await admin
      .from("ai_conversations")
      .select("id,created_by,branch_id,channel")
      .eq("id", suppliedConversationId)
      .maybeSingle();
    if (!existing || existing.created_by !== authData.user.id || existing.branch_id !== branchId || existing.channel !== "hr_app") {
      return json({ error: "المحادثة غير متاحة لهذا المستخدم أو الفرع." }, 403);
    }
    await admin.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  } else {
    await admin.from("ai_conversations").insert({
      id: conversationId,
      branch_id: branchId,
      created_by: authData.user.id,
      channel: "hr_app",
      assistant: "hr_copilot",
      status: "active",
    });
  }

  await admin.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: message,
    created_by: authData.user.id,
  });
  const { data: historyRows } = await admin
    .from("ai_messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(12);
  const history = (Array.isArray(historyRows) ? [...historyRows].reverse() : []).map((row: any) => ({
    role: row.role as "user" | "assistant",
    content: safeText(row.content, 3000),
  }));

  const providers = [
    { provider: settings.primary_provider as ProviderName, model: settings.primary_model as string },
    ...(settings.fallback_provider && settings.fallback_model
      ? [{ provider: settings.fallback_provider as ProviderName, model: settings.fallback_model as string }]
      : []),
    ...(settings.tertiary_provider && settings.tertiary_model
      ? [{ provider: settings.tertiary_provider as ProviderName, model: settings.tertiary_model as string }]
      : []),
  ].filter((item, index, all) =>
    all.findIndex((candidate) => candidate.provider === item.provider && candidate.model === item.model) === index
  );

  const started = Date.now();
  let final: ProviderResult | null = null;
  let selected = providers[0];
  let selectedAttempt = 1;
  let fallbackUsed = false;
  const toolAudit: Array<{ name: string; status: "success" | "error"; duration_ms: number }> = [];

  for (let providerIndex = 0; providerIndex < providers.length && !final; providerIndex += 1) {
    selected = providers[providerIndex];
    selectedAttempt = providerIndex + 1;
    fallbackUsed = providerIndex > 0;
    const providerStarted = Date.now();
    const messages: any[] = selected.provider === "gemini"
      ? toGeminiHistory(history)
      : toOpenAiHistory(history);

    try {
      for (let round = 0; round < 4; round += 1) {
        const answer = await callProvider(
          selected.provider,
          selected.model,
          messages,
          Math.min(60000, Math.max(5000, Number(settings.timeout_ms || 20000))),
          Math.min(4096, Math.max(512, Number(settings.max_output_tokens || 1200))),
        );
        if (!answer.toolCalls.length) {
          final = answer;
          break;
        }

        const calls: Array<{ request: ToolRequest; output: unknown }> = [];
        for (const request of answer.toolCalls.slice(0, 4)) {
          const output = await executeTool(userClient, branchId, request);
          toolAudit.push({
            name: request.name,
            status: output.ok ? "success" : "error",
            duration_ms: output.duration_ms,
          });
          calls.push({ request, output });
          await admin.from("ai_tool_calls").insert({
            conversation_id: conversationId,
            user_id: authData.user.id,
            branch_id: branchId,
            tool_name: request.name,
            risk_level: "read",
            arguments: request.args,
            result_summary: output.ok ? output.result : { error: output.error },
            status: output.ok ? "success" : "error",
            duration_ms: output.duration_ms,
          });
        }
        appendToolRound(selected.provider, messages, answer, calls);
      }
      if (!final) throw new Error("TOOL_LOOP_LIMIT");
    } catch (error) {
      const providerError = error instanceof Error ? error.message : "PROVIDER_FAILED";
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
        metadata: {
          provider_attempt: selectedAttempt,
          channel: "hr_app",
          stage: "provider_attempt",
          assistant: "hr_copilot",
          response_complete: false,
        },
      });
    }
  }

  if (!final) {
    return json({ error: "مزودو الذكاء الاصطناعي غير متاحين حاليًا. حاول مرة أخرى بعد قليل." }, 503);
  }

  const reply = final.text || "لم أتمكن من تكوين إجابة واضحة من بيانات HR المتاحة.";
  const { data: savedMessage } = await admin
    .from("ai_messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content: reply,
      provider: selected.provider,
      model: selected.model,
      created_by: authData.user.id,
    })
    .select("id")
    .single();

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
      channel: "hr_app",
      assistant: "hr_copilot",
      provider_attempt: selectedAttempt,
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
    usage: {
      input_tokens: final.inputTokens,
      output_tokens: final.outputTokens,
      thoughts_tokens: final.thoughtsTokens,
    },
    finish_reason: final.finishReason || null,
  });
});
