import { supabase } from "@/integrations/supabase/client";

export type AiProvider = "gemini" | "groq" | "openrouter";

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
  provider_attempt?: number;
  tool_calls: AiToolCall[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

export type AiActionProposal = {
  id: string;
  action_type: string;
  destination: "task" | "approval";
  title: string;
  description?: string | null;
  priority: "normal" | "high" | "urgent";
  status: "proposed" | "dispatched" | "rejected" | "expired" | "failed";
  expires_at?: string | null;
  task_id?: string | null;
  action_url?: string | null;
  due_at?: string | null;
};

export type AiActionSuggestionResponse = {
  proposal: AiActionProposal | null;
  reason?: string | null;
  provider?: AiProvider;
  model?: string;
};

export type AiActionDispatchResult = {
  proposal_id: string;
  status: AiActionProposal["status"];
  task_id?: string | null;
  destination?: "task" | "approval";
  source_kind?: string;
  due_at?: string | null;
  action_url?: string | null;
};

export type AiRuntimeSettings = {
  enabled: boolean;
  primary_provider: AiProvider;
  primary_model: string;
  fallback_provider: AiProvider | null;
  fallback_model: string | null;
  tertiary_provider: AiProvider | null;
  tertiary_model: string | null;
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

export async function proposeAiAction(conversationId: string, messageId: string): Promise<AiActionSuggestionResponse> {
  const { data, error } = await supabase.functions.invoke("ai-action-engine", {
    body: {
      conversation_id: conversationId,
      message_id: messageId,
      branch_id: currentBranchId(),
    },
  });
  if (error) throw new Error((await functionError(error)) || "تعذر تكوين اقتراح إجراء من التحليل.");
  if (data?.error) throw new Error(data.error);
  return data as AiActionSuggestionResponse;
}

export async function confirmAiActionProposal(proposalId: string): Promise<AiActionDispatchResult> {
  // RPC exists in the additive Milestone 3 migration before generated types are refreshed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client.rpc("confirm_ai_action_proposal_v1", { p_proposal_id: proposalId });
  if (error) throw new Error(error.message || "تعذر إرسال الإجراء لمركز المهام أو الموافقات.");
  return data as AiActionDispatchResult;
}

export async function rejectAiActionProposal(proposalId: string, note?: string): Promise<AiActionDispatchResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client.rpc("reject_ai_action_proposal_v1", {
    p_proposal_id: proposalId,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message || "تعذر رفض اقتراح الإجراء.");
  return data as AiActionDispatchResult;
}

export async function fetchAiRuntimeSettings(): Promise<AiRuntimeSettings> {
  // The generated Database type is updated after the additive migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client
    .from("ai_runtime_settings")
    .select("enabled,primary_provider,primary_model,fallback_provider,fallback_model,tertiary_provider,tertiary_model,timeout_ms,max_output_tokens,auto_reply_enabled")
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
