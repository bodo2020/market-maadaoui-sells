import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CalendarClock, CheckCircle2, PauseCircle, PlayCircle, Plus, RefreshCcw, RotateCcw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money } from '../components/MetricCard';
import { useBusiness } from '../context/BusinessContext';
import { fetchRecurringExpenseWorkspace, runDueRecurringExpenses, upsertRecurringExpenseRule, type RecurringCadence, type RecurringExpenseRule, type RecurringExpenseWorkspace } from '../services/expenseControlV3';
import './expenses.css';

const cadenceLabels: Record<RecurringCadence, string> = { weekly: 'أسبوعي', monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي' };

export default function RecurringExpensesPage() {
  const { selectedBranch } = useBusiness();
  const [workspace, setWorkspace] = useState<RecurringExpenseWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecurringExpenseRule | 'new' | null>(null);

  async function load() {
    if (!selectedBranch) return;
    setLoading(true); setError(null);
    try { setWorkspace(await fetchRecurringExpenseWorkspace(selectedBranch.branch_id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل المصروفات الدورية.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [selectedBranch?.branch_id]);

  async function runNow() {
    if (!selectedBranch) return;
    setRunning(true); setError(null);
    try {
      const result = await runDueRecurringExpenses(selectedBranch.branch_id);
      setNotice(result.generated > 0 ? `تم إنشاء ${result.generated} مستند مستحق لهذا الفرع.` : 'لا توجد مصروفات دورية مستحقة الآن.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تشغيل القواعد المستحقة.'); }
    finally { setRunning(false); }
  }

  async function toggle(rule: RecurringExpenseRule) {
    if (!selectedBranch) return;
    setError(null);
    try {
      await upsertRecurringExpenseRule({
        id: rule.id, branchId: selectedBranch.branch_id, categoryId: rule.category_id, amount: rule.amount, description: rule.description,
        beneficiaryName: rule.beneficiary_name || undefined, taxAmount: rule.tax_amount, cadence: rule.cadence, nextRunDate: rule.next_run_date,
        endDate: rule.end_date || undefined, autoSubmit: rule.auto_submit, active: !rule.active, notes: rule.notes || undefined,
      });
      setNotice(rule.active ? 'تم إيقاف القاعدة الدورية.' : 'تم تفعيل القاعدة الدورية.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحديث القاعدة.'); }
  }

  return <div className="stack-lg expense-page">
    <section className="page-intro expense-page__intro">
      <div><span className="eyebrow">Recurring Expenses</span><h2>المصروفات الدورية</h2><p>حوّل الإيجارات والاشتراكات والالتزامات المتكررة إلى قواعد تتولد تلقائيًا. لو سياسة البند تتطلب إثباتًا، ينشأ المستند كمسودة حتى ترفق الإيصال.</p></div>
      <div className="expense-policy-actions"><Link className="secondary-button" to="/finance/expenses"><ArrowRight size={17}/> المصروفات</Link>{workspace?.permissions.can_manage && <button className="primary-button" onClick={() => setEditing('new')}><Plus size={17}/> قاعدة دورية</button>}</div>
    </section>

    {error && <section className="engine-banner expense-error"><div><strong>تعذر إتمام العملية</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}
    {notice && <section className="expense-notice"><CheckCircle2 size={18}/><span>{notice}</span><button onClick={() => setNotice(null)}><X size={16}/></button></section>}

    <section className="section-card expense-toolbar"><div><strong>التوليد الآلي يعمل كل ساعة</strong><p className="muted">زر التشغيل اليدوي يفحص هذا الفرع فقط، وهو آمن من التكرار لنفس القاعدة والتاريخ.</p></div>{workspace?.permissions.can_manage && <button className="secondary-button" onClick={() => void runNow()} disabled={running}><RotateCcw size={16}/>{running ? 'جاري الفحص…' : 'تشغيل المستحق الآن'}</button>}</section>

    <section className="expense-recurring-list">
      {loading ? [1,2].map((item) => <article className="section-card" key={item}><div className="skeleton wide"/><div className="skeleton medium"/></article>) : !workspace?.rules.length ? <article className="section-card empty-data"><span>—</span><p>لا توجد قواعد دورية. أضف الإيجار أو الاشتراكات أو أي التزام متكرر.</p></article> : workspace.rules.map((rule) => <article className={`section-card expense-recurring-card ${rule.active ? '' : 'is-paused'}`} key={rule.id}>
        <div className="expense-recurring-card__head"><div className="expense-card__identity"><div className="expense-card__icon"><CalendarClock size={19}/></div><div><strong>{rule.description}</strong><span>{rule.category_name} · {cadenceLabels[rule.cadence]}</span></div></div><span className={`expense-status ${rule.active ? 'expense-status--paid' : 'expense-status--cancelled'}`}>{rule.active ? 'نشط' : 'متوقف'}</span></div>
        <div className="expense-card__amounts"><div><span>القيمة</span><strong>{money(rule.amount)}</strong></div><div><span>الاستحقاق القادم</span><strong>{new Date(`${rule.next_run_date}T00:00:00`).toLocaleDateString('ar-EG')}</strong></div><div><span>تم إنشاؤه</span><strong>{rule.generated_count.toLocaleString('ar-EG')} مرة</strong></div></div>
        <div className="expense-meta">{rule.beneficiary_name && <span>المستفيد: <b>{rule.beneficiary_name}</b></span>}<span>{rule.auto_submit ? 'يرسل تلقائيًا لدورة الاعتماد' : 'ينشأ كمسودة'}</span>{rule.end_date && <span>ينتهي: <b>{new Date(`${rule.end_date}T00:00:00`).toLocaleDateString('ar-EG')}</b></span>}{rule.last_generated_at && <span>آخر توليد: <b>{new Date(rule.last_generated_at).toLocaleString('ar-EG')}</b></span>}</div>
        {workspace.permissions.can_manage && <div className="expense-card__actions"><button className="expense-action neutral" onClick={() => setEditing(rule)}><CalendarClock size={15}/> تعديل</button><button className={`expense-action ${rule.active ? 'reject' : 'approve'}`} onClick={() => void toggle(rule)}>{rule.active ? <PauseCircle size={15}/> : <PlayCircle size={15}/>} {rule.active ? 'إيقاف' : 'تفعيل'}</button></div>}
      </article>)}
    </section>

    {editing && workspace && selectedBranch && <RecurringDialog rule={editing === 'new' ? null : editing} workspace={workspace} branchId={selectedBranch.branch_id} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); setNotice('تم حفظ قاعدة المصروف الدوري.'); await load(); }} onError={setError}/>} 
  </div>;
}

function RecurringDialog({ rule, workspace, branchId, onClose, onSaved, onError }: { rule: RecurringExpenseRule | null; workspace: RecurringExpenseWorkspace; branchId: string; onClose: () => void; onSaved: () => void; onError: (message: string | null) => void }) {
  const [categoryId, setCategoryId] = useState(rule?.category_id || workspace.categories[0]?.id || '');
  const [amount, setAmount] = useState(String(rule?.amount ?? ''));
  const [taxAmount, setTaxAmount] = useState(String(rule?.tax_amount ?? '0'));
  const [description, setDescription] = useState(rule?.description || '');
  const [beneficiary, setBeneficiary] = useState(rule?.beneficiary_name || '');
  const [cadence, setCadence] = useState<RecurringCadence>(rule?.cadence || 'monthly');
  const [nextRun, setNextRun] = useState(rule?.next_run_date || workspace.today);
  const [endDate, setEndDate] = useState(rule?.end_date || '');
  const [autoSubmit, setAutoSubmit] = useState(rule?.auto_submit ?? true);
  const [active, setActive] = useState(rule?.active ?? true);
  const [notes, setNotes] = useState(rule?.notes || '');
  const [saving, setSaving] = useState(false);
  const category = workspace.categories.find((item) => item.id === categoryId);
  const needsReceipt = !!category && category.receipt_required_above > 0 && Number(amount || 0) >= category.receipt_required_above;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const numeric = Number(amount);
    if (!categoryId || !Number.isFinite(numeric) || numeric <= 0 || !description.trim() || !nextRun) return;
    setSaving(true); onError(null);
    try {
      await upsertRecurringExpenseRule({ id: rule?.id, branchId, categoryId, amount: numeric, description: description.trim(), beneficiaryName: beneficiary.trim(), taxAmount: Number(taxAmount || 0), cadence, nextRunDate: nextRun, endDate: endDate || undefined, autoSubmit, active, notes: notes.trim() });
      onSaved();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'تعذر حفظ القاعدة.'); }
    finally { setSaving(false); }
  }

  return <div className="expense-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="expense-dialog" role="dialog" aria-modal="true"><header><div><h3>{rule ? 'تعديل القاعدة الدورية' : 'قاعدة مصروف دوري'}</h3><p>كل استحقاق يولّد مستندًا مستقلًا حتى تظل الموافقات والمصروف الفعلي قابلة للمراجعة.</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></header>
    <form className="expense-form" onSubmit={submit}>
      <label>البند<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>{workspace.categories.map((item) => <option key={item.id} value={item.id}>{item.group_name_ar} — {item.name_ar}</option>)}</select></label>
      <div className="expense-form__grid"><label>القيمة<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required/></label><label>الضريبة / الرسوم داخل المستند<input type="number" min="0" step="0.01" value={taxAmount} onChange={(event) => setTaxAmount(event.target.value)}/></label></div>
      <label>الوصف<textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} required placeholder="مثال: إيجار مخزن الفرع"/></label>
      <label>المستفيد<input value={beneficiary} onChange={(event) => setBeneficiary(event.target.value)} placeholder="شركة / مالك / مزود خدمة"/></label>
      <div className="expense-form__grid"><label>التكرار<select value={cadence} onChange={(event) => setCadence(event.target.value as RecurringCadence)}>{Object.entries(cadenceLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>الاستحقاق القادم<input type="date" value={nextRun} onChange={(event) => setNextRun(event.target.value)} required/></label></div>
      <label>تاريخ النهاية — اختياري<input type="date" value={endDate} min={nextRun} onChange={(event) => setEndDate(event.target.value)}/></label>
      {needsReceipt && <div className="expense-accounting-warning"><CalendarClock size={17}/><span>قيمة هذا البند تتطلب إثباتًا. عند الاستحقاق سيُنشأ المستند كمسودة حتى يتم رفع الإيصال، ولن يدخل المصروف قبل الاعتماد.</span></div>}
      <div className="expense-policy-switches"><label className="expense-switch"><input type="checkbox" checked={autoSubmit} onChange={(event) => setAutoSubmit(event.target.checked)}/><span><b>إرسال تلقائي</b><small>إن لم يكن الإثبات مطلوبًا، يدخل دورة الاعتماد تلقائيًا.</small></span></label><label className="expense-switch"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)}/><span><b>القاعدة نشطة</b><small>إيقافها يمنع الاستحقاقات الجديدة فقط.</small></span></label></div>
      <label>ملاحظات<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)}/></label>
      <div className="expense-dialog__actions"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الحفظ…' : 'حفظ القاعدة'}</button></div>
    </form>
  </section></div>;
}
