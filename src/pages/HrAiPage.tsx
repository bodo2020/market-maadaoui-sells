import { FormEvent, useMemo, useState } from "react";
import { BarChart3, Bot, CalendarDays, Clock3, Loader2, RefreshCw, Send, Sparkles, UsersRound } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { useBranchStore } from "@/stores/branchStore";
import { askHrAi, type HrAiResponse } from "@/services/supabase/hrAiService";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: HrAiResponse;
};

const suggestions = [
  { icon: Clock3, text: "لخص وضع الفريق النهارده: الحضور والتأخير والغياب والحاجات اللي محتاجة متابعة" },
  { icon: UsersRound, text: "حلل أداء الفريق آخر 7 أيام وركز على الغياب والتأخير والمهام المتأخرة" },
  { icon: BarChart3, text: "قارن أداء الفريق آخر 7 أيام بالفترة السابقة وقولي أهم التغيرات" },
  { icon: CalendarDays, text: "إيه الإجازات المعتمدة آخر 30 يوم وهل في نمط محتاج متابعة؟" },
];

export default function HrAiPage() {
  const { currentBranchId, currentBranchName } = useBranchStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lastMeta = useMemo(
    () => [...messages].reverse().find((message) => message.meta)?.meta,
    [messages],
  );

  const send = async (event?: FormEvent, preset?: string) => {
    event?.preventDefault();
    const message = (preset ?? input).trim();
    if (!message || loading || !currentBranchId) return;

    setInput("");
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: message },
    ]);
    setLoading(true);

    try {
      const result = await askHrAi(message, currentBranchId, conversationId);
      setConversationId(result.conversation_id);
      setMessages((current) => [
        ...current,
        { id: result.message_id, role: "assistant", content: result.reply, meta: result },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : "تعذر تنفيذ الطلب.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setConversationId(null);
    setInput("");
  };

  return (
    <MainLayout>
      <div dir="rtl" className="mx-auto w-full max-w-6xl py-4 md:py-6">
        <section className="mb-4 overflow-hidden rounded-[28px] border border-emerald-950/10 bg-gradient-to-l from-[#005931] via-emerald-800 to-emerald-700 p-5 text-white shadow-sm md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur">
                <Sparkles className="h-6 w-6 text-lime-200" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-black md:text-2xl">Elmadawy HR AI</h1>
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black">Read‑Only</span>
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-emerald-50/90">
                  مساعد HR للمتابعة والتحليل من بيانات النظام الحقيقية حسب صلاحياتك، بدون تعديل حضور أو رواتب أو قرارات تلقائية.
                </p>
                <div className="mt-2 text-xs font-bold text-emerald-100">
                  الفرع: {currentBranchName || "فرع العمل الحالي"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-black transition hover:bg-white/20"
            >
              <RefreshCw className="h-4 w-4" />
              محادثة جديدة
            </button>
          </div>
        </section>

        {!currentBranchId ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center text-sm font-bold text-amber-900">
            اختار فرع العمل أولاً علشان HR AI يقرأ البيانات المسموح بها.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 md:px-5">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-[#005931]">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900">مساعد الموارد البشرية</div>
                    <div className="text-[10px] font-bold text-slate-400">بيانات فعلية + صلاحيات الفرع</div>
                  </div>
                </div>
                {lastMeta && (
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                    {lastMeta.provider} / {lastMeta.model}
                  </div>
                )}
              </div>

              <div className="h-[56vh] min-h-[430px] space-y-4 overflow-y-auto bg-slate-50/70 p-4 md:p-5">
                {!messages.length && (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-emerald-100 text-[#005931]">
                      <Sparkles className="h-8 w-8" />
                    </div>
                    <h2 className="text-lg font-black text-slate-900">اسأل عن فريقك وبيانات HR</h2>
                    <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
                      AI هيستخدم أدوات HR الموثوقة فقط، والنطاق بيتحدد تلقائيًا من دورك وصلاحياتك داخل الفرع.
                    </p>
                    <div className="mt-5 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                      {suggestions.map(({ icon: Icon, text }) => (
                        <button
                          type="button"
                          key={text}
                          onClick={() => void send(undefined, text)}
                          className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-right text-xs font-bold leading-5 text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
                        >
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#005931]" />
                          <span>{text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm ${
                        message.role === "user"
                          ? "rounded-tr-sm bg-[#005931] text-white"
                          : "rounded-tl-sm border border-slate-200 bg-white text-slate-800"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      {message.meta && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                          <span>{message.meta.provider} / {message.meta.model}</span>
                          {message.meta.fallback_used && <span>Fallback</span>}
                          {message.meta.tool_calls.map((tool, index) => (
                            <span key={`${tool.name}-${index}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                              {tool.name} · {tool.status}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-end">
                    <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500 shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-[#005931]" />
                      براجع بيانات HR…
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={(event) => void send(event)} className="border-t border-slate-100 bg-white p-3 md:p-4">
                <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-100">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    rows={2}
                    placeholder="مثال: مين محتاج متابعة النهارده؟"
                    className="min-h-[48px] flex-1 resize-none bg-transparent px-2 py-2 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#005931] text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="إرسال"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </div>
                <p className="mt-2 px-1 text-[10px] font-medium text-slate-400">
                  التحليل مساعد للقرار البشري؛ لا ينفذ تعديلًا أو عقوبة أو إجراء HR تلقائيًا.
                </p>
              </form>
            </section>

            <aside className="hidden space-y-3 lg:block">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 text-sm font-black text-slate-900">أسئلة سريعة</div>
                <div className="space-y-2">
                  {suggestions.map(({ icon: Icon, text }) => (
                    <button
                      type="button"
                      key={text}
                      onClick={() => void send(undefined, text)}
                      disabled={loading}
                      className="flex w-full items-start gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-right text-xs font-bold leading-5 text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#005931]" />
                      <span>{text}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-xs leading-6 text-emerald-950">
                <div className="font-black">نطاق آمن</div>
                <p className="mt-1">الحضور، أداء الفريق، المقارنات والإجازات المعتمدة فقط حسب صلاحياتك. بيانات الرواتب والتعويضات مستبعدة من HR AI الحالي.</p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
