import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpLeft,
  CalendarDays,
  Clock3,
  Download,
  Gauge,
  Lightbulb,
  Printer,
  Receipt,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, number } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { DonutChart, RankedBarChart, TrendAreaChart } from '../components/ReportVisuals';
import { useBusiness } from '../context/BusinessContext';
import {
  resolvePeriod,
  type BusinessFilters,
  type PeriodKey,
} from '../services/businessFinance';
import {
  fetchDecisionCenterReport,
  type DecisionCenterBundle,
} from '../services/businessAnalytics';
import { makeCairoCustomRange } from '../services/salesReporting';
import './sales-report.css';
import './business-analytics.css';
import './decision-center.css';

type InsightLevel = 'attention' | 'opportunity' | 'info';
type Insight = {
  level: InsightLevel;
  title: string;
  body: string;
  to: string;
  action: string;
};

type PeakWindow = {
  start: number;
  end: number;
  total: number;
};

type PressureHour = {
  hour: number;
  activity: number;
  avgStaff: number;
  activityPerStaff: number;
};

export default function DecisionCenter() {
  const { selectedBranch } = useBusiness();
  const now = cairoParts();
  const today = `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [data, setData] = useState<DecisionCenterBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const customRange = useMemo(() => {
    if (period !== 'custom') return null;
    try { return makeCairoCustomRange(customFrom, customTo); } catch { return null; }
  }, [period, customFrom, customTo]);

  const filters = useMemo<BusinessFilters | null>(() => selectedBranch && (period !== 'custom' || customRange) ? {
    branchId: selectedBranch.branch_id,
    period,
    from: customRange?.from,
    to: customRange?.to,
  } : null, [selectedBranch, period, customRange]);

  const payrollContext = useMemo(
    () => inferPayrollContext(period, customFrom, now),
    [period, customFrom, now.year, now.month],
  );

  async function load() {
    if (!filters) {
      if (period === 'custom') setError('اختر نطاق تاريخ صحيح.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDecisionCenterReport(filters, payrollContext.month, payrollContext.year));
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل مركز القرار.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [filters, payrollContext.month, payrollContext.year]);

  const overview = data?.overview || null;
  const hourly = rows(data?.peak?.hourly);
  const coverageSummary = record(data?.coverage?.summary);
  const coverageHourly = rows(data?.coverage?.hourly);
  const wasteSummary = record(data?.waste?.summary);
  const wastePermissions = record(data?.waste?.permissions);
  const wasteProducts = rows(data?.waste?.products);
  const payrollRun = record(data?.payroll?.run);

  const netSales = overview?.netSales.value ?? null;
  const operatingResult = overview?.netProfit.value ?? null;
  const expenses = overview?.expenses ?? null;
  const payrollNet = nullable(payrollRun.total_net);
  const wasteLoss = Boolean(wastePermissions.can_view_cost_loss) ? nullable(wasteSummary.cost_loss) : null;
  const payrollComparable = Boolean(filters && isExactPayrollMonth(filters, payrollContext.year, payrollContext.month));
  const payrollRatio = payrollComparable && payrollNet != null && netSales != null && netSales !== 0
    ? (payrollNet / Math.abs(netSales)) * 100
    : null;
  const expenseRatio = expenses != null && netSales != null && netSales !== 0
    ? (expenses / Math.abs(netSales)) * 100
    : null;
  const wasteRatio = wasteLoss != null && netSales != null && netSales !== 0
    ? (wasteLoss / Math.abs(netSales)) * 100
    : null;

  const posWindow = peakWindow(hourly, 'pos_transactions');
  const onlineWindow = peakWindow(hourly, 'online_orders');
  const pressureHours = buildPressureHours(hourly, coverageHourly);
  const highestPressure = pressureHours[0] || null;
  const insights = buildInsights({
    salesChange: overview?.netSales.changePercent ?? null,
    operatingResult,
    expenseRatio,
    payrollNet,
    payrollRatio,
    payrollComparable,
    wasteLoss,
    wasteRatio,
    wasteProducts,
    posWindow,
    onlineWindow,
    highestPressure,
    hasCoverage: Boolean(data?.coverage),
  });

  const costSignals = [
    payrollNet != null ? { label: `مرتبات ${monthLabel(payrollContext.month)}`, value: payrollNet } : null,
    expenses != null ? { label: 'المصروفات المسجلة', value: expenses } : null,
    wasteLoss != null ? { label: 'خسارة التالف', value: wasteLoss } : null,
  ].filter((item): item is { label: string; value: number } => Boolean(item && Number.isFinite(item.value)));

  function exportCsv() {
    if (!data) return;
    const lines: Array<Array<string | number>> = [
      ['مركز القرار التشغيلي'],
      ['الفرع', selectedBranch?.branch_name || '—'],
      ['الفترة', periodLabel(period, customFrom, customTo)],
      [],
      ['المؤشر', 'القيمة'],
      ['صافي المبيعات', netSales ?? 'غير متاح'],
      ['النتيجة التشغيلية المعروفة', operatingResult ?? 'غير متاح'],
      ['المصروفات المسجلة', expenses ?? 'غير متاح'],
      [`صافي مرتبات ${monthLabel(payrollContext.month)} ${payrollContext.year}`, payrollNet ?? 'غير متاح'],
      ['تكلفة التالف', wasteLoss ?? 'غير متاح/محجوب'],
      ['إجمالي ساعات التواجد', data.coverage ? num(coverageSummary.staff_hours) : 'غير متاح/محجوب'],
      ['ذروة الفرع', posWindow ? windowLabel(posWindow) : 'غير متاح'],
      ['ذروة الأونلاين', onlineWindow ? windowLabel(onlineWindow) : 'غير متاح'],
      ['أعلى ضغط مقابل التغطية', highestPressure ? `${hourLabel(highestPressure.hour)} · ${number(highestPressure.activityPerStaff)} عملية/طلب لكل موظف` : 'غير متاح'],
      [],
      ['إشارات القرار'],
      ['الأولوية', 'العنوان', 'التفصيل'],
      ...insights.map((item) => [levelLabel(item.level), item.title, item.body]),
    ];
    const csv = lines.map((line) => line.map(csvCell).join(',')).join('\n');
    download(`elmadawy-decision-center-${today}.csv`, `\uFEFF${csv}`);
  }

  return <div className="stack-lg sales-report-page decision-center-page">
    <section className="report-detail-head sales-report-head decision-center-head">
      <div className="report-detail-head__title">
        <Link to="/reports" className="back-button" aria-label="العودة للتقارير"><ArrowRight size={19}/></Link>
        <span className="report-card__icon"><Gauge size={22}/></span>
        <div>
          <span className="eyebrow">Business Decision Center</span>
          <h2>مركز القرار التشغيلي</h2>
          <p>صورة واحدة تربط الأداء المالي، تكلفة العمالة، المصروفات، التالف، ضغط القنوات وتغطية الموظفين بدون خلط مصادر أو مضاعفة التكاليف.</p>
        </div>
      </div>
      <div className="sales-period-control">
        <PeriodSwitcher period={period} onChange={setPeriod}/>
        <button type="button" className={period === 'custom' ? 'custom-period-button active' : 'custom-period-button'} onClick={() => setPeriod('custom')}><CalendarDays size={16}/> مخصص</button>
      </div>
    </section>

    {period === 'custom' && <section className="section-card custom-date-panel">
      <div><span className="eyebrow">Decision Window</span><h3>فترة التحليل</h3><p>كل الأوقات بتوقيت القاهرة، وتاريخ النهاية يدخل كاملًا في الحساب.</p></div>
      <div className="custom-date-inputs">
        <label><span>من</span><input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)}/></label>
        <label><span>إلى</span><input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)}/></label>
      </div>
    </section>}

    <section className="section-card financial-report-actions">
      <div><span className="eyebrow">Decision Scope</span><strong>{selectedBranch?.branch_name || 'الفرع'} · {periodLabel(period, customFrom, customTo)}</strong></div>
      <div className="report-actions">
        <button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={16}/> طباعة / PDF</button>
        <button className="secondary-button" type="button" disabled={!data} onClick={exportCsv}><Download size={16}/> CSV</button>
      </div>
    </section>

    {error && <section className="engine-banner"><div><strong>تعذر تحميل مركز القرار</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}

    {data && Object.values(data.errors).some(Boolean) && <section className="decision-source-warnings">
      {Object.entries(data.errors).filter(([, value]) => Boolean(value)).map(([key, value]) => <div key={key}><AlertTriangle size={16}/><span><b>{sourceLabel(key)}:</b> {value}</span></div>)}
    </section>}

    <section className="decision-kpi-grid">
      {loading ? [1,2,3,4,5].map((item) => <article className="finance-summary" key={item}><span>جاري التحميل</span><div className="skeleton wide"/></article>) : <>
        <DecisionKpi label="صافي المبيعات" value={netSales == null ? '—' : money(netSales)} trend={overview?.netSales.changePercent ?? null}/>
        <DecisionKpi label="النتيجة التشغيلية المعروفة" value={operatingResult == null ? '—' : money(operatingResult)} trend={overview?.netProfit.changePercent ?? null}/>
        <DecisionKpi label="المصروفات المسجلة" value={expenses == null ? '—' : money(expenses)} hint={expenseRatio == null ? undefined : `${number(expenseRatio)}% من صافي المبيعات`}/>
        <DecisionKpi label={`صافي مرتبات ${monthLabel(payrollContext.month)}`} value={payrollNet == null ? '—' : money(payrollNet)} hint={payrollRatio == null ? 'تظهر النسبة فقط عند تطابق فترة التقرير مع دورة شهر كاملة' : `${number(payrollRatio)}% من صافي المبيعات`}/>
        <DecisionKpi label="تكلفة التالف" value={wasteLoss == null ? (Boolean(wastePermissions.can_view_cost_loss) ? '—' : 'محجوب') : money(wasteLoss)} hint={wasteRatio == null ? undefined : `${number(wasteRatio)}% من صافي المبيعات`}/>
      </>}
    </section>

    {data?.coverage && <section className="decision-kpi-grid">
      <DecisionKpi label="ساعات التواجد المسجلة" value={`${number(num(coverageSummary.staff_hours))} س`} hint={`${number(num(coverageSummary.employees))} موظف في سجلات الفترة`}/>
      <DecisionKpi label="جلسات حضور مكتملة" value={number(num(coverageSummary.closed_sessions))} hint="دخول وخروج موثق"/>
      <DecisionKpi label="أعلى ضغط مقابل التغطية" value={highestPressure ? hourLabel(highestPressure.hour) : '—'} hint={highestPressure ? `${number(highestPressure.activityPerStaff)} عملية/طلب لكل موظف متواجد في المتوسط` : 'لا توجد بيانات مشتركة كافية'}/>
    </section>}

    <section className="decision-insights-section">
      <div className="section-heading"><div><span className="eyebrow">Actionable Signals</span><h3>إشارات تساعدك تاخد قرار</h3><p className="muted">الإشارات محسوبة بقواعد واضحة من بيانات الفترة؛ وعند توفر الحضور يتم قياس الضغط نسبةً للتغطية الفعلية.</p></div><Lightbulb size={20}/></div>
      <div className="decision-insight-grid">
        {loading ? [1,2,3].map((item) => <article className="decision-insight-card" key={item}><div className="skeleton wide"/><div className="skeleton"/></article>) : insights.length ? insights.map((insight, index) => <InsightCard insight={insight} key={`${insight.title}-${index}`}/>) : <div className="empty-data"><span>—</span><p>لا توجد حركة كافية لإنتاج إشارات تشغيلية في الفترة الحالية.</p></div>}
      </div>
    </section>

    {data && <section className="report-visual-grid">
      <TrendAreaChart
        eyebrow="Workload Overlay"
        title="ضغط الفرع والأونلاين حسب الساعة"
        points={hourly.map((row) => ({ label: hourLabel(row.hour), value: num(row.pos_transactions), secondary: num(row.online_orders) }))}
        valueLabel="فواتير الفرع"
        secondaryLabel="طلبات الأونلاين"
        formatValue={(value) => number(value)}
      />
      {data.coverage && <TrendAreaChart
        eyebrow="Staff Coverage"
        title="تغطية الموظفين حسب الساعة"
        points={coverageHourly.map((row) => ({ label: hourLabel(row.hour), value: num(row.avg_staff), secondary: num(row.max_staff) }))}
        valueLabel="متوسط التواجد"
        secondaryLabel="أقصى تواجد"
        formatValue={(value) => number(value)}
      />}
      {data.coverage && <TrendAreaChart
        eyebrow="Demand / Coverage"
        title="ضغط النشاط لكل موظف متواجد"
        points={[...pressureHours].sort((a, b) => a.hour - b.hour).map((row) => ({ label: hourLabel(row.hour), value: row.activityPerStaff }))}
        valueLabel="عملية/طلب لكل موظف"
        formatValue={(value) => number(value)}
      />}
      <DonutChart
        eyebrow="Sales Channels"
        title="توزيع صافي المبيعات حسب القناة"
        segments={(overview?.channels || []).map((channel) => ({ label: channel.label, value: channel.amount }))}
      />
      <RankedBarChart eyebrow="Cost Signals" title="مؤشرات التكلفة للمتابعة" items={costSignals}/>
      <RankedBarChart
        eyebrow="Waste Watch"
        title="أكثر المنتجات تعرضًا للتالف"
        items={wasteProducts.map((row) => ({ label: text(row.product_name), value: num(row.damaged_measure) }))}
        formatValue={(value) => number(value)}
      />
    </section>}

    <p className="data-scope-note">مؤشرات المرتبات والمصروفات والتالف معروضة منفصلة عمدًا؛ لا يتم جمعها تلقائيًا لأن بعض البنود قد تتقاطع محاسبيًا داخل النتيجة التشغيلية. «النشاط لكل موظف» إشارة ضغط جماعية وليست تقييم إنتاجية فردي.</p>

    <section className="decision-quick-links">
      <DecisionLink to="/reports/peak-hours" icon={<Clock3 size={19}/>} title="تفاصيل ساعات الذروة" text={highestPressure ? `أعلى ضغط مقابل التغطية ${hourLabel(highestPressure.hour)} · ${number(highestPressure.activityPerStaff)} عملية/طلب لكل موظف.` : posWindow || onlineWindow ? `${posWindow ? `الفرع ${windowLabel(posWindow)}` : ''}${posWindow && onlineWindow ? ' · ' : ''}${onlineWindow ? `الأونلاين ${windowLabel(onlineWindow)}` : ''}` : 'افتح تحليل 24 ساعة والـHeatmap الأسبوعي.'}/>
      <DecisionLink to="/reports/workforce-costs" icon={<UsersRound size={19}/>} title="المرتبات والمصروفات" text={`دورة ${monthLabel(payrollContext.month)} ${payrollContext.year} وتفاصيل ساعات العمل والخصومات.`}/>
      <DecisionLink to="/reports/waste" icon={<AlertTriangle size={19}/>} title="التالف والهالك" text={`${number(num(wasteSummary.events))} حركة تلف/كسر معتمدة في الفترة.`}/>
      <DecisionLink to="/reports/profitability" icon={<Receipt size={19}/>} title="تفاصيل الربحية" text="راجع جسر الربح والنتيجة التشغيلية ومصادر التكلفة الموثقة."/>
    </section>
  </div>;
}

function DecisionKpi({ label, value, hint, trend }: { label: string; value: string; hint?: string; trend?: number | null }) {
  return <article className="finance-summary decision-kpi"><span>{label}</span><strong>{value}</strong>{trend != null ? <small className={trend >= 0 ? 'decision-trend is-up' : 'decision-trend is-down'}>{trend >= 0 ? <TrendingUp size={14}/> : <TrendingDown size={14}/>} {number(Math.abs(trend))}% عن الفترة السابقة</small> : hint ? <small className="muted">{hint}</small> : null}</article>;
}

function InsightCard({ insight }: { insight: Insight }) {
  return <article className={`decision-insight-card is-${insight.level}`}>
    <div><span className="decision-insight-badge">{levelLabel(insight.level)}</span><h4>{insight.title}</h4><p>{insight.body}</p></div>
    <Link to={insight.to}>{insight.action}<ArrowUpLeft size={15}/></Link>
  </article>;
}

function DecisionLink({ to, icon, title, text: description }: { to: string; icon: ReactNode; title: string; text: string }) {
  return <Link to={to} className="decision-quick-link"><span>{icon}</span><div><strong>{title}</strong><small>{description}</small></div><ArrowUpLeft size={17}/></Link>;
}

function buildInsights(input: {
  salesChange: number | null;
  operatingResult: number | null;
  expenseRatio: number | null;
  payrollNet: number | null;
  payrollRatio: number | null;
  payrollComparable: boolean;
  wasteLoss: number | null;
  wasteRatio: number | null;
  wasteProducts: Record<string, unknown>[];
  posWindow: PeakWindow | null;
  onlineWindow: PeakWindow | null;
  highestPressure: PressureHour | null;
  hasCoverage: boolean;
}): Insight[] {
  const insights: Insight[] = [];

  if (input.posWindow) insights.push({
    level: 'opportunity',
    title: `راجع تغطية الفرع ${windowLabel(input.posWindow)}`,
    body: 'هذه النافذة تضم الساعات التي وصل نشاط POS فيها إلى 80% أو أكثر من أعلى ساعة في الفترة. استخدمها لمراجعة توزيع الكاشير والتجهيز.',
    to: '/reports/peak-hours',
    action: 'تحليل الذروة',
  });

  if (input.onlineWindow) insights.push({
    level: 'opportunity',
    title: `راجع تجهيز الأونلاين ${windowLabel(input.onlineWindow)}`,
    body: 'هذه نافذة الضغط الأعلى لطلبات الأونلاين، ومناسبة لمراجعة عدد الـPickers والتجهيز والتسليم قبل زيادة الحمل.',
    to: '/reports/peak-hours',
    action: 'تفاصيل الأونلاين',
  });

  if (input.highestPressure) insights.unshift({
    level: 'attention',
    title: `أعلى ضغط مقابل التغطية عند ${hourLabel(input.highestPressure.hour)}`,
    body: `سجلت الساعة ${number(input.highestPressure.activityPerStaff)} عملية/طلب لكل موظف متواجد في المتوسط (${number(input.highestPressure.avgStaff)} موظف مقابل ${number(input.highestPressure.activity)} عملية/طلب). راجع توزيع الأدوار في هذه الساعة قبل زيادة العدد تلقائيًا.`,
    to: '/reports/peak-hours',
    action: 'مقارنة الضغط بالتغطية',
  });

  if (!input.hasCoverage) insights.push({
    level: 'info',
    title: 'تحليل التغطية يحتاج صلاحية الحضور',
    body: 'ضغط الفرع والأونلاين محسوب، لكن مقارنة الضغط بعدد الموظفين لن تظهر بدون صلاحية عرض الحضور أو تقارير HR.',
    to: '/reports/peak-hours',
    action: 'عرض تقرير الذروة',
  });

  if (input.posWindow && input.onlineWindow && windowsOverlap(input.posWindow, input.onlineWindow)) insights.unshift({
    level: 'attention',
    title: 'ذروة الفرع والأونلاين متداخلة',
    body: 'فترة الضغط الأعلى للقناتين تتقاطع. راجع توزيع الأدوار بين خدمة الفرع وتجهيز الأونلاين حتى لا يسحب مسار موارد المسار الآخر.',
    to: '/reports/peak-hours',
    action: 'افتح خريطة الضغط',
  });

  if (input.salesChange != null && Math.abs(input.salesChange) >= 0.5) insights.push({
    level: input.salesChange < 0 ? 'attention' : 'opportunity',
    title: input.salesChange < 0 ? 'صافي المبيعات أقل من الفترة السابقة' : 'صافي المبيعات أعلى من الفترة السابقة',
    body: `${input.salesChange < 0 ? 'انخفاض' : 'ارتفاع'} ${number(Math.abs(input.salesChange))}% مقارنة بالفترة السابقة المماثلة. استخدم تقرير المبيعات لتحديد القناة والساعات والمنتجات التي صنعت الفرق.`,
    to: '/reports/sales',
    action: 'تفاصيل المبيعات',
  });

  if (input.operatingResult != null && input.operatingResult < 0) insights.push({
    level: 'attention',
    title: 'النتيجة التشغيلية المعروفة سالبة',
    body: `النتيجة الحالية ${money(input.operatingResult)}. راجع جسر الربحية والمصروفات ورسوم الدفع قبل اتخاذ قرار خفض أو زيادة الإنفاق.`,
    to: '/reports/profitability',
    action: 'راجع الربحية',
  });

  if (input.expenseRatio != null) insights.push({
    level: 'info',
    title: 'نسبة المصروفات إلى المبيعات',
    body: `المصروفات المسجلة في الفترة تعادل ${number(input.expenseRatio)}% من صافي المبيعات. الرقم معروض كنسبة متابعة بدون افتراض هدف إداري غير محدد.`,
    to: '/reports/workforce-costs',
    action: 'تفاصيل المصروفات',
  });

  if (input.payrollRatio != null) insights.push({
    level: 'info',
    title: 'نسبة تكلفة العمالة إلى المبيعات',
    body: `صافي دورة المرتبات يعادل ${number(input.payrollRatio)}% من صافي المبيعات لنفس الشهر الكامل.`,
    to: '/reports/workforce-costs',
    action: 'راجع العمالة',
  });

  if (input.payrollNet != null && !input.payrollComparable) insights.push({
    level: 'info',
    title: 'المرتبات ظاهرة بدون نسبة مقارنة',
    body: 'دورة المرتبات شهرية بينما الفترة المختارة ليست شهرًا كاملًا مطابقًا، لذلك لم نقسم المرتب على مبيعات فترة مختلفة حتى لا ننتج نسبة مضللة.',
    to: '/reports/workforce-costs',
    action: 'افتح دورة المرتبات',
  });

  if (input.wasteLoss != null && input.wasteLoss > 0) {
    const top = [...input.wasteProducts].sort((a, b) => num(b.cost_loss) - num(a.cost_loss))[0];
    insights.push({
      level: 'attention',
      title: top ? `راجع تالف ${text(top.product_name)}` : 'راجع تكلفة التالف',
      body: `${input.wasteRatio != null ? `خسارة التالف تعادل ${number(input.wasteRatio)}% من صافي المبيعات. ` : ''}${top ? `أعلى منتج حسب تكلفة الخسارة المسجلة: ${text(top.product_name)} (${money(nullable(top.cost_loss))}).` : `إجمالي تكلفة الخسارة ${money(input.wasteLoss)}.`}`,
      to: '/reports/waste',
      action: 'تحليل التالف',
    });
  }

  return insights.slice(0, 8);
}

function buildPressureHours(hourly: Record<string, unknown>[], coverageHourly: Record<string, unknown>[]): PressureHour[] {
  return hourly.map((row) => {
    const hour = num(row.hour);
    const coverage = coverageHourly.find((item) => num(item.hour) === hour);
    const avgStaff = coverage ? num(coverage.avg_staff) : 0;
    const activity = num(row.combined_activity);
    return {
      hour,
      activity,
      avgStaff,
      activityPerStaff: avgStaff > 0 ? activity / avgStaff : 0,
    };
  }).filter((row) => row.avgStaff > 0 && row.activity > 0).sort((a, b) => b.activityPerStaff - a.activityPerStaff);
}

function peakWindow(hourly: Record<string, unknown>[], key: string): PeakWindow | null {
  const values = Array.from({ length: 24 }, (_, hour) => ({ hour, value: num(hourly.find((row) => num(row.hour) === hour)?.[key]) }));
  const max = Math.max(0, ...values.map((item) => item.value));
  if (max <= 0) return null;
  const threshold = max * 0.8;
  const hot = new Set(values.filter((item) => item.value >= threshold && item.value > 0).map((item) => item.hour));
  const windows: PeakWindow[] = [];
  let cursor = 0;
  while (cursor < 24) {
    if (!hot.has(cursor)) { cursor += 1; continue; }
    const start = cursor;
    let total = 0;
    while (cursor < 24 && hot.has(cursor)) {
      total += values[cursor].value;
      cursor += 1;
    }
    windows.push({ start, end: cursor - 1, total });
  }
  return windows.sort((a, b) => b.total - a.total || (b.end - b.start) - (a.end - a.start))[0] || null;
}

function windowsOverlap(a: PeakWindow, b: PeakWindow) {
  return Math.max(a.start, b.start) <= Math.min(a.end, b.end);
}

function isExactPayrollMonth(filters: BusinessFilters, year: number, month: number) {
  const range = resolvePeriod(filters);
  const from = cairoDateKey(range.from);
  const to = cairoDateKey(range.to);
  const next = new Date(Date.UTC(year, month, 1));
  const expectedFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const expectedTo = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return from === expectedFrom && to === expectedTo;
}

function inferPayrollContext(period: PeriodKey, customFrom: string, now: { year: number; month: number }) {
  if (period === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(customFrom)) {
    const [year, month] = customFrom.split('-').map(Number);
    return { year, month };
  }
  return now;
}

function sourceLabel(key: string) {
  const labels: Record<string, string> = { overview: 'الأداء المالي', peak: 'ساعات الذروة', coverage: 'تغطية الموظفين', waste: 'التالف', payroll: 'المرتبات' };
  return labels[key] || key;
}
function levelLabel(level: InsightLevel) { return level === 'attention' ? 'يحتاج انتباه' : level === 'opportunity' ? 'فرصة تشغيلية' : 'معلومة قرار'; }
function windowLabel(window: PeakWindow) { return window.start === window.end ? hourLabel(window.start) : `${hourLabel(window.start)}–${String(window.end).padStart(2, '0')}:59`; }
function hourLabel(value: unknown) { const hour = Math.max(0, Math.min(23, Math.trunc(num(value)))); return `${String(hour).padStart(2, '0')}:00`; }
function monthLabel(month: number) { return ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][month - 1] || String(month); }
function periodLabel(period: PeriodKey, customFrom: string, customTo: string) { const labels: Record<PeriodKey,string> = { today:'اليوم', yesterday:'أمس', week:'هذا الأسبوع', month:'هذا الشهر', custom:`${customFrom} → ${customTo}` }; return labels[period]; }
function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function num(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function nullable(value: unknown): number | null { if (value == null || value === '') return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function text(value: unknown, fallback = '—'): string { return value == null || value === '' ? fallback : String(value); }
function cairoDateKey(value: Date) { return new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit' }).format(value); }
function cairoParts() { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value])); return { year:Number(parts.year), month:Number(parts.month), day:Number(parts.day) }; }
function csvCell(value: unknown): string { const valueText = String(value ?? ''); return /[",\n]/.test(valueText) ? `"${valueText.replace(/"/g, '""')}"` : valueText; }
function download(filename: string, content: string) { const blob = new Blob([content], { type:'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }
