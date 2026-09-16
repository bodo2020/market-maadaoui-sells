import { FormEvent, useMemo, useState } from "react";
import { BarChart3, Bot, Boxes, PackageSearch, RefreshCw, Send, ShieldCheck, Sparkles, TriangleAlert, WalletCards } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { askElmadawyAi, AiGatewayResponse } from "@/services/supabase/aiGatewayService";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; meta?: AiGatewayResponse };

const suggestions = [
  "حلل أداء الفرع آخر 7 أيام: المبيعات والربح وأهم التغيرات",
  "هات أهم AI Insights والتنبيهات اللي محتاجة تدخل دلوقتي",
  "إيه الأصناف النافدة والمنخفضة والمخزون اللي مفيهوش حركة؟",
  "حلل وسائل الدفع والعمولات والمرتجعات آخر 7 أيام",
  "مين أعلى الكاشير في المبيعات وهل في فروق ورديات؟",
  "عندنا لبن جهينة؟ وقولي السعر والمخزون",
];

export default function AiSandbox() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastMeta = useMemo(() => [...messages].reverse().find((message) => message.meta)?.meta, [messages]);

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

  const reset = () => { setMessages([]); setConversationId(null); setInput(""); };

  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl py-5" dir="rtl">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/elmadawy-logo.png" alt="المعداوي" className="h-14 w-14 rounded-2xl object-cover shadow-sm" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-950 md:text-3xl">Elmadawy AI للإدارة</h1>
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Reporting V2</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">مساعد تحليلي يقرأ بيانات الفرع الحقيقية من Reporting V2 ويعرض Insights موثقة بصلاحيات المستخدم.</p>
            </div>
          </div>
          <Button variant="outline" onClick={reset}><RefreshCw className="ml-2 h-4 w-4" />محادثة جديدة</Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden border-emerald-950/10 shadow-sm">
            <CardHeader className="border-b bg-gradient-to-l from-[#005931] to-emerald-800 text-white">
              <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-lime-300" />مساعد الإدارة والتحليلات</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[56vh] min-h-[420px] space-y-4 overflow-y-auto bg-slate-50/70 p-4 md:p-6">
                {!messages.length && (
                  <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
                    <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-emerald-100 text-[#005931]"><Bot className="h-8 w-8" /></div>
                    <h2 className="text-xl font-black">اسأل عن الفرع كأنك بتكلم محلل أعمال</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">المبيعات والربح والمدفوعات والمرتجعات والمخزون والكاشير والعملاء والمصروفات والطلبات الأونلاين كلها من نفس مصادر Reporting V2.</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {suggestions.map((suggestion) => (
                        <button key={suggestion} onClick={() => void send(undefined, suggestion)} className="rounded-full border bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50">{suggestion}</button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm ${message.role === "user" ? "rounded-tr-sm bg-[#005931] text-white" : "rounded-tl-sm border bg-white text-slate-800"}`}>
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      {message.meta && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                          <span>{message.meta.provider} / {message.meta.model}</span>
                          {message.meta.fallback_used && <Badge variant="outline" className="h-5 text-[9px]">Fallback</Badge>}
                          {message.meta.tool_calls.map((tool, index) => <Badge key={`${tool.name}-${index}`} variant="secondary" className="h-5 text-[9px]">{tool.name} · {tool.duration_ms}ms</Badge>)}
                        </div>
                      )}
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
              <CardHeader><CardTitle className="text-base">قدرات Milestone 2</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#005931]" />المبيعات والربحية والمنتجات</div>
                <div className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-[#005931]" />المدفوعات والمصروفات والديون</div>
                <div className="flex items-center gap-2"><Boxes className="h-4 w-4 text-[#005931]" />المخزون والتحويلات والحركة</div>
                <div className="flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-[#005931]" />AI Insights وتنبيهات تشغيلية</div>
                <div className="flex items-center gap-2"><PackageSearch className="h-4 w-4 text-[#005931]" />المنتجات والعروض والطلبات</div>
                <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#005931]" />صلاحيات الفرع + Audit لكل Tool</div>
                <p className="rounded-xl bg-slate-50 p-3 text-xs leading-6 text-muted-foreground">الـAI قراءة فقط. البيانات الشخصية وأسعار الشراء الخام تُحجب قبل إرسال نتيجة الـTool للموديل، وأي أرقام ربح/مالية تتبع صلاحيات Reporting V2 نفسها.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}