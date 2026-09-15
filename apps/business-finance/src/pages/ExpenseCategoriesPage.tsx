import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Plus, RefreshCcw, Settings2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money } from '../components/MetricCard';
import { useBusiness } from '../context/BusinessContext';
import { saveExpenseCategoryPolicy } from '../services/expenseCategoriesV2';
import { fetchExpenseWorkspace, type ExpenseAccountingTreatment, type ExpenseCategory } from '../services/expensesV2';
import './expenses.css';

const treatmentOptions: Array<{ value: ExpenseAccountingTreatment; label: string }> = [
  { value: 'opex', label: 'مصروف تشغيلي OPEX' },
  { value: 'capex', label: 'أصل / CAPEX' },
  { value: 'prepaid', label: 'مصروف مقدم' },
  { value: 'employee_advance', label: 'عهدة / سلفة موظف' },
];

export default function ExpenseCategoriesPage() {
  const { selectedBranch } = useBusiness();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<ExpenseCategory | 'new' | null>(null);

  async function load() {
    if (!selectedBranch) return;
    setLoading(true); setError(null);
    try {
      const workspace = await fetchExpenseWorkspace(selectedBranch.branch_id);
      setCategories(workspace.categories);
      setCanManage(workspace.permissions.can_manage_categories);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل بنود المصروفات.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [selectedBranch?.branch_id]);

  const groups = useMemo(() => {
    const map = new Map<string, ExpenseCategory[]>();
    for (const category of categories) map.set(category.group_name_ar, [...(map.get(category.group_name_ar) || []), category]);
    return [...map.entries()];
  }, [categories]);

  return <div className="stack-lg expense-page">
    <section className="page-intro expense-page__intro">
      <div><span className="eyebrow">Expense Policies</span><h2>بنود وسياسات المصروفات</h2><p>حدد لكل بند المعالجة المحاسبية، هل يحتاج اعتماد مستقل، حد الاعتماد التلقائي، ومتى يصبح الإثبات إلزاميًا.</p></div>
      <div className="expense-policy-actions"><Link className="secondary-button" to="/finance/expenses"><ArrowRight size={17}/> المصروفات</Link>{canManage && <button className="primary-button" onClick={() => setEditing('new')}><Plus size={17}/> بند جديد</button>}</div>
    </section>

    {error && <section className="engine-banner expense-error"><div><strong>تعذر تحميل السياسات</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}
    {notice && <section className="expense-notice"><CheckCircle2 size={18}/><span>{notice}</span></section>}

    {!canManage && !loading && <section className="section-card"><strong>عرض فقط</strong><p className="muted">يمكنك مراجعة سياسات البنود، لكن تعديلها يحتاج صلاحية إدارة بنود المصروفات.</p></section>}

    <section className="expense-category-groups">
      {loading ? <article className="section-card"><div className="skeleton wide"/><div className="skeleton medium"/></article> : groups.map(([group, items]) => <article className="section-card expense-category-group" key={group}>
        <div className="section-heading"><div><span className="eyebrow">Category Group</span><h3>{group}</h3></div><span className="expense-category-count">{items.length} بنود</span></div>
        <div className="expense-category-list">{items.map((category) => <div className="expense-category-row" key={category.id}>
          <div className="expense-category-row__main"><div className="expense-card__icon"><Settings2 size={18}/></div><div><strong>{category.name_ar}</strong><small>{category.code} · {treatmentLabel(category.accounting_treatment)} · {category.branch_id ? 'سياسة خاصة بالفرع' : 'سياسة عامة'}</small></div></div>
          <div className="expense-category-row__policy">
            <span>{category.approval_required ? 'اعتماد مطلوب' : 'بدون اعتماد'}</span>
            <span>تلقائي حتى {money(category.auto_approve_limit)}</span>
            <span>إثبات من {money(category.receipt_required_above)}</span>
          </div>
          {canManage && <button className="expense-action neutral" onClick={() => setEditing(category)}><Settings2 size={15}/> تعديل سياسة الفرع</button>}
        </div>)}</div>
      </article>)}
    </section>

    {editing && selectedBranch && <CategoryDialog category={editing === 'new' ? null : editing} branchId={selectedBranch.branch_id} onClose={() => setEditing(null)} onSaved={async (message) => { setEditing(null); setNotice(message); await load(); }} onError={setError}/>} 
  </div>;
}

function CategoryDialog({ category, branchId, onClose, onSaved, onError }: { category: ExpenseCategory | null; branchId: string; onClose: () => void; onSaved: (message: string) => void; onError: (message: string | null) => void }) {
  const isGlobalOverride = !!category && !category.branch_id;
  const [code, setCode] = useState(category?.code || '');
  const [nameAr, setNameAr] = useState(category?.name_ar || '');
  const [groupName, setGroupName] = useState(category?.group_name_ar || 'مصروفات تشغيلية');
  const [treatment, setTreatment] = useState<ExpenseAccountingTreatment>(category?.accounting_treatment || 'opex');
  const [approvalRequired, setApprovalRequired] = useState(category?.approval_required ?? true);
  const [independentApproval, setIndependentApproval] = useState(category?.require_independent_approval ?? true);
  const [autoApproveLimit, setAutoApproveLimit] = useState(String(category?.auto_approve_limit || 0));
  const [receiptThreshold, setReceiptThreshold] = useState(String(category?.receipt_required_above || 0));
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim() || !nameAr.trim()) return;
    setSaving(true); onError(null);
    try {
      await saveExpenseCategoryPolicy({
        branchId,
        categoryId: category?.branch_id ? category.id : null,
        code,
        nameAr,
        groupNameAr: groupName,
        accountingTreatment: treatment,
        active: true,
        approvalRequired,
        requireIndependentApproval: independentApproval,
        autoApproveLimit: Number(autoApproveLimit || 0),
        receiptRequiredAbove: Number(receiptThreshold || 0),
      });
      onSaved(isGlobalOverride ? `تم إنشاء سياسة خاصة بهذا الفرع لبند ${nameAr}.` : `تم حفظ سياسة ${nameAr}.`);
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'تعذر حفظ سياسة البند.'); }
    finally { setSaving(false); }
  }

  return <div className="expense-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="expense-dialog" role="dialog" aria-modal="true">
    <header><div><h3>{category ? `سياسة ${category.name_ar}` : 'بند مصروف جديد'}</h3><p>{isGlobalOverride ? 'سيتم إنشاء Override لهذا الفرع فقط بدون تغيير السياسة العامة لباقي الفروع.' : 'حدد قواعد البند. الحدود الصفرية تعني عدم وجود اعتماد تلقائي أو إلزام إثبات حسب الحقل.'}</p></div><button className="icon-button" onClick={onClose}>×</button></header>
    <form className="expense-form" onSubmit={submit}>
      <div className="expense-form__grid"><label>اسم البند<input value={nameAr} onChange={(event) => setNameAr(event.target.value)} required/></label><label>الكود<input value={code} onChange={(event) => setCode(event.target.value.replace(/\s+/g, '_').toLowerCase())} required disabled={!!category}/></label></div>
      <div className="expense-form__grid"><label>المجموعة<input value={groupName} onChange={(event) => setGroupName(event.target.value)} required/></label><label>المعالجة المحاسبية<select value={treatment} onChange={(event) => setTreatment(event.target.value as ExpenseAccountingTreatment)}>{treatmentOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
      <div className="expense-policy-switches">
        <label className="expense-switch"><input type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)}/><span><b>يتطلب اعتماد</b><small>لا يتم الاعتراف أو السماح بالصرف قبل الاعتماد.</small></span></label>
        <label className="expense-switch"><input type="checkbox" checked={independentApproval} onChange={(event) => setIndependentApproval(event.target.checked)}/><span><b>اعتماد شخص آخر</b><small>صاحب الطلب لا يعتمد طلبه بنفسه.</small></span></label>
      </div>
      <div className="expense-form__grid"><label>حد الاعتماد التلقائي<input type="number" min="0" step="0.01" value={autoApproveLimit} onChange={(event) => setAutoApproveLimit(event.target.value)}/><small>0 = لا يوجد اعتماد تلقائي.</small></label><label>الإثبات إلزامي من<input type="number" min="0" step="0.01" value={receiptThreshold} onChange={(event) => setReceiptThreshold(event.target.value)}/><small>0 = لا يوجد حد إلزامي.</small></label></div>
      {treatment !== 'opex' && <div className="expense-accounting-warning"><ShieldCheck size={17}/><span>{treatmentLabel(treatment)} لا يدخل مصروف التشغيل مباشرةً، وبالتالي لا يخفض الربح التشغيلي وقت الاعتماد.</span></div>}
      <div className="expense-dialog__actions"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الحفظ…' : 'حفظ السياسة'}</button></div>
    </form>
  </section></div>;
}

function treatmentLabel(value: ExpenseAccountingTreatment) {
  if (value === 'opex') return 'OPEX';
  if (value === 'capex') return 'CAPEX';
  if (value === 'prepaid') return 'مصروف مقدم';
  return 'عهدة موظف';
}
