import { useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarDays, FileText, PackageCheck, Printer, RefreshCcw, TrendingUp, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import MetricCard, { money, number } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { DonutChart, RankedBarChart, TrendAreaChart, WaterfallChart } from '../components/ReportVisuals';
import { useBusiness } from '../context/BusinessContext';
import { fetchOverview, type BusinessFilters, type OverviewData, type PeriodKey } from '../services/businessFinance';
import { getReportingMetric, metricLabel } from '../services/reportingMetrics';
import { makeCairoCustomRange } from '../services/salesReporting';
import './sales-report.css';

export default function Dashboard() {
  const { selectedBranch } = useBusiness();
  const today = cairoToday();
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const customRange = useMemo(() => {
    if (period !== 'custom') return null;
    try { return makeCairoCustomRange(customFrom, customTo); } catch { return null; }
  }, [period, customFrom, customTo]);

  const filters = useMemo<BusinessFilters | null>(
    () => selectedBranch && (period !== 'custom' || customRange) ? {
      period,
      branchId: selectedBranch.branch_id,
      from: customRange?.from,
      to: customRange?.to,
    } : null,
    [period, selectedBranch, customRange],
  );

  async function load() {
    if (!filters) {
      if (period === 'custom') setError('اختر نطاق تاريخ صحيح.');
      return;
    }
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

  const knownResultMetric = getReportingMetric('known_operating_result');
  const profitBridge = data ? [
    { label: metricLabel('gross_sales', true), value: data.profit.grossSales },
    { label: 'الخصومات', value: -data.profit.discounts },
    { label: metricLabel('returns', true), value: -data.profit.returns },
    { label: metricLabel('pos_net_cogs', true), value: -(data.profit.cogs ?? 0) },
    { label: metricLabel('merchant_payment_fees', true), value: -data.profit.paymentFees },
    { label: metricLabel('expenses', true), value: -data.profit.expenses },
    { label: metricLabel('known_operating_result', true), value: data.profit.operatingResult ?? 0 },
  ] : [];

  return <div className="stack-lg">
    <section className="hero-panel">
      <div>
        <span className="eyebrow">Business Command Center · Reporting V2</span>
        <h2>{selectedBranch?.branch_name || 'كل أرقام المعداوي'} في مكان واحد</h2>
        <p>مركز متابعة بصري مبني على Invoice V2 ودفاتر الدفع والخزن، مع قاموس مؤشرات موحد وبدون نسب نمو ثابتة أو أرقام تجميلية.</p>
      </div>
      <div className="sales-period-control"><PeriodSwitcher period={period} onChange={setPeriod}/><button type="button" className={period === 'custom' ? 'custom-period-button active' : 'custom-period-button'} onClick={() => setPeriod('custom')}><CalendarDays size={16}/> مخصص</button><button type="button" className="custom-period-button" onClick={() => window.print()}><Printer size={16}/> PDF</button></div>
    </section>

    {period === 'custom' && <section className="section-card custom-date-panel"><div><span className="eyebrow">Executive Range</span><h3>فترة مخصصة</h3><p>المقارنة مع الفترة السابقة تُحسب تلقائيًا بنفس طول الفترة، وتاريخ النهاية يدخل كاملًا بتوقيت القاهرة.</p></div><div className="custom-date-inputs"><label><span>من</span><input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)}/></label><label><span>إلى</span><input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)}/></label></div></section>}

    {error && <section className="engine-banner">
      <div><strong>تعذر تحميل بيانات الفرع</strong><p>{error}</p></div>
      <button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button>
    </section>}

    <section className="metrics-grid">
      <MetricCard title={metricLabel('net_sales')} value={loading ? '…' : money(data?.netSales.value)} change={data?.netSales.changePercent} icon={TrendingUp}/>
      <MetricCard title={metricLabel('pos_gross_profit')} value={loading ? '…' : money(data?.grossProfit.value)} change={data?.grossProfit.changePercent} icon={Banknote} emphasis="success"/>
      <MetricCard title={knownResultMetric.label} value={loading ? '…' : money(data?.netProfit.value)} change={data?.netProfit.changePercent} icon={WalletCards} emphasis="success" hint={knownResultMetric.caveat}/>
      <MetricCard title={metricLabel('transactions')} value={loading ? '…' : number(data?.invoices.value)} change={data?.invoices.changePercent} icon={FileText}/>
    </section>

    {data && !data.profit.onlineProfitComplete && <p className="data-scope-note">{getReportingMetric('pos_gross_profit').caveat} مبيعات الأونلاين تظهر داخل صافي الإيراد، لكن لا يتم تخمين ربحها.</p>}

    {data && <section className="report-visual-grid">
      <TrendAreaChart
        eyebrow="Sales Trend"
        title={`اتجاه ${metricLabel('net_sales')}`}
        valueLabel={metricLabel('net_sales')}
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
        <div className="quick-stat"><span>{metricLabel('average_ticket', true)}</span><strong>{loading ? '…' : money(data?.averageBasket)}</strong></div>
        <div className="quick-stat"><span>{metricLabel('items_sold', true)}</span><strong>{loading ? '…' : number(data?.unitsSold)}</strong></div>
        <div className="quick-stat"><span>{metricLabel('returns', true)}</span><strong>{loading ? '…' : money(data?.returns)}</strong></div>
        <div className="quick-stat"><span>{metricLabel('expenses', true)}</span><strong>{loading ? '…' : money(data?.expenses)}</strong></div>
      </article>

      {data?.payments?.length
        ? <RankedBarChart eyebrow="Net Collection" title={metricLabel('payment_net_movement')} items={data.payments.map((payment) => ({ label: payment.label, value: payment.amount }))}/>
        : <article className="section-card quick-stats"><div className="section-heading"><div><span className="eyebrow">وسائل الدفع</span><h3>{metricLabel('payment_net_movement')}</h3></div><WalletCards size={20}/></div><EmptyData text="لا توجد تحصيلات في الفترة المحددة."/></article>}
    </section>

    <section className="section-card roadmap-card">
      <div><span className="eyebrow">Deep Dive</span><h3>التقارير التفصيلية</h3><p>انتقل من النظرة التنفيذية إلى المبيعات، الربحية، المنتجات، المخزون، وسائل الدفع، المرتجعات، الكاشير، العملاء والفروع. قاموس المؤشرات داخل مركز التقارير يوضح مصدر وصيغة كل رقم أساسي.</p></div>
      <Link className="primary-button" to="/reports">فتح مركز التقارير</Link>
    </section>
  </div>;
}

function EmptyData({ text }: { text: string }) {
  return <div className="empty-data"><span>—</span><p>{text}</p></div>;
}

function cairoToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
