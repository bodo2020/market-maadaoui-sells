import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Banknote, CheckCircle2, CircleDollarSign, Landmark, Plus, ReceiptText, RefreshCcw, RotateCcw, Undo2, Upload, WalletCards, X, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money } from '../components/MetricCard';
import { useBusiness } from '../context/BusinessContext';
import { decideExpenseRequest, type ExpensePayoutSource } from '../services/expensesV2';
import {
  createEmployeeAdvanceRequest,
  disburseEmployeeAdvance,
  fetchEmployeeAdvanceWorkspace,
  removeExpenseReceipt,
  resolveExpenseReceiptUrl,
  settleEmployeeAdvanceExpense,
  settleEmployeeAdvanceReturn,
  uploadExpenseReceipt,
  validateExpenseReceipt,
  type EmployeeAdvanceDocument,
  type EmployeeAdvanceSettlement,
  type EmployeeAdvanceWorkspace,
} from '../services/expenseControlV3';
import { reverseEmployeeAdvanceSettlement } from '../services/advanceSettlementReversalV3';
import './expenses.css';

type DialogMode =
  | { kind: 'create' }
  | { kind: 'disburse'; document: EmployeeAdvanceDocument }
  | { kind: 'expense'; document: EmployeeAdvanceDocument }
  | { kind: 'return'; document: EmployeeAdvanceDocument };

type SettlementWithReversal = EmployeeAdvanceSettlement & {
  reversed_at?: string | null;
  reverse_reason?: string | null;
};

