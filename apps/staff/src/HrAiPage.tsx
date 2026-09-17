import { FormEvent, useMemo, useState } from "react";
import { Bot, CheckCircle2, ClipboardList, Loader2, RefreshCw, Send, ShieldAlert, Sparkles, XCircle } from "lucide-react";
import { supabase } from "./lib/supabase";
import type { StaffBranch, StaffIdentity } from "./services/staffService";

type Proposal = {
  id: string;
  action_type: string;
  destination: "task" | "approval";
  title: string;
  description?: string | null;
  priority: "normal" | "high" | "urgent";
  status: "proposed" | "dispatched" | "rejected" | "expired" | "failed";
  task_id?: string | null;
};

type Meta = {
  conversation_id: string;
  message_id: string;
  reply: string;
  provider: string;
  model: string;
  fallback_used: boolean;
  tool_calls: Array<{ name: string; status: string; duration_ms: number }>;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: Meta;
  proposal?: Proposal | null;
  reason?: string | null;
  busy?: boolean;
  error?: string | null;
};

const suggestions = [
  "حلل الحضور النهارده وقولي الحالات اللي محتاجة مراجعة",
  "راجع تغطية الورديات وحدد أي نقص محتاج تدخل",
  "هات ملخص الإجازات القادمة وتأثيرها على تغطية الفرع",
  "راجع ملخص مسير الرواتب للشهر وحدد مؤشرات غير طبيعية بدون كشف رواتب أفراد",
  "إيه أهم متابعات HR اللي محتاجة تتحول لمهام دلوقتي؟",
];

async function functionError(error: unknown, fallback: string) {
  try {
    const context = (error as { context?: { json?: () => Promise<{ error?: string; message?: string }> } })?.context;
    if (context && typeof context.json === "function") {
      const payload = await context.json();
      return payload?.error || payload?.message || fallback;
    }
  } catch {
    // Keep the stable fallback below.
  }
  return fallback;
}

export function canUseHrAi(identity: StaffIdentity, branch: StaffBranch) {
  return identity.is_super_admin === true || branch.permissions.some((permission) => permission.startsWith("hr."));
}

