import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Gauge, Pencil, Plus, RefreshCcw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money } from '../components/MetricCard';
import { useBusiness } from '../context/BusinessContext';
import { fetchExpenseBudgetWorkspace, upsertExpenseBudget, type ExpenseBudgetRow, type ExpenseBudgetWorkspace } from '../services/expenseControlV3';
import './expenses.css';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function ExpenseBudgetsPage() {
  const { selectedBranch } = useBusiness();
  const [month, setMonth] = useState(currentMonth());
  const [workspace, setWorkspace] = useState<ExpenseBudgetWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<ExpenseBudgetRow | 'new' | null>(null);

  async function load() {
    if (!selectedBranch) return;
    setLoading(true); setError(null);
    try { setWorkspace(await fetchExpenseBudgetWorkspace(selectedBranch.branch_id, `${month}-01`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل الموازنة.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [selectedBranch?.branch_id, month]);
  const summary = workspace?.summary;

  return <div className="stack-lg expense-page">
    <section className="page-intro expense-page__intro">
      <div><span className="eyebrow">Budget vs Actual</span><h2>موازنة المصروفات</h2><p>الموازنة لا تغيّر الحسابات ولا تمنع المصروف تلقائيًا؛ هي طبقة رقابة تقارن المصروف التشغيلي المعتمد بالخطة وتنبّه عند 80% و100%.</p></div>
      <div className="expense-policy-actions"><Link className="secondary-button" to="/finance/expenses"><ArrowRight size={17}/> المصروفات</Link>{workspace?.permissions.can_manage && <button className="primary-button" onClick={() => setEditing('new')}><Plus size={17}/> موازنة</button>}</div>
    </section>

    {error && <section className="engine-banner expense-error"><div><strong>تعذر تحميل الموازنة</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}
    {notice && <section className="expense-notice"><CheckCircle2 size={18}/><span>{notice}</span><button onClick={() => setNotice(null)}><X size={16}/></button></section>}

    <section className="section-card expense-toolbar"><label className="expense-month-field">شهر الموازنة<input type="month" value={month} onChange={(event) => setMonth(event.target.value)}/></label><button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCcw size={16}/> تحديث</button></section>

    <section className="expense-summary-grid">
      <BudgetSummary title="الموازنة" value={summary?.budget_amount} loading={loading}/>
      <BudgetSummary title="المصروف الفعلي" value={summary?.actual_amount} loading={loading}/>
      <BudgetSummary title="المتبقي" value={summary?.remaining_amount} loading={loading}/>
      <article className="expense-summary-card"><div className="expense-summary-card__icon"><Gauge size={20}/></div><span>نسبة الاستخدام</span><strong>{loading ? '…' : `${Number(summary?.usage_percent || 0).toLocaleString('ar-EG', { maximumFractionDigits: 1 })}%`}</strong></article>
    </section>

    <section className="expense-budget-list">
      {!loading && !workspace?.budgets.length && <article className="section-card empty-data"><span>—</span><p>لم تُحدد موازنة لهذا الشهر بعد. أضف إجمالي للفرع أو موازنات تفصيلية للبنود.</p></article>}
      {workspace?.budgets.map((row) => <article className="section-card expense-budget-row" key={row.id}>
        <div className="expense-budget-row__head"><div><span className="eyebrow">{row.group_name_ar}</span><h3>{row.category_name}</h3></div>{workspace.permissions.can_manage && <button className="expense-action neutral" onClick={() => setEditing(row)}><Pencil size={15}/> تعديل</button>}</div>
        <div className="expense-budget-values"><span>الخطة <b>{money(row.budget_amount)}</b></span><span>الفعلي <b>{money(row.actual_amount)}</b></span><span>المتبقي <b>{money(row.remaining_amount)}</b></span></div>
        <div className="expense-progress"><div style={{ width: `${Math.min(Math.max(row.usage_percent, 0), 100)}%` }}/></div>
        <div className="expense-budget-foot"><strong className={row.usage_percent >= 100 ? 'danger-text' : row.usage_percent >= 80 ? 'warning-text' : ''}>{row.usage_percent.toLocaleString('ar-EG', { maximumFractionDigits: 1 })}% مستخدم</strong><span>{row.alert_80 ? 'تنبيه 80%' : 'بدون 80%'} · {row.alert_100 ? 'تنبيه 100%' : 'بدون 100%'}</span></div>
      </article>)}
    </section>

    {editing && workspace && selectedBranch && <BudgetDialog row={editing === 'new' ? null : editing} workspace={workspace} branchId={selectedBranch.branch_id} month={`${month}-01`} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); setNotice('تم حفظ الموازنة وتحديث حدود التنبيه.'); await load(); }} onError={setError}/>} 
  </div>;
}

function BudgetSummary({ title, value, loading }: { title: string; value?: number; loading: boolean }) {
  return <article className="expense-summary-card"><div className="expense-summary-card__icon"><Gauge size={20}/></div><span>{title}</span><strong>{loading ? '…' : money(value)}</strong></article>;
}

function BudgetDialog({ row, workspace, branchId, month, onClose, onSaved, onError }: { row: ExpenseBudgetRow | null; workspace: ExpenseBudgetWorkspace; branchId: string; month: string; onClose: () => void; onSaved: () => void; onError: (message: string | null) => void }) {
  const [categoryId, setCategoryId] = useState(row?.category_id || '');
  const [amount, setAmount] = useState(String(row?.budget_amount ?? ''));
  const [alert80, setAlert80] = useState(row?.alert_80 ?? true);
  const [alert100, setAlert100] = useState(row?.alert_100 ?? true);
  const [notes, setNotes] = useState(row?.notes || '');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric < 0) return;
    setSaving(true); onError(null);
    try {
      await upsertExpenseBudget({ id: row?.id, branchId, categoryId: categoryId || null, periodMonth: month, budgetAmount: numeric, alert80, alert100, notes });
      onSaved();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'تعذر حفظ الموازنة.'); }
    finally { setSaving(false); }
  }

  return <div className="expense-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="expense-dialog" role="dialog" aria-modal="true"><header><div><h3>{row ? 'تعديل الموازنة' : 'موازنة جديدة'}</h3><p>اختر إجمالي الفرع أو بند OPEX محدد. الفعلي يُحسب من المستندات المعتمدة وليس من الدفع النقدي.</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></header>
    <form className="expense-form" onSubmit={submit}>
      <label>النطاق<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={!!row}><option value="">إجمالي مصروفات الفرع</option>{workspace.categories.map((category) => <option key={category.id} value={category.id}>{category.group_name_ar} — {category.name_ar}</option>)}</select></label>
      <label>قيمة الموازنة<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required/></label>
      <div className="expense-policy-switches"><label className="expense-switch"><input type="checkbox" checked={alert80} onChange={(event) => setAlert80(event.target.checked)}/><span><b>تنبيه عند 80%</b><small>إنذار مبكر قبل استهلاك الموازنة.</small></span></label><label className="expense-switch"><input type="checkbox" checked={alert100} onChange={(event) => setAlert100(event.target.checked)}/><span><b>تنبيه عند 100%</b><small>تنبيه مرتفع عند بلوغ أو تجاوز الخطة.</small></span></label></div>
      <label>ملاحظات<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)}/></label>
      <div className="expense-dialog__actions"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الحفظ…' : 'حفظ الموازنة'}</button></div>
    </form>
  </section></div>;
}