export default function EmployeeAdvancesPage() {
  const { selectedBranch } = useBusiness();
  const [workspace, setWorkspace] = useState<EmployeeAdvanceWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const canApprove = selectedBranch?.permissions.some((permission) => permission === 'expense.approve' || permission === 'finance.manage') === true;

  async function load() {
    if (!selectedBranch) return;
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await fetchEmployeeAdvanceWorkspace(selectedBranch.branch_id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل العهد والسلف.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [selectedBranch?.branch_id]);

  async function decide(document: EmployeeAdvanceDocument, decision: 'approve' | 'reject') {
    const note = decision === 'reject' ? window.prompt('سبب رفض العهدة:') : window.prompt('ملاحظة الاعتماد (اختياري):', '') ?? '';
    if (decision === 'reject' && !note?.trim()) return;
    setBusyId(document.id);
    setError(null);
    try {
      await decideExpenseRequest(document.id, decision, note || undefined);
      setNotice(decision === 'approve' ? `تم اعتماد ${document.document_number}.` : `تم رفض ${document.document_number}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تنفيذ القرار.');
    } finally {
      setBusyId(null);
    }
  }

  async function reverseSettlement(document: EmployeeAdvanceDocument, settlement: SettlementWithReversal) {
    const kind = settlement.settlement_type === 'expense_receipt' ? 'المصروف المثبت' : 'رد متبقي العهدة';
    const reason = window.prompt(`سبب عكس ${kind} بقيمة ${money(settlement.amount)}:`)?.trim();
    if (!reason) return;
    if (!window.confirm(`سيتم عكس حركة التسوية وإعادة ${money(settlement.amount)} إلى رصيد العهدة غير المسوّى. هل تريد المتابعة؟`)) return;

    setBusyId(settlement.id);
    setError(null);
    try {
      await reverseEmployeeAdvanceSettlement(settlement.id, reason);
      setNotice(`تم عكس التسوية في ${document.document_number} مع الاحتفاظ بسجل المراجعة الكامل.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر عكس التسوية.');
    } finally {
      setBusyId(null);
    }
  }

  const summary = workspace?.summary;
  return <div className="stack-lg expense-page">
    <section className="page-intro expense-page__intro">
      <div>
        <span className="eyebrow">Employee Advances</span>
        <h2>العهد والسلف</h2>
        <p>صرف العهدة ليس مصروف تشغيل. المصروف يدخل الربحية بعد استيفاء دورة الاعتماد الخاصة ببنده، وأي باقي يُرد إلى الخزنة أو الحساب المالي كحركة سيولة مستقلة.</p>
      </div>
      <div className="expense-policy-actions">
        <Link className="secondary-button" to="/finance/expenses"><ArrowRight size={17}/> المصروفات</Link>
        {workspace?.permissions.can_manage && <button className="primary-button" onClick={() => setDialog({ kind: 'create' })}><Plus size={17}/> عهدة جديدة</button>}
      </div>
    </section>

    {error && <section className="engine-banner expense-error"><div><strong>تعذر إتمام العملية</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}
    {notice && <section className="expense-notice"><CheckCircle2 size={18}/><span>{notice}</span><button onClick={() => setNotice(null)}><X size={16}/></button></section>}

    <section className="expense-summary-grid">
      <AdvanceSummary title="طلبات العهد" value={summary?.requested_amount} icon={Landmark} loading={loading}/>
      <AdvanceSummary title="تم صرفه للموظفين" value={summary?.disbursed_amount} icon={Banknote} loading={loading}/>
      <AdvanceSummary title="غير مسوّى" value={summary?.unsettled_amount} icon={WalletCards} loading={loading}/>
      <article className="expense-summary-card"><div className="expense-summary-card__icon"><ReceiptText size={20}/></div><span>عهد مفتوحة</span><strong>{loading ? '…' : Math.round(summary?.open_advances || 0).toLocaleString('ar-EG')}</strong></article>
    </section>

    <section className="expense-list">
      {loading ? [1,2].map((item) => <article className="expense-card expense-card--loading" key={item}><div className="skeleton wide"/><div className="skeleton medium"/></article>) : !workspace?.documents.length ? <article className="section-card empty-data"><span>—</span><p>لا توجد عهد أو سلف في هذا الفرع.</p></article> : workspace.documents.map((document) => <article className="expense-card" key={document.id}>
        <header className="expense-card__head">
          <div className="expense-card__identity"><div className="expense-card__icon"><Landmark size={20}/></div><div><strong>{document.document_number}</strong><span>{document.employee_name}</span></div></div>
          <AdvanceStatus document={document}/>
        </header>
        <div className="expense-card__amounts"><div><span>المطلوب</span><strong>{money(document.amount)}</strong></div><div><span>تم صرفه</span><strong>{money(document.paid_amount)}</strong></div><div><span>غير مسوّى</span><strong>{money(document.advance_outstanding)}</strong></div></div>
        <div className="expense-card__details"><p>{document.description}</p><div className="expense-meta"><span>غير مصروف: <b>{money(document.undisbursed_amount)}</b></span><span>تمت تسويته: <b>{money(document.settled_amount)}</b></span><span>تاريخ الطلب: <b>{new Date(document.created_at).toLocaleString('ar-EG')}</b></span>{document.notes && <span>{document.notes}</span>}</div></div>

        {document.settlements.length > 0 && <div className="expense-payments">
          <strong>حركات التسوية</strong>
          {(document.settlements as SettlementWithReversal[]).map((settlement) => <div className="expense-payment-row" key={settlement.id}>
            <div>
              <span>{settlement.settlement_type === 'expense_receipt' ? 'مصروف مثبت' : 'رد متبقي'} · {money(settlement.amount)} {settlement.status === 'reversed' ? '· معكوس' : ''}</span>
              <small>{new Date(settlement.settled_at).toLocaleString('ar-EG')} · {settlement.description}</small>
              {settlement.status === 'reversed' && <small>تم العكس{settlement.reversed_at ? ` في ${new Date(settlement.reversed_at).toLocaleString('ar-EG')}` : ''}{settlement.reverse_reason ? ` · السبب: ${settlement.reverse_reason}` : ''}</small>}
            </div>
            <div className="expense-policy-actions">
              {settlement.receipt_url && <SettlementReceipt value={settlement.receipt_url}/>} 
              {workspace.permissions.can_manage && settlement.status === 'active' && <button className="expense-link-button" disabled={busyId === settlement.id} onClick={() => void reverseSettlement(document, settlement)}><Undo2 size={14}/>{busyId === settlement.id ? 'جارٍ العكس…' : 'عكس التسوية'}</button>}
            </div>
          </div>)}
        </div>}

        <footer className="expense-card__actions">
          {document.status === 'pending_approval' && canApprove && <><button className="expense-action approve" disabled={busyId === document.id} onClick={() => void decide(document, 'approve')}><CheckCircle2 size={15}/> اعتماد</button><button className="expense-action reject" disabled={busyId === document.id} onClick={() => void decide(document, 'reject')}><XCircle size={15}/> رفض</button></>}
          {workspace.permissions.can_manage && ['approved','partially_paid'].includes(document.status) && document.undisbursed_amount > 0 && <button className="expense-action pay" onClick={() => setDialog({ kind: 'disburse', document })}><CircleDollarSign size={15}/> صرف عهدة</button>}
          {workspace.permissions.can_manage && document.advance_outstanding > 0 && <><button className="expense-action approve" onClick={() => setDialog({ kind: 'expense', document })}><ReceiptText size={15}/> تسوية بإيصال</button><button className="expense-action neutral" onClick={() => setDialog({ kind: 'return', document })}><RotateCcw size={15}/> رد المتبقي</button></>}
        </footer>
      </article>)}
    </section>

    {dialog?.kind === 'create' && workspace && selectedBranch && <CreateAdvanceDialog workspace={workspace} branchId={selectedBranch.branch_id} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); setNotice('تم إنشاء طلب العهدة وفق سياسة الاعتماد الخاصة بالبند.'); await load(); }} onError={setError}/>} 
    {dialog?.kind === 'disburse' && workspace && <DisburseDialog document={dialog.document} sources={workspace.payout_sources} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); setNotice('تم صرف العهدة وتسجيل حركة السيولة.'); await load(); }} onError={setError}/>} 
    {dialog?.kind === 'expense' && workspace && selectedBranch && <SettleExpenseDialog document={dialog.document} workspace={workspace} branchId={selectedBranch.branch_id} onClose={() => setDialog(null)} onSaved={async (result) => { setDialog(null); setNotice(result?.approval_status === 'pending_approval' ? 'تم إرسال تسوية العهدة للاعتماد. لن تدخل الربحية أو تخصم من العهدة قبل اعتمادها.' : 'تم اعتماد المصروف المثبت وتسوية جزء من العهدة.'); await load(); }} onError={setError}/>} 
    {dialog?.kind === 'return' && workspace && <ReturnAdvanceDialog document={dialog.document} sources={workspace.payout_sources} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); setNotice('تم رد المبلغ وتحديث رصيد العهدة.'); await load(); }} onError={setError}/>} 
  </div>;
}

