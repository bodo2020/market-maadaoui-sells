import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Banknote, CircleDollarSign, Gift, MinusCircle, RefreshCcw, Send, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, number } from '../components/MetricCard';
import { useBusiness } from '../context/BusinessContext';
import {
  addPayrollAdjustment,
  decideFinancePayroll,
  decideHrPayroll,
  delegatePayrollPayment,
  fetchDebtsWorkspace,
  fetchFinanceAccounts,
  fetchPayrollWorkspace,
  generatePayroll,
  submitPayroll,
} from '../services/businessOperations';
import type { ReportDocument } from '../services/reportingDetails';
import './operations-admin.css';

export default function PayrollDesk() {
  const { selectedBranch } = useBusiness();
  const cairo = cairoParts();
  const [month, setMonth] = useState(cairo.month);
  const [year, setYear] = useState(cairo.year);
  const [workspace, setWorkspace] = useState<ReportDocument | null>(null);
  const [debts, setDebts] = useState<ReportDocument | null>(null);
  const [accounts, setAccounts] = useState<ReportDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<Record<string, unknown> | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'earning' | 'deduction'>('earning');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [paymentSource, setPaymentSource] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('صرف مسير الرواتب المعتمد');

  const branchId = selectedBranch?.branch_id || '';
  const canManageHr = Boolean(selectedBranch?.permissions.some((permission) => permission === 'hr.manage_employees' || permission === 'hr.payroll.manage' || permission === 'hr.admin'));
  const canManageFinance = Boolean(selectedBranch?.permissions.includes('finance.manage'));

  async function load() {
    if (!branchId) return;
    setLoading(true); setError(null);
    const [payrollResult, debtResult, accountResult] = await Promise.allSettled([
      fetchPayrollWorkspace(branchId, month, year),
      fetchDebtsWorkspace(branchId, 300),
      fetchFinanceAccounts(branchId),
    ]);
    if (payrollResult.status === 'fulfilled') setWorkspace(payrollResult.value);
    else { setWorkspace(null); setError(message(payrollResult.reason)); }
    setDebts(debtResult.status === 'fulfilled' ? debtResult.value : null);
    setAccounts(accountResult.status === 'fulfilled' ? accountResult.value : null);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [branchId, month, year]);

  const run = record(workspace?.run);
  const items = rows(workspace?.items);
  const employeeDebts = useMemo(() => new Map(rows(debts?.employees).map((row) => [text(row.id), num(row.balance)])), [debts]);
  const status = text(run.status, 'not_generated');
  const runId = text(run.id, '');
  const totalNet = num(run.total_net);
  const totalDeductions = num(run.total_deductions);
  const totalEarnings = num(run.total_earnings);
  const hasDelegatedPayment = Boolean(run.payment_delegated_task_id);
  const sources = [
    ...rows(accounts?.branch_safes).filter((row) => Boolean(row.active)).map((row) => ({ value: `branch_safe:${text(row.account_id)}`, label: `خزنة · ${text(row.name)} · ${money(num(row.balance))}` })),
    ...rows(accounts?.bank_accounts).filter((row) => Boolean(row.active)).map((row) => ({ value: `bank:${text(row.account_id)}`, label: `بنك · ${text(row.name)} · ${money(num(row.balance))}` })),
  ];

  async function act(task: () => Promise<unknown>, success: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await task(); setNotice(success); await load(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function saveAdjustment() {
    const amount = Number(adjustmentAmount);
    if (!adjusting || !Number.isFinite(amount) || amount <= 0 || adjustmentNote.trim().length < 3) {
      setError('اكتب قيمة صحيحة وسبب واضح للحافز أو الخصم.'); return;
    }
    await act(() => addPayrollAdjustment(text(adjusting.id), adjustmentType, amount, adjustmentNote.trim()), adjustmentType === 'earning' ? 'تمت إضافة الحافز وإعادة حساب الراتب.' : 'تمت إضافة الخصم وإعادة حساب الراتب.');
    setAdjusting(null); setAdjustmentAmount(''); setAdjustmentNote('');
  }

  async function pay() {
    if (!runId || !paymentSource || paymentReference.trim().length < 2 || paymentNote.trim().length < 3) {
      setError('اختر مصدر الدفع واكتب مرجع وملحوظة للصرف.'); return;
    }
    const [sourceKind, sourceAccountId] = paymentSource.split(':');
    await act(() => delegatePayrollPayment(runId, sourceKind, sourceAccountId, paymentReference.trim(), paymentNote.trim()), 'تم إنشاء تفويض صرف الرواتب للمسؤول عن الحساب.');
  }

  return <div className="stack-lg ops-page">
    <section className="ops-head">
      <div className="ops-head__title"><Link to="/finance" className="back-button"><ArrowRight size={19}/></Link><span className="report-card__icon"><UsersRound size={21}/></span><div><span className="eyebrow">Payroll Control</span><h2>إدارة ودفع المرتبات</h2><p>راجع الراتب، الحضور، الخصومات، المديونية، الحوافز والخصومات اليدوية ثم مرّر المسير للمراجعة والصرف من خزنة أو بنك.</p></div></div>
      <div className="ops-toolbar"><label><span>الشهر</span><select value={month} onChange={(e) => setMonth(Number(e.target.value))}>{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index}>{monthLabel(index + 1)}</option>)}</select></label><label><span>السنة</span><input type="number" min="2020" max="2200" value={year} onChange={(e) => setYear(Number(e.target.value))}/></label><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={16}/> تحديث</button></div>
    </section>

    {error && <section className="engine-banner"><div><strong>تعذر تنفيذ العملية</strong><p>{error}</p></div></section>}
    {notice && <section className="section-card"><strong className="positive-text">{notice}</strong></section>}

    <section className="ops-action-grid">
      <article className="ops-action-card"><span>حالة المسير</span><strong>{loading ? '…' : statusLabel(status)}</strong><small className={`ops-status ${statusTone(status)}`}>{monthLabel(month)} {year}</small></article>
      <article className="ops-action-card"><span>إجمالي صافي المرتبات</span><strong>{loading ? '…' : money(totalNet)}</strong><small className="muted">بعد الخصومات والإضافات</small></article>
      <article className="ops-action-card"><span>الإضافات</span><strong>{loading ? '…' : money(totalEarnings)}</strong><small className="muted">إضافي + حوافز يدوية</small></article>
      <article className="ops-action-card"><span>إجمالي الخصومات</span><strong>{loading ? '…' : money(totalDeductions)}</strong><small className="muted">غياب وتأخير وسلف وخصومات يدوية</small></article>
    </section>

    <section className="ops-panel">
      <div className="section-heading"><div><span className="eyebrow">Payroll Workflow</span><h3>إجراءات المسير</h3></div><Banknote size={20}/></div>
      <div className="ops-inline-actions">
        {!runId && <button className="primary-button" disabled={busy || !canManageHr} onClick={() => void act(() => generatePayroll(branchId, month, year), 'تم إنشاء مسير الرواتب.')}>إنشاء المسير</button>}
        {status === 'draft' && <button className="primary-button" disabled={busy || !canManageHr} onClick={() => void act(() => submitPayroll(runId), 'تم إرسال المسير لمراجعة HR.')}>إرسال للمراجعة <Send size={16}/></button>}
        {status === 'hr_review' && <><button className="primary-button" disabled={busy || !canManageHr} onClick={() => void act(() => decideHrPayroll(runId, 'approved'), 'تم اعتماد HR وتحويل المسير للمالية.')}>اعتماد HR</button><button className="secondary-button" disabled={busy || !canManageHr} onClick={() => void act(() => decideHrPayroll(runId, 'rejected', 'إرجاع للمراجعة والتعديل'), 'تم إرجاع المسير للتعديل.')}>إرجاع</button></>}
        {status === 'finance_review' && <><button className="primary-button" disabled={busy || !canManageFinance} onClick={() => void act(() => decideFinancePayroll(runId, 'approved'), 'تم اعتماد المالية وقفل المسير للصرف.')}>اعتماد المالية</button><button className="secondary-button" disabled={busy || !canManageFinance} onClick={() => void act(() => decideFinancePayroll(runId, 'rejected', 'إرجاع من المراجعة المالية'), 'تم إرجاع المسير للتعديل.')}>إرجاع</button></>}
        {status === 'paid' && <span className="ops-status">تم الصرف · {text(run.payment_reference, 'بدون مرجع')}</span>}
      </div>
      {status === 'locked' && <div className="ops-form-grid"><label><span>مصدر دفع المرتبات</span><select value={paymentSource} onChange={(e) => setPaymentSource(e.target.value)}><option value="">اختر خزنة أو بنك</option>{sources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label><label><span>مرجع العملية</span><input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="مثال: Payroll 09/2026"/></label><label className="wide"><span>ملاحظة الصرف</span><input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)}/></label><div className="wide ops-inline-actions"><button className="primary-button" disabled={busy || !canManageFinance || !sources.length} onClick={() => void pay()}><CircleDollarSign size={16}/> تفويض صرف المرتبات</button>{hasDelegatedPayment && <span className="ops-status is-warning">يوجد تفويض صرف قائم بالفعل</span>}</div></div>}
    </section>

    {adjusting && <section className="ops-panel"><h3>{adjustmentType === 'earning' ? 'إضافة حافز' : 'إضافة خصم'} — {text(adjusting.employee_name)}</h3><div className="ops-form-grid"><label><span>النوع</span><select value={adjustmentType} onChange={(e) => setAdjustmentType(e.target.value as 'earning' | 'deduction')}><option value="earning">حافز / إضافة</option><option value="deduction">خصم مالي</option></select></label><label><span>القيمة</span><input type="number" min="0.01" step="0.01" value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(e.target.value)}/></label><label className="wide"><span>السبب</span><input value={adjustmentNote} onChange={(e) => setAdjustmentNote(e.target.value)} placeholder="اكتب سبب واضح يظهر في سجل الرواتب"/></label></div><div className="ops-inline-actions"><button className="primary-button" disabled={busy} onClick={() => void saveAdjustment()}>حفظ وإعادة الحساب</button><button className="secondary-button" onClick={() => setAdjusting(null)}>إلغاء</button></div></section>}

    <section className="section-card"><div className="section-heading"><div><span className="eyebrow">Employee Breakdown</span><h3>تفاصيل الموظفين</h3><p className="muted">المديونية معروضة كمعلومة مستقلة؛ لا تخصم تلقائيًا من الراتب إلا وفق سياسة/تسوية معتمدة.</p></div></div><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>الموظف</th><th>الأساسي</th><th>الحضور</th><th>غياب</th><th>خصم الغياب</th><th>تأخير/انصراف</th><th>سلفة</th><th>حافز يدوي</th><th>خصم يدوي</th><th>مديونية</th><th>الصافي</th><th>إجراء</th></tr></thead><tbody>{items.map((item) => { const debt = employeeDebts.get(text(item.employee_id)) || 0; return <tr key={text(item.id)}><td><strong>{text(item.employee_name)}</strong><br/><small>{text(item.employee_code,'')}</small></td><td>{money(num(item.base_salary))}</td><td>{number(num(item.attended_days))} يوم</td><td>{number(num(item.absent_days) + num(item.unpaid_leave_days))} يوم</td><td>{money(num(item.absence_deduction) + num(item.unpaid_leave_deduction))}</td><td>{number(num(item.late_minutes) + num(item.early_departure_minutes))} د · {money(num(item.late_deduction) + num(item.early_deduction))}</td><td>{money(num(item.advance_deduction))}</td><td className="positive-text">{money(num(item.manual_earnings))}</td><td className="negative-text">{money(num(item.manual_deductions))}</td><td className={debt > 0 ? 'negative-text' : ''}>{money(debt)}</td><td><strong>{money(num(item.net_amount))}</strong></td><td><div className="ops-row-actions"><button disabled={status !== 'draft' || !canManageHr} onClick={() => { setAdjusting(item); setAdjustmentType('earning'); }}><Gift size={14}/> حافز</button><button className="is-danger" disabled={status !== 'draft' || !canManageHr} onClick={() => { setAdjusting(item); setAdjustmentType('deduction'); }}><MinusCircle size={14}/> خصم</button></div></td></tr>; })}{!items.length && <tr><td colSpan={12}>لا يوجد مسير مولد لهذه الفترة.</td></tr>}</tbody></table></div></section>
  </div>;
}

function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function num(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function text(value: unknown, fallback = '—') { return value == null || value === '' ? fallback : String(value); }
function message(value: unknown) { return value instanceof Error ? value.message : 'تعذر تنفيذ العملية.'; }
function monthLabel(month: number) { return ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][month - 1] || String(month); }
function statusLabel(status: string) { const labels: Record<string,string> = { not_generated:'لم يُنشأ', draft:'مسودة', hr_review:'مراجعة HR', finance_review:'مراجعة المالية', locked:'معتمد وجاهز للصرف', paid:'تم الصرف' }; return labels[status] || status; }
function statusTone(status: string) { return status === 'paid' ? '' : status === 'locked' || status.includes('review') ? 'is-warning' : status === 'draft' ? '' : 'is-danger'; }
function cairoParts() { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).formatToParts(new Date()).map((part)=>[part.type,part.value])); return { year:Number(parts.year), month:Number(parts.month) }; }
