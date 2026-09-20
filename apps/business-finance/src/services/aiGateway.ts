import { supabase } from '../lib/supabase';

export type BusinessAiToolCall = {
  name: string;
  status: 'success' | 'error';
  duration_ms: number;
};

export type BusinessAiResponse = {
  conversation_id: string;
  message_id: string;
  reply: string;
  provider: 'gemini' | 'groq' | 'openrouter';
  model: string;
  fallback_used: boolean;
  provider_attempt?: number;
  tool_calls: BusinessAiToolCall[];
};

async function functionError(error: unknown) {
  try {
    const candidate = error as { context?: { json?: () => Promise<{ error?: string; message?: string }> } };
    if (candidate?.context && typeof candidate.context.json === 'function') {
      const payload = await candidate.context.json();
      return payload?.error || payload?.message;
    }
  } catch {
    // Use the safe fallback below.
  }
  return null;
}

export async function askBusinessAi(
  message: string,
  branchId: string,
  conversationId?: string | null,
): Promise<BusinessAiResponse> {
  const clean = message.trim();
  if (!clean) throw new Error('اكتب سؤالك أولاً.');
  if (!branchId) throw new Error('اختار فرع العمل أولاً.');
  if (!supabase) throw new Error('اتصال Supabase غير مهيأ.');

  const { data, error } = await supabase.functions.invoke('ai-gateway', {
    body: {
      message: clean,
      conversation_id: conversationId || null,
      branch_id: branchId,
      channel: 'business_app',
      assistant: 'business_copilot',
    },
  });

  if (error) throw new Error((await functionError(error)) || 'تعذر الاتصال بمساعد المعداوي للأعمال.');
  if (data?.error) throw new Error(data.error);
  if (!data?.reply) throw new Error('وصل رد غير مكتمل من خدمة الذكاء الاصطناعي.');
  return data as BusinessAiResponse;
}
