import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpLeft, Banknote, Building2, CreditCard, Landmark, RefreshCcw, WalletCards } from 'lucide-react';
import { money, number } from '../components/MetricCard';
import { useBusiness } from '../context/BusinessContext';
import { PeriodSwitcher } from './Dashboard';
import {
  fetchFinanceWorkspace,
  fetchOverview,
  type BusinessFilters,
  type FinanceAccount,
  type FinanceWorkspace,
  type OverviewData,
  type PeriodKey,
} from '../services/businessFinance';

const iconMap = { cash: Banknote, bank: Landmark, card: CreditCard, wallet: WalletCards, other: Building2 };

export default function Finance() {
  const { selectedBranch } = useBusiness();
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [workspace, setWorkspace] = useState<FinanceWorkspace | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filters = useMemo<BusinessFilters | null>(
    () => selectedBranch ? { period, branchId: selectedBranch.branch_id } : null,
    [period, selectedBranch],
  );

  async function load() {
    if (!filters) return;
    setLoading(true);
    setError(null);
    try {
      const canViewReports = selectedBranch?.permissions.includes('reports.view') === true;
      const [nextWorkspace, nextOverview] = await Promise.all([
        fetchFinanceWorkspace(filters),
        canViewReports ? fetchOverview(filters) : Promise.resolve(null),
      ]);
      setWorkspace(nextWorkspace);
      setOverview(nextOverview);
    } catch (cause) {
      setWorkspace(null);
      setOverview(null);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل البيانات المالية.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [filters]);

  const cashflow = workspace?.cashflow || [];
  const incoming = cashflow.filter((item) => item.direction === 'in').reduce((sum, item) => sum + item.amount, 0);
  const outgoing = cashflow.filter((item) => item.direction === 'out').reduce((sum, item) => sum + Math.abs(item.amount), 0);

  return <div className="stack-lg">
    <section className="page-intro page-intro--with-filter">
      <div><span className="eyebrow">Finance Workspace</span><h2>أين توجد أموال الشركة الآن؟</h2><p>الحسابات، المحافظ، التدفقات والتسويات من دفاتر مالية واحدة قابلة للمراجعة.</p></div>
      <PeriodSwitcher period={period} onChange={setPeriod}/>
    </section>

    {error && <section className="engine-banner">
      <div><strong>تعذر تحميل النظام المالي</strong><p>{error}</p></div>
      <button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button>
    </section>}

    <section className="finance-summary-grid">
      <SummaryCard title="إجمالي السيولة" value={workspace?.summary.liquidFunds} loading={loading}/>
      <SummaryCard title="النقدية التشغيلية" value={workspace?.summary.operationalCash} loading={loading}/>
      <SummaryCard title="أموال قيد التحويل" value={workspace?.summary.inTransit} loading={loading}/>
      <SummaryCard title="تنبيهات تحتاج مراجعة" value={workspace?.summary.attentionCount} loading={loading} numeric/>
    </section>

    <section className="account-grid">
      {loading
        ? [1, 2, 3, 4].map((item) => <AccountSkeleton key={item}/>)
        : workspace?.accounts.length
          ? workspace.accounts.map((account) => <AccountCard account={account} key={account.id}/>)
          : <article className="section-card account-grid__empty">لا توجد حسابات مالية مفعلة لهذا الفرع.</article>}
    </section>

    <section className="split-grid">
      <article className="section-card">
        <div className="section-heading"><div><span className="eyebrow">Cash Flow</span><h3>حركات الفترة</h3></div></div>
        <div className="flow-summary">
          <div className="flow-chip flow-chip--in"><ArrowUpLeft size={18}/><div><span>داخل</span><strong>{loading ? '…' : money(incoming)}</strong></div></div>
          <div className="flow-chip flow-chip--out"><ArrowDownRight size={18}/><div><span>خارج</span><strong>{loading ? '…' : money(outgoing)}</strong></div></div>
        </div>
        <div className="net-flow"><span>صافي الحركات المعروضة</span><strong>{loading ? '…' : money(incoming - outgoing)}</strong></div>
        <p className="muted flow-disclaimer">القيمة مبنية على الحركات المسجلة في دفاتر الخزن والدفع داخل الفترة.</p>
      </article>
      <ProfitWaterfall overview={overview} loading={loading}/>
    </section>

    <section className="section-card">
      <div className="section-heading"><div><span className="eyebrow">آخر الحركات</span><h3>التدفقات المالية</h3></div></div>
      <div className="rows-list">{cashflow.length ? cashflow.map((item) => <div className="data-row data-row--two-line" key={item.id}>
        <div><span>{item.label}</span><small>{item.accountName ? `${item.accountName} · ` : ''}{new Date(item.occurredAt).toLocaleString('ar-EG')}</small></div>
        <strong className={item.direction === 'in' ? 'positive-text' : 'negative-text'}>{item.direction === 'in' ? '+' : '−'} {money(Math.abs(item.amount))}</strong>
      </div>) : <div className="empty-data"><span>—</span><p>لا توجد حركات مالية مسجلة داخل الفترة المحددة.</p></div>}</div>
    </section>
  </div>;
}

function SummaryCard({ title, value, loading, numeric = false }: { title: string; value?: number; loading: boolean; numeric?: boolean }) {
  return <article className="finance-summary"><span>{title}</span><strong>{loading ? '…' : numeric ? number(value) : money(value)}</strong></article>;
}

function AccountCard({ account }: { account: FinanceAccount }) {
  const Icon = iconMap[account.kind] || Building2;
  return <article className="account-card">
    <div className="account-card__icon"><Icon size={22}/></div>
    <span>{account.name}</span>
    <strong>{money(account.balance)}</strong>
    <small className="account-type">{accountTypeLabel(account.accountType)}</small>
  </article>;
}

function AccountSkeleton() {
  return <article className="account-card account-card--empty"><div className="skeleton small"/><div className="skeleton medium"/><div className="skeleton wide"/></article>;
}

function accountTypeLabel(type: string) {
  if (type === 'branch_safe') return 'خزنة الفرع';
  if (type === 'pos_drawer') return 'درج كاشير';
  if (type === 'online_collection') return 'تحصيل أونلاين';
  if (type === 'gateway_clearing') return 'حساب تسوية';
  if (type === 'bank') return 'حساب بنكي';
  return type;
}

function ProfitWaterfall({ overview, loading }: { overview: OverviewData | null; loading: boolean }) {
  const profit = overview?.profit;
  const rows = [
    { label: 'إجمالي المبيعات', value: profit?.grossSales, tone: 'positive' },
    { label: 'الخصومات والولاء', value: profit ? -profit.discounts : undefined, tone: 'negative' },
    { label: 'المرتجعات', value: profit ? -profit.returns : undefined, tone: 'negative' },
    { label: 'صافي المبيعات', value: profit?.netSales, tone: 'strong' },
    { label: 'تكلفة البضاعة POS', value: profit?.cogs == null ? undefined : -profit.cogs, tone: 'negative' },
    { label: 'إجمالي ربح POS', value: profit?.grossProfit, tone: 'strong' },
    { label: 'رسوم الدفع على المتجر', value: profit ? -profit.paymentFees : undefined, tone: 'negative' },
    { label: 'المصروفات', value: profit ? -profit.expenses : undefined, tone: 'negative' },
    { label: 'النتيجة التشغيلية المعروفة', value: profit?.operatingResult, tone: 'result' },
  ];

  return <article className="section-card">
    <div className="section-heading"><div><span className="eyebrow">Profit Waterfall</span><h3>تكوين الربح</h3></div></div>
    <div className="profit-waterfall">{rows.map((row) => <div className={`profit-row profit-row--${row.tone}`} key={row.label}><span>{row.label}</span><strong>{loading ? '…' : money(row.value)}</strong></div>)}</div>
    {profit && !profit.onlineProfitComplete && <p className="muted flow-disclaimer">الربحية تستبعد تكلفة وربح طلبات الأونلاين حتى اكتمال مصدر التكلفة الخاص بها.</p>}
  </article>;
}