export default function HrAiPage({ identity, branch }: { identity: StaffIdentity; branch: StaffBranch }) {
  const allowed = canUseHrAi(identity, branch);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastMeta = useMemo(() => [...messages].reverse().find((message) => message.meta)?.meta, [messages]);

  const patch = (id: string, next: Partial<Message>) => {
    setMessages((current) => current.map((message) => message.id === id ? { ...message, ...next } : message));
  };

  const send = async (event?: FormEvent, preset?: string) => {
    event?.preventDefault();
    const message = (preset ?? input).trim();
    if (!allowed || !message || loading) return;
    setInput("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: message }]);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-workspace-gateway", {
        body: {
          mode: "chat",
          workspace: "hr",
          message,
          conversation_id: conversationId,
          branch_id: branch.branch_id,
        },
      });
      if (error) throw new Error(await functionError(error, "تعذر الاتصال بـ HR AI"));
      if (!data?.reply) throw new Error(data?.error || "وصل رد غير مكتمل من HR AI");
      setConversationId(data.conversation_id);
      setMessages((current) => [...current, { id: data.message_id, role: "assistant", content: data.reply, meta: data as Meta }]);
    } catch (caught) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: caught instanceof Error ? caught.message : "تعذر تنفيذ الطلب.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const propose = async (message: Message) => {
    if (!message.meta || message.busy) return;
    patch(message.id, { busy: true, error: null, reason: null });
    try {
      const { data, error } = await supabase.functions.invoke("ai-workspace-gateway", {
        body: {
          mode: "propose_action",
          workspace: "hr",
          conversation_id: message.meta.conversation_id,
          message_id: message.id,
          branch_id: branch.branch_id,
        },
      });
      if (error) throw new Error(await functionError(error, "تعذر تكوين الإجراء"));
      if (data?.error) throw new Error(data.error);
      patch(message.id, { busy: false, proposal: data.proposal || null, reason: data.reason || null });
    } catch (caught) {
      patch(message.id, { busy: false, error: caught instanceof Error ? caught.message : "تعذر تكوين الإجراء" });
    }
  };

  const confirm = async (message: Message) => {
    if (!message.proposal || message.busy) return;
    patch(message.id, { busy: true, error: null });
    const { data, error } = await (supabase as any).rpc("confirm_ai_action_proposal_v1", { p_proposal_id: message.proposal.id });
    if (error) {
      patch(message.id, { busy: false, error: error.message || "تعذر إرسال الإجراء" });
      return;
    }
    patch(message.id, {
      busy: false,
      proposal: { ...message.proposal, status: data.status, task_id: data.task_id || message.proposal.task_id, destination: data.destination || message.proposal.destination },
    });
  };

  const reject = async (message: Message) => {
    if (!message.proposal || message.busy) return;
    patch(message.id, { busy: true, error: null });
    const { data, error } = await (supabase as any).rpc("reject_ai_action_proposal_v1", { p_proposal_id: message.proposal.id, p_note: null });
    if (error) {
      patch(message.id, { busy: false, error: error.message || "تعذر رفض الاقتراح" });
      return;
    }
    patch(message.id, { busy: false, proposal: { ...message.proposal, status: data.status } });
  };

  if (!allowed) {
    return <section className="profile"><ShieldAlert /><h2>HR AI غير متاح لهذا الحساب</h2><p>المساعد يظهر فقط لصلاحيات الموارد البشرية المسموح بها في الفرع.</p></section>;
  }

  return <div dir="rtl" style={{ display: "grid", gap: 14 }}>
    <section className="hero" style={{ marginBottom: 0 }}>
      <small>Elmadawy HR AI</small>
      <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}><Bot size={24} />مساعد الموارد البشرية</h1>
      <p>Analyze → Suggest → Human Confirm → Task / Approval</p>
    </section>

    <section style={{ background: "white", borderRadius: 22, border: "1px solid #e7ece9", overflow: "hidden" }}>
      <div style={{ minHeight: 380, maxHeight: "58vh", overflowY: "auto", padding: 14, background: "#f7faf8", display: "flex", flexDirection: "column", gap: 10 }}>
        {!messages.length && <div style={{ margin: "auto", textAlign: "center", maxWidth: 520 }}>
          <Sparkles size={40} color="#005931" />
          <h2>اسأل عن HR من بيانات الفرع</h2>
          <p className="muted">الحضور، الورديات، الإجازات وملخصات الرواتب. لا يعتمد قرارًا حساسًا بدون موافقة بشرية.</p>
          <div className="chips" style={{ justifyContent: "center", marginTop: 12 }}>
            {suggestions.map((suggestion) => <button key={suggestion} onClick={() => void send(undefined, suggestion)}>{suggestion}</button>)}
          </div>
        </div>}

        {messages.map((message) => <div key={message.id} style={{ alignSelf: message.role === "user" ? "flex-start" : "flex-end", maxWidth: "92%", borderRadius: 18, padding: "11px 13px", background: message.role === "user" ? "#005931" : "white", color: message.role === "user" ? "white" : "#17211c", border: message.role === "assistant" ? "1px solid #e3e9e5" : "none", lineHeight: 1.7 }}>
          <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
          {message.meta && <>
            <div style={{ fontSize: 10, opacity: .65, borderTop: "1px solid #edf1ee", marginTop: 8, paddingTop: 7 }}>{message.meta.provider} / {message.meta.model}{message.meta.fallback_used ? " • Fallback" : ""}</div>
            {!message.proposal && !message.reason && <button className="secondary" style={{ marginTop: 8 }} disabled={message.busy} onClick={() => void propose(message)}>{message.busy ? <Loader2 className="spin" /> : <ClipboardList />}حوّل التحليل لإجراء</button>}
          </>}
          {message.reason && !message.proposal && <div style={{ marginTop: 8, fontSize: 12, background: "#f1f5f2", padding: 9, borderRadius: 10 }}>{message.reason}</div>}
          {message.proposal && <div style={{ marginTop: 10, borderRadius: 12, padding: 10, background: message.proposal.destination === "approval" ? "#fff9e8" : "#edfbf3", color: "#17211c" }}>
            <strong style={{ display: "flex", gap: 6, alignItems: "center" }}>{message.proposal.destination === "approval" ? <ShieldAlert size={16} /> : <ClipboardList size={16} />}{message.proposal.title}</strong>
            {message.proposal.description && <p style={{ fontSize: 12 }}>{message.proposal.description}</p>}
            <small>{message.proposal.priority} • {message.proposal.status}</small>
            {message.proposal.status === "proposed" && <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="primary" disabled={message.busy} onClick={() => void confirm(message)}><CheckCircle2 />{message.proposal.destination === "approval" ? "إرسال للموافقة" : "إنشاء المهمة"}</button>
              <button className="secondary" disabled={message.busy} onClick={() => void reject(message)}><XCircle />رفض</button>
            </div>}
            {message.proposal.status === "dispatched" && <p style={{ margin: "8px 0 0", color: "#005931", fontWeight: 800 }}>تم الإرسال بنجاح{message.proposal.task_id ? ` • ${message.proposal.task_id.slice(0, 8)}` : ""}</p>}
          </div>}
          {message.error && <div className="error-box" style={{ marginTop: 8 }}>{message.error}</div>}
        </div>)}
        {loading && <div style={{ alignSelf: "flex-end", display: "flex", gap: 7, alignItems: "center" }}><Loader2 className="spin" />براجع بيانات HR...</div>}
      </div>

      <form onSubmit={(event) => void send(event)} style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid #e7ece9" }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="مثال: هل في نقص في تغطية ورديات بكرة؟" disabled={loading} style={{ flex: 1 }} />
        <button className="primary" disabled={loading || !input.trim()}><Send />إرسال</button>
      </form>
    </section>

    <section className="card">
      <div className="row"><div><strong>حماية HR AI</strong><p>صلاحيات الفرع + PII filtering + Audit</p></div><RefreshCw /></div>
      <p className="muted">لا تعيين، لا فصل، لا جزاء، لا تعديل راتب، ولا اعتماد إجازة تلقائيًا.</p>
      {lastMeta && <small>{lastMeta.provider} / {lastMeta.model}</small>}
    </section>
  </div>;
}
