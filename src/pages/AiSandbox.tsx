import { FormEvent, useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  Boxes,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Loader2,
  PackageSearch,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AiActionProposal,
  AiGatewayResponse,
  askElmadawyAi,
  confirmAiActionProposal,
  proposeAiAction,
  rejectAiActionProposal,
} from "@/services/supabase/aiGatewayService";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: AiGatewayResponse;
  action?: AiActionProposal | null;
  actionReason?: string | null;
  actionError?: string | null;
  actionLoading?: boolean;
};

const suggestions = [
  "حلل أداء الفرع آخر 7 أيام: المبيعات والربح وأهم التغيرات",
  "هات أهم AI Insights والتنبيهات اللي محتاجة تدخل دلوقتي",
  "إيه الأصناف النافدة والمنخفضة والمخزون اللي مفيهوش حركة؟",
  "حلل وسائل الدفع والعمولات والمرتجعات آخر 7 أيام",
  "مين أعلى الكاشير في المبيعات وهل في فروق ورديات؟",
  "عندنا لبن جهينة؟ وقولي السعر والمخزون",
];

const priorityLabel: Record<AiActionProposal["priority"], string> = {
  normal: "عادية",
  high: "عالية",
  urgent: "عاجلة",
};

export default function AiSandbox() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastMeta = useMemo(() => [...messages].reverse().find((message) => message.meta)?.meta, [messages]);

  const updateMessage = (messageId: string, patch: Partial<ChatMessage>) => {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, ...patch } : message));
  };

  const send = async (event?: FormEvent, preset?: string) => {
    event?.preventDefault();
    const message = (preset ?? input).trim();
    if (!message || loading) return;
    setInput("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: message }]);
    setLoading(true);
    try {
      const result = await askElmadawyAi(message, conversationId);
      setConversationId(result.conversation_id);
      setMessages((current) => [...current, { id: result.message_id, role: "assistant", content: result.reply, meta: result }]);
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: error instanceof Error ? error.message : "تعذر تنفيذ الطلب." }]);
    } finally {
      setLoading(false);
    }
  };

  const buildAction = async (message: ChatMessage) => {
    if (!message.meta || message.actionLoading) return;
    updateMessage(message.id, { actionLoading: true, actionError: null, actionReason: null });
    try {
      const result = await proposeAiAction(message.meta.conversation_id, message.id);
      updateMessage(message.id, {
        actionLoading: false,
        action: result.proposal,
        actionReason: result.reason || null,
      });
    } catch (error) {
      updateMessage(message.id, {
        actionLoading: false,
        actionError: error instanceof Error ? error.message : "تعذر تكوين اقتراح الإجراء.",
      });
    }
  };

  const confirmAction = async (message: ChatMessage) => {
    if (!message.action || message.actionLoading) return;
    updateMessage(message.id, { actionLoading: true, actionError: null });
    try {
      const result = await confirmAiActionProposal(message.action.id);
      updateMessage(message.id, {
        actionLoading: false,
        action: {
          ...message.action,
          status: result.status,
          task_id: result.task_id || message.action.task_id,
          action_url: result.action_url || message.action.action_url,
          due_at: result.due_at || message.action.due_at,
          destination: result.destination || message.action.destination,
        },
      });
    } catch (error) {
      updateMessage(message.id, {
        actionLoading: false,
        actionError: error instanceof Error ? error.message : "تعذر إرسال الإجراء.",
      });
    }
  };

  const rejectAction = async (message: ChatMessage) => {
    if (!message.action || message.actionLoading) return;
    updateMessage(message.id, { actionLoading: true, actionError: null });
    try {
      const result = await rejectAiActionProposal(message.action.id);
      updateMessage(message.id, {
        actionLoading: false,
        action: { ...message.action, status: result.status },
      });
    } catch (error) {
      updateMessage(message.id, {
        actionLoading: false,
        actionError: error instanceof Error ? error.message : "تعذر رفض الاقتراح.",
      });
    }
  };

  const openAction = (action: AiActionProposal) => {
    navigate(action.action_url || (action.destination === "approval" ? "/approvals" : "/tasks"));
  };

  const reset = () => { setMessages([]); setConversationId(null); setInput(""); };

  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl py-5" dir="rtl">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/elmadawy-logo.png" alt="المعداوي" className="h-14 w-14 rounded-2xl object-cover shadow-sm" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black text-slate-950 md:text-3xl">Elmadawy AI للإدارة</h1>
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Reporting V2</Badge>
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Action Engine M3</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">يحلل بيانات الفرع ثم يحول التحليل - بعد تأكيدك - إلى Task أو Approval داخل النظام.</p>
            </div>
          </div>
          <Button variant="outline" onClick={reset}><RefreshCw className="ml-2 h-4 w-4" />محادثة جديدة</Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <Card className="overflow-hidden border-emerald-950/10 shadow-sm">
            <CardHeader className="border-b bg-gradient-to-l from-[#005931] to-emerald-800 text-white">
              <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-lime-300" />مساعد الإدارة والتحليلات والإجراءات</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[60vh] min-h-[460px] space-y-4 overflow-y-auto bg-slate-50/70 p-4 md:p-6">
                {!messages.length && (
                  <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
                    <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-emerald-100 text-[#005931]"><Bot className="h-8 w-8" /></div>
                    <h2 className="text-xl font-black">اسأل عن الفرع كأنك بتكلم محلل أعمال</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">بعد أي تحليل تقدر تطلب من Action Engine تحويل النتيجة إلى اقتراح مهمة أو مراجعة موافقة، بدون تنفيذ تلقائي.</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {suggestions.map((suggestion) => (
                        <button key={suggestion} onClick={() => void send(undefined, suggestion)} className="rounded-full border bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50">{suggestion}</button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm ${message.role === "user" ? "rounded-tr-sm bg-[#005931] text-white" : "rounded-tl-sm border bg-white text-slate-800"}`}>
                      <div className="whitespace-pre-wrap">{message.content}</div>

                      {message.meta && (
                        <>
                          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                            <span>{message.meta.provider} / {message.meta.model}</span>
                            {message.meta.fallback_used && <Badge variant="outline" className="h-5 text-[9px]">Fallback</Badge>}
                            {message.meta.tool_calls.map((tool, index) => <Badge key={`${tool.name}-${index}`} variant="secondary" className="h-5 text-[9px]">{tool.name} · {tool.duration_ms}ms</Badge>)}
                          </div>

                          {!message.action && !message.actionReason && (
                            <div className="mt-3 border-t border-slate-100 pt-3">
                              <Button size="sm" variant="outline" onClick={() => void buildAction(message)} disabled={message.actionLoading} className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100">
                                {message.actionLoading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ClipboardList className="ml-2 h-4 w-4" />}
                                حوّل التحليل لإجراء
                              </Button>
                              <p className="mt-1 text-[10px] leading-5 text-slate-400">لن يتم إنشاء أي مهمة أو موافقة قبل تأكيدك.</p>
                            </div>
                          )}
                        </>
                      )}

                      {message.actionReason && !message.action && (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-600">
                          <div className="flex items-center gap-2 font-bold text-slate-800"><ShieldCheck className="h-4 w-4 text-[#005931]" />لا يحتاج إجراء مباشر</div>
                          <p className="mt-1">{message.actionReason}</p>
                        </div>
                      )}

                      {message.action && (
                        <div className={`mt-3 rounded-2xl border p-3 ${message.action.destination === "approval" ? "border-amber-200 bg-amber-50/70" : "border-emerald-200 bg-emerald-50/70"}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-black text-slate-900">
                              {message.action.destination === "approval" ? <ShieldAlert className="h-4 w-4 text-amber-700" /> : <ClipboardList className="h-4 w-4 text-[#005931]" />}
                              {message.action.destination === "approval" ? "اقتراح يحتاج موافقة" : "اقتراح مهمة تشغيلية"}
                            </div>
                            <div className="flex gap-1">
                              <Badge variant="outline">{priorityLabel[message.action.priority]}</Badge>
                              <Badge variant="secondary">{message.action.status}</Badge>
                            </div>
                          </div>
                          <h3 className="mt-2 font-black text-slate-900">{message.action.title}</h3>
                          {message.action.description && <p className="mt-1 text-xs leading-6 text-slate-600">{message.action.description}</p>}

                          {message.action.status === "proposed" && (
                            <div className="mt-3 flex flex-wrap gap-2 border-t border-black/5 pt-3">
                              <Button size="sm" onClick={() => void confirmAction(message)} disabled={message.actionLoading} className="bg-[#005931] hover:bg-emerald-800">
                                {message.actionLoading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}
                                {message.action.destination === "approval" ? "إرسال للموافقة" : "إنشاء المهمة"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => void rejectAction(message)} disabled={message.actionLoading} className="text-slate-600">
                                <XCircle className="ml-2 h-4 w-4" />رفض الاقتراح
                              </Button>
                            </div>
                          )}

                          {message.action.status === "dispatched" && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3">
                              <span className="flex items-center gap-1 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" />تم الإرسال بنجاح</span>
                              <Button size="sm" variant="outline" onClick={() => openAction(message.action!)}>
                                <ExternalLink className="ml-2 h-4 w-4" />
                                {message.action.destination === "approval" ? "فتح مركز الموافقات" : "فتح مركز المهام"}
                              </Button>
                            </div>
                          )}

                          {message.action.status === "rejected" && <p className="mt-3 border-t border-black/5 pt-3 text-xs font-bold text-slate-500">تم رفض الاقتراح ولم تُنشأ مهمة.</p>}
                          {message.action.status === "expired" && <p className="mt-3 border-t border-black/5 pt-3 text-xs font-bold text-amber-700">انتهت صلاحية الاقتراح. اطلب اقتراحًا جديدًا من التحليل الحالي.</p>}
                        </div>
                      )}

                      {message.actionError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{message.actionError}</p>}
                    </div>
                  </div>
                ))}

                {loading && <div className="flex justify-end"><div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border bg-white px-4 py-3 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin text-[#005931]" />براجع Reporting V2 وبيانات الفرع...</div></div>}
              </div>

              <form onSubmit={(event) => void send(event)} className="flex gap-2 border-t bg-white p-3 md:p-4">
                <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="مثال: ليه صافي الربح نزل آخر 7 أيام؟" className="h-12 rounded-xl" disabled={loading} />
                <Button type="submit" className="h-12 bg-[#005931] px-5 hover:bg-emerald-800" disabled={loading || !input.trim()}><Send className="ml-2 h-4 w-4" />إرسال</Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">حالة الجلسة</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">المحادثة</span><span className="font-mono text-xs">{conversationId ? conversationId.slice(0, 8) : "جديدة"}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">المزود</span><span className="font-bold">{lastMeta?.provider || "—"}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Fallback</span><span>{lastMeta?.fallback_used ? "تم استخدامه" : "لا"}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Action Engine M3</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#005931]" />تحليل من Reporting V2</div>
                <div className="flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-[#005931]" />تحديد مشكلة وإجراء مناسب</div>
                <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-[#005931]" />Task Center للمراجعات التشغيلية</div>
                <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-700" />Approval Center للمالية والمشتريات</div>
                <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#005931]" />صلاحيات + Audit + منع التكرار</div>
                <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">قاعدة التنفيذ: Read → Analyze → Recommend → Human Confirm → Task/Approval. الـAI لا يعدل مخزونًا أو سعرًا أو أموالًا مباشرة.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">ما زال متاحًا</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-[#005931]" />المدفوعات والمصروفات والديون</div>
                <div className="flex items-center gap-2"><Boxes className="h-4 w-4 text-[#005931]" />المخزون والتحويلات والحركة</div>
                <div className="flex items-center gap-2"><PackageSearch className="h-4 w-4 text-[#005931]" />المنتجات والعروض والطلبات</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
