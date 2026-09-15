import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Banknote, CalendarClock, CheckCircle2, CircleDollarSign, Clock3, FileText, Gauge, Landmark, Plus, ReceiptText, RefreshCcw, RotateCcw, ScanSearch, Settings2, ShieldCheck, Upload, WalletCards, X, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money } from '../components/MetricCard';
import { useBusiness } from '../context/BusinessContext';
import {
  createExpenseRequest,
  decideExpenseRequest,
  fetchExpenseWorkspace,
  payExpense,
  reverseExpensePayment,
  voidExpenseRequest,
  type ExpenseAccountingTreatment,
  type ExpenseDocument,
  type ExpensePayoutSource,
  type ExpenseStatus,
  type ExpenseWorkspace,
} from '../services/expensesV2';
import { removeExpenseReceipt, resolveExpenseReceiptUrl, submitExpenseDraft, uploadExpenseReceipt, validateExpenseReceipt } from '../services/expenseControlV3';
import './expenses.css';

const statusFilters: Array<{ key: ExpenseStatus | 'all'; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'draft', label: 'مسودة' },
  { key: 'pending_approval', label: 'بانتظار الاعتماد' },
  { key: 'approved', label: 'معتمد' },
  { key: 'partially_paid', label: 'مدفوع جزئيًا' },
  { key: 'paid', label: 'مدفوع' },
  { key: 'rejected', label: 'مرفوض' },
];