function AdvanceSummary({ title, value, icon: Icon, loading }: { title: string; value?: number; icon: typeof Landmark; loading: boolean }) {
  return <article className="expense-summary-card"><div className="expense-summary-card__icon"><Icon size={20}/></div><span>{title}</span><strong>{loading ? '…' : money(value)}</strong></article>;
}

function AdvanceStatus({ document }: { document: EmployeeAdvanceDocument }) {
  if (document.status === 'pending_approval') return <span className="expense-status expense-status--pending_approval">بانتظار الاعتماد</span>;
  if (document.status === 'rejected') return <span className="expense-status expense-status--rejected">مرفوض</span>;
  if (document.status === 'voided') return <span className="expense-status expense-status--voided">معكوس</span>;
  if (document.paid_amount <= 0) return <span className="expense-status expense-status--approved">معتمد — لم يُصرف</span>;
  if (document.advance_outstanding <= 0) return <span className="expense-status expense-status--paid">تمت التسوية</span>;
  return <span className="expense-status expense-status--partially_paid">عهدة مفتوحة</span>;
}

function CreateAdvanceDialog({ workspace, branchId, onClose, onSaved, onError }: { workspace: EmployeeAdvanceWorkspace; branchId: string; onClose: () => void; onSaved: () => void; onError: (message: string | null) => void }) {
  const [employeeId, setEmployeeId] = useState(workspace.employees[0]?.user_id || '');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const numeric = Number(amount);
    if (!employeeId || !Number.isFinite(numeric) || numeric <= 0 || !purpose.trim()) return;
    setSaving(true); onError(null);
    try { await createEmployeeAdvanceRequest({ branchId, employeeId, amount: numeric, purpose: purpose.trim(), dueDate: dueDate || undefined, notes: notes.trim() }); onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'تعذر إنشاء العهدة.'); }
    finally { setSaving(false); }
  }
  return <Dialog title="طلب عهدة / سلفة" subtitle="الموافقة والصرف منفصلان. الطلب وحده لا يخرج أي أموال ولا يُسجل كمصروف." onClose={onClose}><form className="expense-form" onSubmit={submit}>
    <label>الموظف<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required><option value="" disabled>اختر موظفًا</option>{workspace.employees.map((employee) => <option key={employee.user_id} value={employee.user_id}>{employee.name} — {employee.employee_code}</option>)}</select></label>
    <label>قيمة العهدة<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required/></label>
    <label>الغرض<textarea rows={2} value={purpose} onChange={(event) => setPurpose(event.target.value)} required placeholder="مثال: شراء مستلزمات صيانة طارئة"/></label>
    <label>تاريخ التسوية المطلوب — اختياري<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)}/></label>
    <label>ملاحظات<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)}/></label>
    <div className="expense-dialog__actions"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving || !workspace.employees.length}>{saving ? 'جاري الإرسال…' : 'إرسال للاعتماد'}</button></div>
  </form></Dialog>;
}

