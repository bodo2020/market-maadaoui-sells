import { useEffect, useMemo, useState } from 'react';
import { Banknote, FileText, PackageCheck, ReceiptText, RefreshCcw, ShoppingBasket, TrendingUp, WalletCards } from 'lucide-react';
import MetricCard, { money, number } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { useBusiness } from '../context/BusinessContext';
import { fetchOverview, type BusinessFilters, type OverviewData, type PeriodKey } from '../services/businessFinance';

export default function Dashboard() {
  const { selectedBranch } = useBusiness();
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [data, setData] = useState<OverviewData | null>(null);
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
      setData(await fetchOverview(filters));
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات التقارير.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [filters]);

  return <div className="stack-lg">
    <section className="hero-panel">
      <div>
        <span className="eyebrow">مركز متابعة الأعمال</span>
        <h2>{selectedBranch?.branch_name || 'كل أرقام المعداوي'} في مكان واحد</h2>
        <p>بيانات فعلية من Invoice V2 ودفاتر الدفع والخزن، مع تطبيق صلاحيات الفرع على الخادم.</p>
      </div>
      <PeriodSwitcher period={period} onChange={setPeriod} />
    </section>

    {error && <section className="engine-banner">
      <div><strong>تعذر تحميل بيانات الفرع</strong><p>{error}</p></div>
      <button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button>
    </section>}

    <section className="metrics-grid">
      <MetricCard title="صافي المبيعات" value={loading ? '…' : money(data?.netSales.value)} change={data?.netSales.changePercent} icon={TrendingUp}/>
      <MetricCard title="إجمالي ربح POS" value={loading ? '…' : money(data?.grossProfit.value)} change={data?.grossProfit.changePercent} icon={Banknote} emphasis="success"/>
      <MetricCard title="النتيجة التشغيلية المعروفة" value={loading ? '…' : money(data?.netProfit.value)} change={data?.netProfit.changePercent} icon={WalletCards} emphasis="success" hint="تستبعد ربح الأونلاين غير المكتمل"/>
      <MetricCard title="عدد الفواتير والطلبات" value={loading ? '…' : number(data?.invoices.value)} change={data?.invoices.changePercent} icon={FileText}/>
    </section>

    {data && !data.profit.onlineProfitComplete && <p className="data-scope-note">الربحية الحالية محسوبة من فواتير POS المكتملة؛ مبيعات الأونلاين ظاهرة في الإيراد، لكن تكلفة وربح الأونلاين لم يكتمل ربطهما بعد.</p>}

    <section className="split-grid">
      <article className="section-card">
        <div className="section-heading"><div><span className="eyebrow">اتجاه المبيعات</span><h3>حركة الفترة</h3></div><TrendingUp size={20}/></div>
        <div className="timeline-chart">{data?.timeline?.length ? data.timeline.map((point, index) => {
          const max = Math.max(...data.timeline.map((item) => item.amount), 1);
          return <div className="chart-column" key={`${point.label}-${index}`}>
            <div className="chart-bar" style={{ height: `${Math.max(8, (Math.max(point.amount, 0) / max) * 100)}%` }} title={money(point.amount)}/>
            <span>{point.label}</span>
          </div>;
        }) : <EmptyData text="لا توجد مبيعات مسجلة داخل الفترة."/>}</div>
      </article>
      <article className="section-card">
        <div className="section-heading"><div><span className="eyebrow">قنوات البيع</span><h3>POS مقابل Online</h3></div><ShoppingBasket size={20}/></div>
        <div className="rows-list">{data?.channels?.map((channel) => <div className="data-row" key={channel.key}><span>{channel.label}</span><strong>{money(channel.amount)}</strong></div>)}</div>
      </article>
    </section>

    <section className="split-grid">
      <article className="section-card">
        <div className="section-heading"><div><span className="eyebrow">التحصيل</span><h3>وسائل الدفع</h3></div><ReceiptText size={20}/></div>
        <div className="rows-list">{data?.payments?.length ? data.payments.map((payment) => <div className="data-row data-row--two-line" key={payment.key}>
          <div><span>{payment.label}</span>{payment.fee !== 0 && <small>رسوم {money(payment.fee)}</small>}</div>
          <strong>{money(payment.amount)}</strong>
        </div>) : <EmptyData text="لا توجد تحصيلات في الفترة المحددة."/>}</div>
      </article>
      <article className="section-card quick-stats">
        <div className="section-heading"><div><span className="eyebrow">مؤشرات سريعة</span><h3>جودة المبيعات</h3></div><PackageCheck size={20}/></div>
        <div className="quick-stat"><span>متوسط الفاتورة</span><strong>{loading ? '…' : money(data?.averageBasket)}</strong></div>
        <div className="quick-stat"><span>الوحدات المباعة</span><strong>{loading ? '…' : number(data?.unitsSold)}</strong></div>
        <div className="quick-stat"><span>المرتجعات</span><strong>{loading ? '…' : money(data?.returns)}</strong></div>
        <div className="quick-stat"><span>المصروفات</span><strong>{loading ? '…' : money(data?.expenses)}</strong></div>
      </article>
    </section>
  </div>;
}

function EmptyData({ text }: { text: string }) {
  return <div className="empty-data"><span>—</span><p>{text}</p></div>;
}
