import { useEffect, useMemo, useState } from 'react';
import { Banknote, FileText, PackageCheck, RefreshCcw, TrendingUp, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import MetricCard, { money, number } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { DonutChart, RankedBarChart, TrendAreaChart, WaterfallChart } from '../components/ReportVisuals';
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

  const profitBridge = data ? [
    { label: 'إجمالي المبيعات', value: data.profit.grossSales },
    { label: 'الخصومات', value: -data.profit.discounts },
    { label: 'المرتجعات', value: -data.profit.returns },
    { label: 'COGS', value: -(data.profit.cogs ?? 0) },
    { label: 'رسوم الدفع', value: -data.profit.paymentFees },
    { label: 'المصروفات', value: -data.profit.expenses },
    { label: 'النتيجة التشغيلية', value: data.profit.operatingResult ?? 0 },
  ] : [];

  return <div className="stack-lg">
    <section className="hero-panel">
      <div>
        <span className="eyebrow">Business Command Center · Reporting V2</span>
        <h2>{selectedBranch?.branch_name || 'كل أرقام المعداوي'} في مكان واحد</h2>
        <p>مركز متابعة بصري مبني على Invoice V2 ودفاتر الدفع والخزن، بدون نسب نمو ثابتة أو أرقام تجميلية.</p>
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

    {data && <section className="report-visual-grid">
      <TrendAreaChart
        eyebrow="Sales Trend"
        title="اتجاه صافي المبيعات"
        valueLabel="صافي المبيعات"
        points={data.timeline.map((point) => ({ label: point.label, value: point.amount }))}
      />
      <DonutChart
        eyebrow="Channel Mix"
        title="POS مقابل Online"
        segments={data.channels.map((channel) => ({ label: channel.label, value: Math.max(0, channel.amount) }))}
      />
    </section>}

    {data && <section className="report-visual-grid">
      <DonutChart
        eyebrow="Payment Mix"
        title="توزيع التحصيل حسب وسيلة الدفع"
        segments={data.payments.map((payment) => ({ label: payment.label, value: Math.max(0, payment.amount) }))}
      />
      <WaterfallChart eyebrow="Profit Bridge" title="جسر تكوين الربح" points={profitBridge}/>
    </section>}

    <section className="split-grid">
      <article className="section-card quick-stats">
        <div className="section-heading"><div><span className="eyebrow">مؤشرات سريعة</span><h3>جودة المبيعات</h3></div><PackageCheck size={20}/></div>
        <div className="quick-stat"><span>متوسط الفاتورة</span><strong>{loading ? '…' : money(data?.averageBasket)}</strong></div>
        <div className="quick-stat"><span>الوحدات المباعة</span><strong>{loading ? '…' : number(data?.unitsSold)}</strong></div>
        <div className="quick-stat"><span>المرتجعات</span><strong>{loading ? '…' : money(data?.returns)}</strong></div>
        <div className="quick-stat"><span>المصروفات</span><strong>{loading ? '…' : money(data?.expenses)}</strong></div>
      </article>

      <article className="section-card quick-stats">
        <div className="section-heading"><div><span className="eyebrow">وسائل الدفع</span><h3>صافي حركة التحصيل</h3></div><WalletCards size={20}/></div>
        {data?.payments?.length ? <RankedBarChart eyebrow="Net Collection" title="ترتيب وسائل الدفع" items={data.payments.map((payment) => ({ label: payment.label, value: payment.amount }))}/> : <EmptyData text="لا توجد تحصيلات في الفترة المحددة."/>}
      </article>
    </section>

    <section className="section-card roadmap-card">
      <div><span className="eyebrow">Deep Dive</span><h3>التقارير التفصيلية</h3><p>انتقل من النظرة التنفيذية إلى المبيعات، الربحية، المنتجات، المخزون، وسائل الدفع، المرتجعات، الكاشير، العملاء والفروع.</p></div>
      <Link className="primary-button" to="/reports">فتح مركز التقارير</Link>
    </section>
  </div>;
}

function EmptyData({ text }: { text: string }) {
  return <div className="empty-data"><span>—</span><p>{text}</p></div>;
}
