import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeDollarSign, RefreshCcw, Search, UserRound, UsersRound, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money } from '../components/MetricCard';
import { useBusiness } from '../context/BusinessContext';
import { fetchDebtsWorkspace, postCustomerDebt, postEmployeeDebt, searchDebtParties } from '../services/businessOperations';
import type { ReportDocument } from '../services/reportingDetails';
import './operations-admin.css';

type Tab = 'customer' | 'employee' | 'supplier';
type Party = Record<string, unknown>;

export default function DebtsPage() {
  const { selectedBranch } = useBusiness();
  const branchId = selectedBranch?.branch_id || '';
  const canManage = Boolean(selectedBranch?.permissions.includes('finance.manage'));
  const [data, setData] = useState<ReportDocument | null>(null);
  const [tab, setTab] = useState<Tab>('customer');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchRows, setSearchRows] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [operation, setOperation] = useState<'charge' | 'payment'>('charge');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  async function load() {
    if (!branchId) return;
    setLoading(true); setError(null);
    try { setData(await fetchDebtsWorkspace(branchId, 300)); }
    catch (cause) { setData(null); setError(message(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [branchId]);
  useEffect(() => { setSelectedParty(null); setSearchRows([]); setSearch(''); setAmount(''); setDescription(''); }, [tab]);

  const summary = record(data?.summary);
  const currentRows = useMemo(() => tab === 'customer' ? rows(data?.customers) : tab === 'employee' ? rows(data?.employees) : rows(data?.suppliers), [data, tab]);

  async function runSearch() {
    if (!branchId || tab === 'supplier' || search.trim().length < 2) return;
    setBusy(true); setError(null);
    try { const result = await searchDebtParties(branchId, tab, search.trim()); setSearchRows(rows(result.rows)); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!selectedParty || !branchId || !canManage) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || description.trim().length < 3) { setError('اكتب قيمة صحيحة وسبب واضح للحركة.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      if (tab === 'customer') await postCustomerDebt(branchId, text(selectedParty.id), operation, value, description.trim());
      else if (tab === 'employee') await postEmployeeDebt(branchId, text(selectedParty.id), operation === 'payment' ? -value : value, description.trim());
      setNotice(operation === 'payment' ? 'تم تسجيل السداد وتحديث الرصيد.' : 'تم تسجيل المديونية وتحديث الرصيد.');
      setSelectedParty(null); setAmount(''); setDescription(''); setSearchRows([]); setSearch(''); await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  function selectExisting(row: Party, nextOperation: 'charge' | 'payment') {
    setSelectedParty(row); setOperation(nextOperation); setAmount(''); setDescription(nextOperation === 'payment' ? 'تحصيل مديونية' : 'إضافة مديونية');
  }

  return <div className="stack-lg ops-page">
    <section className="ops-head"><div className="ops-head__title"><Link to="/finance" className="back-button"><ArrowRight size={19}/></Link><span className="report-card__icon"><BadgeDollarSign size={21}/></span><div><span className="eyebrow">Receivables & Payables</span><h2>المديونيات</h2><p>العملاء والموظفون والموردون في شاشة واحدة، مع فصل ما لنا عن ما علينا وعدم خلط الرصيد الحالي بحركة الفترة.</p></div></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={16}/> تحديث</button></section>

    {error && <section className="engine-banner"><div><strong>تعذر تنفيذ العملية</strong><p>{error}</p></div></section>}
    {notice && <section className="section-card"><strong className="positive-text">{notice}</strong></section>}

    <section className="ops-action-grid">
      <article className="ops-action-card"><span>مديونيات العملاء</span><strong>{loading ? '…' : money(num(summary.customer_receivables))}</strong><small className="muted">مبالغ مستحقة للشركة</small></article>
      <article className="ops-action-card"><span>مديونيات الموظفين</span><strong>{loading ? '…' : money(num(summary.employee_receivables))}</strong><small className="muted">مشتريات/تسويات على الموظفين</small></article>
      <article className="ops-action-card"><span>إجمالي مستحقات الشركة</span><strong>{loading ? '…' : money(num(summary.total_receivables))}</strong><small className="muted">عملاء + موظفون</small></article>
      <article className="ops-action-card"><span>مستحقات الموردين</span><strong>{loading ? '…' : money(num(summary.supplier_payables))}</strong><small className="muted">مبالغ على الشركة للموردين</small></article>
    </section>

    <section className="section-card"><div className="debt-tabs"><button className={tab === 'customer' ? 'active' : ''} onClick={() => setTab('customer')}><UserRound size={15}/> العملاء</button><button className={tab === 'employee' ? 'active' : ''} onClick={() => setTab('employee')}><UsersRound size={15}/> الموظفون</button><button className={tab === 'supplier' ? 'active' : ''} onClick={() => setTab('supplier')}><Truck size={15}/> الموردون</button></div></section>

    {tab !== 'supplier' && canManage && <section className="ops-panel"><h3>{tab === 'customer' ? 'تسجيل حركة على عميل' : 'تسجيل/تحصيل مديونية موظف'}</h3><div className="ops-form-grid"><label className="wide"><span>ابحث بالاسم أو الهاتف</span><div className="ops-inline-actions"><input style={{flex:1}} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(); } }}/><button className="secondary-button" type="button" disabled={busy || search.trim().length < 2} onClick={() => void runSearch()}><Search size={15}/> بحث</button></div></label></div>{searchRows.length > 0 && !selectedParty && <div className="search-results">{searchRows.map((row) => <button className="search-result" type="button" key={text(row.id)} onClick={() => { setSelectedParty(row); setOperation('charge'); setDescription('إضافة مديونية'); }}><div><strong>{text(row.name)}</strong><small>{text(row.phone,'')}</small></div><span>اختيار</span></button>)}</div>}{selectedParty && <><div className="ops-form-grid"><label><span>الطرف</span><input value={text(selectedParty.name)} disabled/></label><label><span>نوع الحركة</span><select value={operation} onChange={(e) => setOperation(e.target.value as 'charge' | 'payment')}><option value="charge">زيادة المديونية</option><option value="payment">تسجيل سداد</option></select></label><label><span>القيمة</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}/></label><label><span>الوصف</span><input value={description} onChange={(e) => setDescription(e.target.value)}/></label></div><div className="ops-inline-actions"><button className="primary-button" disabled={busy} onClick={() => void save()}>حفظ الحركة</button><button className="secondary-button" onClick={() => setSelectedParty(null)}>إلغاء</button></div></>}</section>}

    <section className="ops-panel"><div className="section-heading"><div><span className="eyebrow">Current Balances</span><h3>{tabLabel(tab)}</h3><p className="muted">الأرصدة الحالية فقط. تقرير المديونيات يفصل عنها حركة الفترة.</p></div></div><div className="debt-list">{currentRows.map((row) => <article className="debt-card" key={`${tab}-${text(row.id)}`}><div className="debt-card__identity"><strong>{text(row.name)}</strong><small>{text(row.phone,'')}{tab === 'employee' && row.payroll_deduction_enabled ? ' · خصم الراتب مفعّل' : ''}{tab === 'supplier' && num(row.balance) < 0 ? ' · رصيد دائن لصالح الشركة' : ''}</small></div><div className={`debt-card__amount ${tab === 'supplier' && num(row.balance) < 0 ? 'is-credit' : ''}`}>{money(Math.abs(num(row.balance)))}</div>{tab !== 'supplier' && canManage && <div className="debt-card__actions"><button onClick={() => selectExisting(row,'payment')}>تسجيل سداد</button><button onClick={() => selectExisting(row,'charge')}>زيادة</button></div>}</article>)}{!currentRows.length && <div className="empty-data"><span>—</span><p>لا توجد أرصدة مديونية حالية في هذا القسم.</p></div>}</div>{tab === 'supplier' && <p className="muted">ديون الموردين مأخوذة من Supplier Ledger ولا يتم تعديلها يدويًا هنا؛ الزيادة تأتي من فاتورة شراء والخصم من دفعة مورد فعلية.</p>}</section>
  </div>;
}

function rows(value: unknown): Party[] { return Array.isArray(value) ? value.filter((item): item is Party => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []; }
function record(value: unknown): Party { return value && typeof value === 'object' && !Array.isArray(value) ? value as Party : {}; }
function num(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function text(value: unknown, fallback = '—') { return value == null || value === '' ? fallback : String(value); }
function message(value: unknown) { return value instanceof Error ? value.message : 'تعذر تنفيذ العملية.'; }
function tabLabel(tab: Tab) { return tab === 'customer' ? 'مديونيات العملاء' : tab === 'employee' ? 'مديونيات الموظفين' : 'مستحقات الموردين'; }