function SourceFields({ sources, sourceId, setSourceId, amount, setAmount, max, fee, setFee, reference, setReference, allowFee = true }: { sources: ExpensePayoutSource[]; sourceId: string; setSourceId: (value: string) => void; amount: string; setAmount: (value: string) => void; max: number; fee: string; setFee: (value: string) => void; reference: string; setReference: (value: string) => void; allowFee?: boolean }) {
  const source = sources.find((item) => item.account_id === sourceId);
  return <><label>الحساب / الخزنة<select value={sourceId} onChange={(event) => setSourceId(event.target.value)} required><option value="" disabled>اختر المصدر</option>{sources.map((item) => <option key={item.account_id} value={item.account_id}>{item.name} — {money(item.balance)}</option>)}</select></label>{source && <div className="expense-source-balance"><span>{source.source_kind === 'branch_safe' ? 'خزنة الفرع' : source.source_kind === 'bank' ? 'حساب بنكي' : 'حساب مالي'}</span><strong>{money(source.balance)}</strong></div>}<div className="expense-form__grid"><label>القيمة<input type="number" min="0.01" max={max} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required/></label>{allowFee && <label>رسوم فعلية<input type="number" min="0" step="0.01" value={fee} onChange={(event) => setFee(event.target.value)}/></label>}</div><label>مرجع العملية<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="اختياري للنقد"/></label></>;
}

function DisburseDialog({ document, sources, onClose, onSaved, onError }: { document: EmployeeAdvanceDocument; sources: ExpensePayoutSource[]; onClose: () => void; onSaved: () => void; onError: (message: string | null) => void }) {
  const [sourceId, setSourceId] = useState(sources[0]?.account_id || '');
  const [amount, setAmount] = useState(String(document.undisbursed_amount));
  const [fee, setFee] = useState('0');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const source = sources.find((item) => item.account_id === sourceId);
    const numeric = Number(amount);
    if (!source || !Number.isFinite(numeric) || numeric <= 0 || numeric > document.undisbursed_amount) return;
    setSaving(true); onError(null);
    try { await disburseEmployeeAdvance({ documentId: document.id, source, amount: numeric, actualFee: Number(fee || 0), providerReference: reference.trim(), note: note.trim() }); onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'تعذر صرف العهدة.'); }
    finally { setSaving(false); }
  }
  return <Dialog title={`صرف ${document.document_number}`} subtitle={`المتاح للصرف ${money(document.undisbursed_amount)} للموظف ${document.employee_name}. هذه حركة عهدة وليست OPEX.`} onClose={onClose}><form className="expense-form" onSubmit={submit}><SourceFields sources={sources} sourceId={sourceId} setSourceId={setSourceId} amount={amount} setAmount={setAmount} max={document.undisbursed_amount} fee={fee} setFee={setFee} reference={reference} setReference={setReference}/><label>ملاحظة<textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)}/></label><div className="expense-dialog__actions"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving || !sources.length}>{saving ? 'جاري الصرف…' : 'تأكيد صرف العهدة'}</button></div></form></Dialog>;
}