export default function ExpensesPage() {
  const { selectedBranch } = useBusiness();
  const [workspace, setWorkspace] = useState<ExpenseWorkspace | null>(null);
  const [status, setStatus] = useState<ExpenseStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [paying, setPaying] = useState<ExpenseDocument | null>(null);
  const [drafting, setDrafting] = useState<ExpenseDocument | null>(null);

  async function load(nextStatus = status) {
    if (!selectedBranch) return;
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await fetchExpenseWorkspace(selectedBranch.branch_id, nextStatus === 'all' ? null : nextStatus));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل المصروفات.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(status); }, [selectedBranch?.branch_id, status]);

  async function decide(document: ExpenseDocument, decision: 'approve' | 'reject') {
    const note = decision === 'reject' ? window.prompt('سبب الرفض (مطلوب للمراجعة):') : window.prompt('ملاحظة الاعتماد (اختياري):', '') ?? '';
    if (decision === 'reject' && !note?.trim()) return;
    setBusyId(document.id);
    setError(null);
    try {
      await decideExpenseRequest(document.id, decision, note || undefined);
      setNotice(decision === 'approve' ? `تم اعتماد ${document.document_number}.` : `تم رفض ${document.document_number}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تنفيذ القرار.');
    } finally { setBusyId(null); }
  }

  async function voidDocument(document: ExpenseDocument) {
    const reason = window.prompt(`سبب إلغاء/عكس المستند ${document.document_number}:`);
    if (!reason?.trim()) return;
    setBusyId(document.id);
    setError(null);
    try {
      await voidExpenseRequest(document.id, reason);
      setNotice(`تم عكس المستند ${document.document_number} مع حفظ الأثر المحاسبي.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر عكس المصروف.');
    } finally { setBusyId(null); }
  }

  async function reversePayment(document: ExpenseDocument, paymentId: string) {
    const reason = window.prompt('اكتب سبب عكس الدفعة:');
    if (!reason?.trim()) return;
    setBusyId(paymentId);
    setError(null);
    try {
      await reverseExpensePayment(paymentId, reason);
      setNotice(`تم عكس دفعة من ${document.document_number}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر عكس الدفعة.');
    } finally { setBusyId(null); }
  }

  const summary = workspace?.summary;
  return <div className="stack-lg expense-page">
    <section className="page-intro expense-page__intro">
      <div>
        <span className="eyebrow">Expenses & Cash Control V3</span>
        <h2>مركز المصروفات والصرف</h2>
        <p>المصروف، الاعتماد، والصرف أحداث منفصلة. الإثباتات محفوظة بشكل خاص، والموازنات والعهد والمصروفات الدورية لها مسارات رقابية مستقلة.</p>
      </div>
      <div className="expense-policy-actions">
        {workspace?.permissions.can_manage_categories && <Link className="secondary-button" to="/finance/expenses/categories"><Settings2 size={17}/> سياسات البنود</Link>}
        {workspace?.permissions.can_request && <button className="primary-button expense-primary-action" onClick={() => setCreateOpen(true)}><Plus size={18}/> طلب مصروف</button>}
      </div>
    </section>

    {error && <section className="engine-banner expense-error"><div><strong>تعذر إتمام العملية</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}
    {notice && <section className="expense-notice"><CheckCircle2 size={18}/><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="إغلاق"><X size={16}/></button></section>}

    <section className="expense-summary-grid">
      <Summary title="مصروفات معتمدة" value={summary?.recognized_amount} icon={ReceiptText} loading={loading}/>
      <Summary title="تم صرفه" value={summary?.paid_amount} icon={Banknote} loading={loading}/>
      <Summary title="متبقي للصرف" value={summary?.outstanding_amount} icon={WalletCards} loading={loading}/>
      <Summary title="بانتظار الاعتماد" value={summary?.pending_approval} icon={Clock3} loading={loading} count/>
    </section>

    <section className="expense-control-links">
      <ControlLink to="/finance/expenses/budgets" icon={Gauge} title="الموازنات" text="Budget vs Actual والتنبيهات"/>
      <ControlLink to="/finance/expenses/recurring" icon={CalendarClock} title="المصروفات الدورية" text="إيجار واشتراكات والتزامات متكررة"/>
      <ControlLink to="/finance/expenses/advances" icon={Landmark} title="العهد والسلف" text="صرف وتسوية ورد المتبقي"/>
      <ControlLink to="/finance/expenses/insights" icon={ScanSearch} title="المراجعة الذكية" text="تكرار وقيم غير معتادة"/>
    </section>

    <section className="section-card expense-toolbar">
      <div className="expense-tabs">{statusFilters.map((item) => <button key={item.key} className={status === item.key ? 'active' : ''} onClick={() => setStatus(item.key)}>{item.label}</button>)}</div>
      <button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCcw size={16}/> تحديث</button>
    </section>

    <section className="expense-list">
      {loading ? [1, 2, 3].map((item) => <article className="expense-card expense-card--loading" key={item}><div className="skeleton wide"/><div className="skeleton medium"/><div className="skeleton wide"/></article>) :
        workspace?.documents.length ? workspace.documents.map((document) => <ExpenseCard key={document.id} document={document} permissions={workspace.permissions} busyId={busyId} onDecide={decide} onPay={setPaying} onDraft={setDrafting} onReverse={reversePayment} onVoid={voidDocument}/>) :
        <article className="section-card empty-data"><span>—</span><p>لا توجد مستندات مصروفات في الحالة المحددة.</p></article>}
    </section>

    {createOpen && workspace && selectedBranch && <CreateExpenseDialog workspace={workspace} branchId={selectedBranch.branch_id} onClose={() => setCreateOpen(false)} onSaved={async (message) => { setCreateOpen(false); setNotice(message); await load(); }} onError={setError}/>} 
    {paying && workspace && <PaymentDialog document={paying} sources={workspace.payout_sources} onClose={() => setPaying(null)} onSaved={async () => { setPaying(null); setNotice(`تم تسجيل دفعة على ${paying.document_number}.`); await load(); }} onError={setError}/>} 
    {drafting && selectedBranch && <DraftSubmitDialog document={drafting} branchId={selectedBranch.branch_id} onClose={() => setDrafting(null)} onSaved={async () => { const number = drafting.document_number; setDrafting(null); setNotice(`تم إرسال ${number} للاعتماد.`); await load(); }} onError={setError}/>} 
  </div>;
}

function ControlLink({ to, icon: Icon, title, text }: { to: string; icon: typeof Gauge; title: string; text: string }) {
  return <Link to={to} className="expense-control-link"><span><Icon size={19}/></span><div><strong>{title}</strong><small>{text}</small></div></Link>;
}

function Summary({ title, value, icon: Icon, loading, count = false }: { title: string; value?: number; icon: typeof ReceiptText; loading: boolean; count?: boolean }) {
  return <article className="expense-summary-card"><div className="expense-summary-card__icon"><Icon size={20}/></div><span>{title}</span><strong>{loading ? '…' : count ? Math.round(value || 0).toLocaleString('ar-EG') : money(value)}</strong></article>;
}

function ExpenseCard({ document, permissions, busyId, onDecide, onPay, onDraft, onReverse, onVoid }: {
  document: ExpenseDocument;
  permissions: ExpenseWorkspace['permissions'];
  busyId: string | null;
  onDecide: (document: ExpenseDocument, decision: 'approve' | 'reject') => void;
  onPay: (document: ExpenseDocument) => void;
  onDraft: (document: ExpenseDocument) => void;
  onReverse: (document: ExpenseDocument, paymentId: string) => void;
  onVoid: (document: ExpenseDocument) => void;
}) {
  const activePayments = document.payments.filter((payment) => payment.status === 'active');
  return <article className="expense-card">
    <header className="expense-card__head">
      <div className="expense-card__identity"><div className="expense-card__icon"><FileText size={20}/></div><div><strong>{document.document_number}</strong><span>{document.category_name} · {treatmentLabel(document.accounting_treatment)}</span></div></div>
      <StatusBadge status={document.status}/>
    </header>
    <div className="expense-card__amounts">
      <div><span>القيمة</span><strong>{money(document.amount)}</strong></div>
      <div><span>المدفوع</span><strong>{money(document.paid_amount)}</strong></div>
      <div><span>المتبقي</span><strong>{money(document.remaining_amount)}</strong></div>
    </div>
    <div className="expense-card__details">
      <p>{document.description}</p>
      <div className="expense-meta">
        <span>مقدم الطلب: <b>{document.requested_by_name}</b></span>
        {document.beneficiary_name && <span>المستفيد: <b>{document.beneficiary_name}</b></span>}
        {document.invoice_number && <span>فاتورة: <b>{document.invoice_number}</b></span>}
        <span>المصدر: <b>{document.source === 'pos' ? 'نقطة البيع' : 'تطبيق الأعمال'}</b></span>
        <span>{new Date(document.incurred_at).toLocaleString('ar-EG')}</span>
      </div>
      {document.receipt_url && <ReceiptLink value={document.receipt_url}/>} 
      {document.rejection_reason && <div className="expense-rejection">سبب الرفض: {document.rejection_reason}</div>}
      {document.status === 'draft' && <div className="expense-accounting-warning"><Upload size={17}/><span>هذه مسودة دورية لم تُحتسب كمصروف بعد. أرفق الإثبات المطلوب ثم أرسلها للاعتماد.</span></div>}
    </div>

    {activePayments.length > 0 && <div className="expense-payments"><strong>الدفعات</strong>{activePayments.map((payment) => <div className="expense-payment-row" key={payment.id}><div><span>{sourceKindLabel(payment.source_kind)} · {money(payment.amount)}</span><small>{payment.paid_by_name} · {new Date(payment.paid_at).toLocaleString('ar-EG')}</small></div>{permissions.can_pay && <button className="expense-link-button danger" disabled={busyId === payment.id} onClick={() => onReverse(document, payment.id)}><RotateCcw size={14}/> عكس الدفعة</button>}</div>)}</div>}

    <footer className="expense-card__actions">
      {document.status === 'draft' && <button className="expense-action pay" onClick={() => onDraft(document)}><Upload size={16}/> إرفاق وإرسال</button>}
      {document.status === 'pending_approval' && permissions.can_approve && <><button className="expense-action approve" disabled={busyId === document.id} onClick={() => onDecide(document, 'approve')}><CheckCircle2 size={16}/> اعتماد</button><button className="expense-action reject" disabled={busyId === document.id} onClick={() => onDecide(document, 'reject')}><XCircle size={16}/> رفض</button></>}
      {['approved', 'partially_paid'].includes(document.status) && permissions.can_pay && document.accounting_treatment !== 'employee_advance' && <button className="expense-action pay" onClick={() => onPay(document)}><CircleDollarSign size={16}/> صرف دفعة</button>}
      {['approved', 'partially_paid', 'paid'].includes(document.status) && permissions.can_approve && <button className="expense-action neutral" disabled={busyId === document.id} onClick={() => onVoid(document)}><ShieldCheck size={16}/> عكس المستند</button>}
    </footer>
  </article>;
}

function ReceiptLink({ value }: { value: string }) {
  const [opening, setOpening] = useState(false);
  async function openReceipt() {
    setOpening(true);
    const popup = window.open('about:blank', '_blank');
    try {
      const url = await resolveExpenseReceiptUrl(value);
      if (!url) throw new Error('الإثبات غير متاح.');
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch (cause) {
      popup?.close();
      window.alert(cause instanceof Error ? cause.message : 'تعذر فتح الإثبات.');
    } finally { setOpening(false); }
  }
  return <button type="button" className="expense-receipt-link expense-receipt-button" onClick={() => void openReceipt()} disabled={opening}><ReceiptText size={15}/>{opening ? 'جاري فتح الإثبات…' : 'عرض الإثبات'}</button>;
}

function ReceiptPicker({ file, onChange, required }: { file: File | null; onChange: (file: File | null) => void; required?: boolean }) {
  const [localError, setLocalError] = useState<string | null>(null);
  function select(next: File | null) {
    if (!next) { setLocalError(null); onChange(null); return; }
    try { validateExpenseReceipt(next); setLocalError(null); onChange(next); }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'ملف غير صالح.'); onChange(null); }
  }
  return <label className="expense-file-picker"><span>{required ? 'الإثبات / الإيصال *' : 'الإثبات / الإيصال'}</span><div className="expense-file-picker__box"><Upload size={18}/><div><b>{file?.name || 'اختر صورة أو PDF'}</b><small>JPG / PNG / WEBP / PDF — حتى 15MB</small></div><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => select(event.target.files?.[0] || null)}/></div>{localError && <small className="expense-inline-error">{localError}</small>}</label>;
}

function CreateExpenseDialog({ workspace, branchId, onClose, onSaved, onError }: { workspace: ExpenseWorkspace; branchId: string; onClose: () => void; onSaved: (message: string) => void; onError: (message: string | null) => void }) {
  const [categoryId, setCategoryId] = useState(workspace.categories[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [description, setDescription] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const category = useMemo(() => workspace.categories.find((item) => item.id === categoryId), [workspace.categories, categoryId]);
  const numericAmount = Number(amount || 0);
  const receiptRequired = !!category && category.receipt_required_above > 0 && numericAmount >= category.receipt_required_above;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!categoryId || !Number.isFinite(numericAmount) || numericAmount <= 0 || !description.trim()) return;
    if (receiptRequired && !receiptFile) { onError('هذا البند يتطلب إرفاق إثبات قبل الإرسال.'); return; }
    setSaving(true); onError(null);
    let uploaded: string | null = null;
    try {
      if (receiptFile) uploaded = await uploadExpenseReceipt(branchId, receiptFile);
      const saved = await createExpenseRequest({ branchId, categoryId, amount: numericAmount, taxAmount: Number(taxAmount || 0), description: description.trim(), beneficiaryName: beneficiary.trim(), invoiceNumber: invoiceNumber.trim(), receiptUrl: uploaded || undefined, notes: notes.trim() });
      onSaved(saved.status === 'approved' ? `تم إنشاء واعتماد ${saved.document_number}.` : `تم إرسال ${saved.document_number} للاعتماد.`);
    } catch (cause) {
      if (uploaded) await removeExpenseReceipt(uploaded).catch(() => undefined);
      onError(cause instanceof Error ? cause.message : 'تعذر إنشاء طلب المصروف.');
    } finally { setSaving(false); }
  }

  return <Dialog title="طلب مصروف جديد" subtitle="التسجيل لا يخرج أموالًا من الخزنة. الصرف يتم بعد الاعتماد كعملية مستقلة." onClose={onClose}>
    <form className="expense-form" onSubmit={submit}>
      <label>بند المصروف<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>{workspace.categories.map((item) => <option value={item.id} key={item.id}>{item.group_name_ar} — {item.name_ar}</option>)}</select></label>
      {category && <div className="expense-policy"><span>{treatmentLabel(category.accounting_treatment)}</span><span>{category.approval_required ? 'يتطلب اعتماد' : 'اعتماد تلقائي'}</span>{category.receipt_required_above > 0 && <span>إثبات مطلوب من {money(category.receipt_required_above)}</span>}</div>}
      <div className="expense-form__grid"><label>القيمة<input inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required/></label><label>الضريبة / الرسوم داخل المستند<input inputMode="decimal" type="number" min="0" step="0.01" value={taxAmount} onChange={(event) => setTaxAmount(event.target.value)}/></label></div>
      <label>وصف المصروف<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} required placeholder="مثال: صيانة موتور ثلاجة العرض"/></label>
      <div className="expense-form__grid"><label>المستفيد<input value={beneficiary} onChange={(event) => setBeneficiary(event.target.value)} placeholder="شركة / فني / جهة"/></label><label>رقم الفاتورة<input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)}/></label></div>
      <ReceiptPicker file={receiptFile} onChange={setReceiptFile} required={receiptRequired}/>
      <label>ملاحظات<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2}/></label>
      <div className="expense-dialog__actions"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الرفع والإرسال…' : 'إرسال للاعتماد'}</button></div>
    </form>
  </Dialog>;
}

function DraftSubmitDialog({ document, branchId, onClose, onSaved, onError }: { document: ExpenseDocument; branchId: string; onClose: () => void; onSaved: () => void; onError: (message: string | null) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); onError(null);
    let uploaded: string | null = null;
    try {
      if (file) uploaded = await uploadExpenseReceipt(branchId, file);
      await submitExpenseDraft(document.id, uploaded || document.receipt_url || null, note.trim());
      onSaved();
    } catch (cause) {
      if (uploaded) await removeExpenseReceipt(uploaded).catch(() => undefined);
      onError(cause instanceof Error ? cause.message : 'تعذر إرسال المسودة.');
    } finally { setSaving(false); }
  }
  return <Dialog title={`استكمال ${document.document_number}`} subtitle="ارفع الإثبات المطلوب ثم أرسل المسودة لدورة الاعتماد. لن تدخل في المصروفات قبل الاعتماد." onClose={onClose}>
    <form className="expense-form" onSubmit={submit}>
      <div className="expense-source-balance"><span>قيمة المستند</span><strong>{money(document.amount)}</strong></div>
      {document.receipt_url ? <div className="expense-accounting-warning"><CheckCircle2 size={17}/><span>يوجد إثبات مرفق بالفعل. يمكنك الإرسال مباشرة أو اختيار ملف جديد لاستبداله على المستند.</span></div> : null}
      <ReceiptPicker file={file} onChange={setFile}/>
      <label>ملاحظة الإرسال<textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)}/></label>
      <div className="expense-dialog__actions"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الرفع والإرسال…' : 'إرسال للاعتماد'}</button></div>
    </form>
  </Dialog>;
}

function PaymentDialog({ document, sources, onClose, onSaved, onError }: { document: ExpenseDocument; sources: ExpensePayoutSource[]; onClose: () => void; onSaved: () => void; onError: (message: string | null) => void }) {
  const [sourceId, setSourceId] = useState(sources[0]?.account_id || '');
  const [amount, setAmount] = useState(String(document.remaining_amount));
  const [fee, setFee] = useState('0');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const source = sources.find((item) => item.account_id === sourceId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!source) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > document.remaining_amount) return;
    setSaving(true); onError(null);
    try {
      await payExpense({ documentId: document.id, source, amount: numericAmount, actualFee: Number(fee || 0), providerReference: reference.trim(), note: note.trim() });
      onSaved();
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'تعذر صرف الدفعة.'); }
    finally { setSaving(false); }
  }

  return <Dialog title={`صرف ${document.document_number}`} subtitle={`المتبقي ${money(document.remaining_amount)}. يمكن الصرف جزئيًا من خزنة أو حساب مالي.`} onClose={onClose}>
    <form className="expense-form" onSubmit={submit}>
      <label>مصدر الصرف<select value={sourceId} onChange={(event) => setSourceId(event.target.value)} required><option value="" disabled>اختر الحساب</option>{sources.map((item) => <option key={item.account_id} value={item.account_id}>{item.name} — متاح {money(item.balance)}</option>)}</select></label>
      {source && <div className="expense-source-balance"><span>{sourceKindLabel(source.source_kind)}</span><strong>{money(source.balance)}</strong></div>}
      <div className="expense-form__grid"><label>قيمة الدفعة<input type="number" min="0.01" max={document.remaining_amount} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required/></label><label>رسوم فعلية<input type="number" min="0" step="0.01" value={fee} onChange={(event) => setFee(event.target.value)}/></label></div>
      <label>مرجع التحويل / العملية<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="اختياري للنقد، مهم للتحويلات"/></label>
      <label>ملاحظة الصرف<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2}/></label>
      {!sources.length && <div className="expense-rejection">لا توجد خزنة أو حساب مالي نشط متاح للصرف في هذا الفرع.</div>}
      <div className="expense-dialog__actions"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving || !source}>{saving ? 'جاري الصرف…' : 'تأكيد الصرف'}</button></div>
    </form>
  </Dialog>;
}

function Dialog({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return <div className="expense-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="expense-dialog" role="dialog" aria-modal="true"><header><div><h3>{title}</h3><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={18}/></button></header>{children}</section></div>;
}

function StatusBadge({ status }: { status: ExpenseStatus }) {
  const labels: Record<ExpenseStatus, string> = { draft: 'مسودة', pending_approval: 'بانتظار الاعتماد', approved: 'معتمد — غير مدفوع', partially_paid: 'مدفوع جزئيًا', paid: 'مدفوع', rejected: 'مرفوض', cancelled: 'ملغي', voided: 'معكوس' };
  return <span className={`expense-status expense-status--${status}`}>{labels[status]}</span>;
}

function treatmentLabel(value: ExpenseAccountingTreatment) {
  if (value === 'opex') return 'مصروف تشغيلي OPEX';
  if (value === 'capex') return 'أصل / CAPEX';
  if (value === 'prepaid') return 'مصروف مقدم';
  return 'عهدة / سلفة موظف';
}

function sourceKindLabel(value: string) {
  if (value === 'branch_safe') return 'خزنة الفرع';
  if (value === 'pos_drawer') return 'درج الكاشير';
  if (value === 'bank') return 'حساب بنكي';
  return 'حساب/محفظة مالية';
}
