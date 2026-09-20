import { FormEvent, useMemo, useState } from 'react';
import { BarChart3, Bot, Boxes, Loader2, RefreshCcw, Send, Sparkles, TrendingUp, WalletCards } from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { askBusinessAi, type BusinessAiResponse } from '../services/aiGateway';
import './ai-assistant.css';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: BusinessAiResponse;
};

const suggestions = [
  { icon: TrendingUp, text: 'حلل أداء الفرع آخر 7 أيام: المبيعات والربح وأهم التغيرات' },
  { icon: BarChart3, text: 'إيه أهم التنبيهات والفرص اللي محتاجة تدخل إداري دلوقتي؟' },
  { icon: WalletCards, text: 'حلل وسائل الدفع والعمولات والمرتجعات آخر 7 أيام' },
  { icon: Boxes, text: 'إيه وضع المخزون والمنتجات اللي محتاجة متابعة؟' },
];

export default function AiAssistant() {
  const { selectedBranch } = useBusiness();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lastMeta = useMemo(
    () => [...messages].reverse().find((message) => message.meta)?.meta,
    [messages],
  );

  const send = async (event?: FormEvent, preset?: string) => {
    event?.preventDefault();
    const text = (preset ?? input).trim();
    if (!text || !selectedBranch || loading) return;

    setInput('');
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content: text }]);
    setLoading(true);

    try {
      const result = await askBusinessAi(text, selectedBranch.branch_id, conversationId);
      setConversationId(result.conversation_id);
      setMessages((current) => [
        ...current,
        { id: result.message_id, role: 'assistant', content: result.reply, meta: result },
      ]);
    } catch (cause) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: cause instanceof Error ? cause.message : 'تعذر تنفيذ الطلب.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setConversationId(null);
    setInput('');
  };

  return <div className="business-ai stack-lg">
    <section className="business-ai__hero">
      <div className="business-ai__hero-copy">
        <span className="business-ai__hero-icon"><Sparkles size={24}/></span>
        <div>
          <span className="eyebrow">Elmadawy Business AI</span>
          <h2>مساعد الأعمال والتحليلات</h2>
          <p>اسأل عن أداء الفرع والمبيعات والربحية والمخزون والمدفوعات من بيانات النظام الفعلية، بدون تنفيذ تعديلات تلقائية.</p>
          <small>الفرع الحالي: {selectedBranch?.branch_name || 'غير محدد'}</small>
        </div>
      </div>
      <button type="button" className="business-ai__reset" onClick={reset}><RefreshCcw size={16}/> محادثة جديدة</button>
    </section>

    <section className="business-ai__layout">
      <article className="business-ai__chat section-card">
        <header className="business-ai__chat-head">
          <div><span className="business-ai__bot"><Bot size={20}/></span><div><strong>مساعد المعداوي للأعمال</strong><small>Reporting V2 · Read‑Only</small></div></div>
          {lastMeta && <span className="business-ai__provider">{lastMeta.provider} / {lastMeta.model}{lastMeta.fallback_used ? ' · Fallback' : ''}</span>}
        </header>

        <div className="business-ai__messages">
          {!messages.length && <div className="business-ai__empty">
            <span className="business-ai__empty-icon"><Sparkles size={30}/></span>
            <h3>اسأل كأنك بتكلم محلل أعمال</h3>
            <p>AI بيقرأ الأدوات والتقارير المسموح بها لنفس الفرع، ومابيخمنش أرقام تشغيلية متغيرة.</p>
            <div className="business-ai__suggestions">
              {suggestions.map(({ icon: Icon, text }) => <button type="button" key={text} onClick={() => void send(undefined, text)}><Icon size={16}/><span>{text}</span></button>)}
            </div>
          </div>}

          {messages.map((message) => <div key={message.id} className={`business-ai__row business-ai__row--${message.role}`}>
            <div className={`business-ai__bubble business-ai__bubble--${message.role}`}>
              <div className="business-ai__text">{message.content}</div>
              {message.meta && <div className="business-ai__meta">
                <span>{message.meta.provider} / {message.meta.model}</span>
                {message.meta.fallback_used && <span>Fallback</span>}
                {message.meta.tool_calls.map((tool, index) => <span key={`${tool.name}-${index}`}>{tool.name} · {tool.status}</span>)}
              </div>}
            </div>
          </div>)}

          {loading && <div className="business-ai__row business-ai__row--assistant"><div className="business-ai__bubble business-ai__bubble--assistant business-ai__typing"><Loader2 size={17}/> بجمع بيانات الفرع وبحللها…</div></div>}
        </div>

        <form className="business-ai__composer" onSubmit={(event) => void send(event)}>
          <textarea
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="مثال: قارن مبيعات وربحية الفرع آخر 7 أيام…"
          />
          <button type="submit" disabled={!input.trim() || !selectedBranch || loading} aria-label="إرسال">
            {loading ? <Loader2 size={20}/> : <Send size={20}/>} 
          </button>
        </form>
      </article>

      <aside className="business-ai__side">
        <article className="section-card">
          <div className="section-heading"><div><span className="eyebrow">Quick prompts</span><h3>أسئلة سريعة</h3></div><Sparkles size={20}/></div>
          <div className="business-ai__side-prompts">
            {suggestions.map(({ icon: Icon, text }) => <button type="button" key={text} disabled={loading} onClick={() => void send(undefined, text)}><Icon size={16}/><span>{text}</span></button>)}
          </div>
        </article>
        <article className="section-card business-ai__scope">
          <strong>نطاق آمن</strong>
          <p>المساعد للقراءة والتحليل فقط. أي تغيير مالي أو مخزني أو تسعيري يفضل خاضع لمسار الموافقات البشري داخل النظام.</p>
        </article>
      </aside>
    </section>
  </div>;
}