function SettleExpenseDialog({ document, workspace, branchId, onClose, onSaved, onError }: { document: EmployeeAdvanceDocument; workspace: EmployeeAdvanceWorkspace; branchId: string; onClose: () => void; onSaved: (result: Record<string, any>) => void | Promise<void>; onError: (message: string | null) => void }) {
  const [categoryId, setCategoryId] = useState(workspace.expense_categories[0]?.id || '');
  const [amount, setAmount] = useState(String(document.advance_outstanding));
  const [description, setDescription] = useState('');
  const [invoice, setInvoice] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const category = useMemo(() => workspace.expense_categories.find((item) => item.id === categoryId), [workspace.expense_categories, categoryId]);
  const needsReceipt = !!category && category.receipt_required_above > 0 && Number(amount || 0) >= category.receipt_required_above;
  function choose(next: File | null) { if (!next) { setFile(null); setFileError(null); return; } try { validateExpenseReceipt(next); setFile(next); setFileError(null); } catch (cause) { setFile(null); setFileError(cause instanceof Error ? cause.message : 'ملف غير صالح.'); } }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const numeric = Number(amount);
    if (!categoryId || !Number.isFinite(numeric) || numeric <= 0 || numeric > document.advance_outstanding || !description.trim()) return;
    if (needsReceipt && !file) { onError('بند التسوية المختار يتطلب إرفاق إثبات.'); return; }
    setSaving(true); onError(null);
    let uploaded: string | null = null;
    try {
      if (file) uploaded = await uploadExpenseReceipt(branchId, file);
      const result = await settleEmployeeAdvanceExpense({ documentId: document.id, categoryId, amount: numeric, description: description.trim(), receiptUrl: uploaded, invoiceNumber: invoice.trim(), note: note.trim() });
      await onSaved((result || {}) as Record<string, any>);
    } catch (cause) {
      if (uploaded) await removeExpenseReceipt(uploaded).catch(() => undefined);
      onError(cause instanceof Error ? cause.message : 'تعذر تسوية العهدة.');
    } finally { setSaving(false); }
  }
  return <Dialog title={`تسوية ${document.document_number} بإيصال`} subtitle={`المتاح للتسوية ${money(document.advance_outstanding)}. إذا كان البند يحتاج اعتمادًا فلن يُنشأ OPEX ولن ينخفض رصيد العهدة قبل قرار الاعتماد.`} onClose={onClose}><form className="expense-form" onSubmit={submit}><label>بند المصروف<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>{workspace.expense_categories.map((item) => <option key={item.id} value={item.id}>{item.group_name_ar} — {item.name_ar}</option>)}</select></label><div className="expense-form__grid"><label>قيمة المصروف<input type="number" min="0.01" max={document.advance_outstanding} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required/></label><label>رقم الفاتورة<input value={invoice} onChange={(event) => setInvoice(event.target.value)}/></label></div><label>الوصف<textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} required/></label><label className="expense-file-picker"><span>{needsReceipt ? 'الإثبات / الإيصال *' : 'الإثبات / الإيصال'}</span><div className="expense-file-picker__box"><Upload size={18}/><div><b>{file?.name || 'اختر صورة أو PDF'}</b><small>JPG / PNG / WEBP / PDF — حتى 15MB</small></div><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => choose(event.target.files?.[0] || null)}/></div>{fileError && <small className="expense-inline-error">{fileError}</small>}</label><label>ملاحظة<textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)}/></label><div className="expense-dialog__actions"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الرفع والتسجيل…' : 'تسجيل التسوية'}</button></div></form></Dialog>;
}

function ReturnAdvanceDialog({ document, sources, onClose, onSaved, onError }: { document: EmployeeAdvanceDocument; sources: ExpensePayoutSource[]; onClose: () => void; onSaved: () => void; onError: (message: string | null) => void }) {
  const [sourceId, setSourceId] = useState(sources[0]?.account_id || '');
  const [amount, setAmount] = useState(String(document.advance_outstanding));
  const [fee, setFee] = useState('0');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const source = sources.find((item) => item.account_id === sourceId);
    const numeric = Number(amount);
    if (!source || !Number.isFinite(numeric) || numeric <= 0 || numeric > document.advance_outstanding) return;
    setSaving(true); onError(null);
    try { await settleEmployeeAdvanceReturn({ documentId: document.id, source, amount: numeric, providerReference: reference.trim(), note: note.trim() }); onSaved(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'تعذر رد متبقي العهدة.'); }
    finally { setSaving(false); }
  }
  return <Dialog title={`رد متبقي ${document.document_number}`} subtitle={`الرصيد غير المسوّى ${money(document.advance_outstanding)}. المبلغ سيعود للخزنة/الحساب ولن يُنشئ مصروفًا.`} onClose={onClose}><form className="expense-form" onSubmit={submit}><SourceFields sources={sources} sourceId={sourceId} setSourceId={setSourceId} amount={amount} setAmount={setAmount} max={document.advance_outstanding} fee={fee} setFee={setFee} reference={reference} setReference={setReference} allowFee={false}/><label>ملاحظة<textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)}/></label><div className="expense-dialog__actions"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving || !sources.length}>{saving ? 'جاري التسجيل…' : 'تأكيد رد المبلغ'}</button></div></form></Dialog>;
}

function SettlementReceipt({ value }: { value: string }) {
  const [opening, setOpening] = useState(false);
  async function open() {
    setOpening(true);
    const popup = window.open('about:blank','_blank');
    try {
      const url = await resolveExpenseReceiptUrl(value);
      if (!url) throw new Error('الإثبات غير متاح.');
      if (popup) popup.location.href = url; else window.location.href = url;
    } catch (cause) {
      popup?.close();
      window.alert(cause instanceof Error ? cause.message : 'تعذر فتح الإثبات.');
    } finally { setOpening(false); }
  }
  return <button className="expense-link-button" disabled={opening} onClick={() => void open()}><ReceiptText size={14}/>{opening ? 'يفتح…' : 'الإثبات'}</button>;
}

function Dialog({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return <div className="expense-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="expense-dialog" role="dialog" aria-modal="true"><header><div><h3>{title}</h3><p>{subtitle}</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></header>{children}</section></div>;
}
