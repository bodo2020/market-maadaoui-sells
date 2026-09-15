import { supabase } from "@/integrations/supabase/client";

export type AiProvider = "gemini" | "groq";

export type AiToolCall = {
  name: string;
  status: "success" | "error";
  duration_ms: number;
};

export type AiGatewayResponse = {
  conversation_id: string;
  message_id: string;
  reply: string;
  provider: AiProvider;
  model: string;
  fallback_used: boolean;
  tool_calls: AiToolCall[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

export type AiRuntimeSettings = {
  enabled: boolean;
  primary_provider: AiProvider;
  primary_model: string;
  fallback_provider: AiProvider | null;
  fallback_model: string | null;
  timeout_ms: number;
  max_output_tokens: number;
  auto_reply_enabled: boolean;
};

function currentBranchId() {
  const branchId = localStorage.getItem("currentBranchId");
  if (!branchId || branchId === "null") throw new Error("اختار فرع العمل أولاً.");
  return branchId;
}

async function functionError(error: unknown) {
  try {
    const candidate = error as { context?: { json?: () => Promise<{ error?: string; message?: string }> } };
    if (candidate?.context && typeof candidate.context.json === "function") {
      const payload = await candidate.context.json();
      return payload?.error || payload?.message;
    }
  } catch {
    // Use the safe generic message below.
  }
  return null;
}

export async function askElmadawyAi(message: string, conversationId?: string | null): Promise<AiGatewayResponse> {
  const clean = message.trim();
  if (!clean) throw new Error("اكتب سؤالك أولاً.");

  const { data, error } = await supabase.functions.invoke("ai-gateway", {
    body: {
      message: clean,
      conversation_id: conversationId || null,
      branch_id: currentBranchId(),
      channel: "admin_sandbox",
      assistant: "admin_copilot",
    },
  });

  if (error) throw new Error((await functionError(error)) || "تعذر الاتصال بمساعد المعداوي.");
  if (!data?.reply) throw new Error(data?.error || "وصل رد غير مكتمل من خدمة الذكاء الاصطناعي.");
  return data as AiGatewayResponse;
}

export async function fetchAiRuntimeSettings(): Promise<AiRuntimeSettings> {
  // The generated Database type is updated after the additive migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("ai_runtime_settings")
    .select("enabled,primary_provider,primary_model,fallback_provider,fallback_model,timeout_ms,max_output_tokens,auto_reply_enabled")
    .eq("scope", "global")
    .single();
  if (error) throw new Error(error.message || "تعذر تحميل إعدادات الذكاء الاصطناعي.");
  return data as AiRuntimeSettings;
}

export async function saveAiRuntimeSettings(settings: AiRuntimeSettings) {
  // The generated Database type is updated after the additive migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { error } = await client.from("ai_runtime_settings").update({
    ...settings,
    updated_at: new Date().toISOString(),
  }).eq("scope", "global");
  if (error) throw new Error(error.message || "تعذر حفظ إعدادات الذكاء الاصطناعي.");
}
