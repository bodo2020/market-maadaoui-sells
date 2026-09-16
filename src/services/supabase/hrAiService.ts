import { supabase } from "@/integrations/supabase/client";

export type HrAiToolCall = {
  name: string;
  status: "success" | "error";
  duration_ms: number;
};

export type HrAiResponse = {
  conversation_id: string;
  message_id: string;
  reply: string;
  provider: "gemini" | "groq" | "openrouter";
  model: string;
  fallback_used: boolean;
  provider_attempt?: number;
  tool_calls: HrAiToolCall[];
};

async function functionError(error: unknown) {
  try {
    const candidate = error as { context?: { json?: () => Promise<{ error?: string; message?: string }> } };
    if (candidate?.context && typeof candidate.context.json === "function") {
      const payload = await candidate.context.json();
      return payload?.error || payload?.message;
    }
  } catch {
    // Fall through to the safe generic message.
  }
  return null;
}

export async function askHrAi(
  message: string,
  branchId: string,
  conversationId?: string | null,
): Promise<HrAiResponse> {
  const clean = message.trim();
  if (!clean) throw new Error("اكتب سؤالك أولاً.");
  if (!branchId) throw new Error("اختار فرع العمل أولاً.");

  const { data, error } = await supabase.functions.invoke("hr-ai-gateway", {
    body: {
      message: clean,
      conversation_id: conversationId || null,
      branch_id: branchId,
      channel: "hr_app",
      assistant: "hr_copilot",
    },
  });

  if (error) throw new Error((await functionError(error)) || "تعذر الاتصال بمساعد HR AI.");
  if (data?.error) throw new Error(data.error);
  if (!data?.reply) throw new Error("وصل رد غير مكتمل من خدمة HR AI.");
  return data as HrAiResponse;
}
