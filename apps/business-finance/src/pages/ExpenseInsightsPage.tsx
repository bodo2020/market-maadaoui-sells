import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCcw, ScanSearch, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money } from '../components/MetricCard';
import { useBusiness } from '../context/BusinessContext';
import { fetchExpenseAnomalies, type ExpenseAnomalyWorkspace } from '../services/expenseControlV3';
import './expenses.css';

export default function ExpenseInsightsPage() {
  const { selectedBranch } = useBusiness();
  const [days, setDays] = useState(120);
  const [workspace, setWorkspace] = useState<ExpenseAnomalyWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!selectedBranch) return;
    setLoading(true); setError(null);
    try { setWorkspace(await fetchExpenseAnomalies(selectedBranch.branch_id, days)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تشغيل مراجعة المصروفات.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [selectedBranch?.branch_id, days]);
  const summary = workspace?.summary;

  return <div className="stack-lg expense-page">
    <section className="page-intro expense-page__intro">
      <div><span className="eyebrow">Expense Review Signals</span><h2>المراجعة الذكية للمصروفات</h2><p>هذه مؤشرات للمراجعة وليست حكمًا بالتكرار أو الاحتيال. النظام لا يرفض أي مستند تلقائيًا؛ يعرض التشابه والقيم غير المعتادة للمسؤول لاتخاذ القرار.</p></div>
      <Link className="secondary-button" to="/finance/expenses"><ArrowRight size={17}/> المصروفات</Link>
    </section>

    {error && <section className="engine-banner expense-error"><div><strong>تعذر تشغيل المراجعة</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}

    <section className="expense-summary-grid">
      <InsightSummary title="إجمالي الإشارات" value={summary?.total} icon={ScanSearch} loading={loading}/>
      <InsightSummary title="مرتفعة الأولوية" value={summary?.high} icon={AlertTriangle} loading={loading}/>
      <InsightSummary title="تحتاج مراجعة" value={summary?.normal} icon={ShieldCheck} loading={loading}/>
      <article className="expense-summary-card"><div className="expense-summary-card__icon"><CheckCircle2 size={20}/></div><span>فترة الفحص</span><strong>{days.toLocaleString('ar-EG')} يوم</strong></article>
    </section>

    <section className="section-card expense-toolbar"><div><strong>نافذة التحليل</strong><p className="muted">التكرار يعتمد المستندات غير الملغاة داخل الفترة المختارة.</p></div><select className="expense-compact-select" value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={30}>30 يوم</option><option value={60}>60 يوم</option><option value={120}>120 يوم</option><option value={180}>180 يوم</option><option value={365}>365 يوم</option></select></section>

    <section className="expense-list">
      {loading ? [1,2].map((item) => <article className="expense-card expense-card--loading" key={item}><div className="skeleton wide"/><div className="skeleton medium"/></article>) : !workspace?.anomalies.length ? <article className="section-card empty-data"><CheckCircle2 size={24}/><p>لا توجد إشارات تكرار أو قيم غير معتادة وفق قواعد المراجعة الحالية.</p></article> : workspace.anomalies.map((item, index) => <article className={`expense-card expense-anomaly ${item.severity === 'high' ? 'expense-anomaly--high' : ''}`} key={`${item.type}-${item.document_id}-${index}`}>
        <header className="expense-card__head"><div className="expense-card__identity"><div className="expense-card__icon">{item.severity === 'high' ? <AlertTriangle size={19}/> : <ScanSearch size={19}/>}</div><div><strong>{item.document_number}</strong><span>{anomalyLabel(item.type)} · {item.category_name}</span></div></div><span className={`expense-status ${item.severity === 'high' ? 'expense-status--rejected' : 'expense-status--pending_approval'}`}>{item.severity === 'high' ? 'أولوية مرتفعة' : 'مراجعة'}</span></header>
        <div className="expense-card__amounts"><div><span>القيمة</span><strong>{money(item.amount)}</strong></div><div><span>المستفيد</span><strong>{item.beneficiary_name || '—'}</strong></div><div><span>رقم الفاتورة</span><strong>{item.invoice_number || '—'}</strong></div></div>
        <div className="expense-accounting-warning"><ShieldCheck size={17}/><span>{item.message}</span></div>
        <div className="expense-meta"><span>التاريخ: <b>{new Date(item.created_at).toLocaleString('ar-EG')}</b></span>{item.related_documents.length > 0 && <span>مستندات مرتبطة: <b>{item.related_documents.join('، ')}</b></span>}</div>
      </article>)}
    </section>
  </div>;
}

function InsightSummary({ title, value, icon: Icon, loading }: { title: string; value?: number; icon: typeof ScanSearch; loading: boolean }) {
  return <article className="expense-summary-card"><div className="expense-summary-card__icon"><Icon size={20}/></div><span>{title}</span><strong>{loading ? '…' : Math.round(value || 0).toLocaleString('ar-EG')}</strong></article>;
}

function anomalyLabel(type: string) {
  if (type === 'duplicate_invoice') return 'رقم فاتورة مكرر';
  if (type === 'near_duplicate') return 'مصروف متشابه';
  return 'قيمة غير معتادة';
}
