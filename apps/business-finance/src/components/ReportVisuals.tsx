import type { CSSProperties, ReactNode } from 'react';
import { BarChart3, CircleDollarSign, PieChart, TrendingUp } from 'lucide-react';
import { money, number } from './MetricCard';
import type { ReportDocument, ReportKey } from '../services/reportingDetails';
import './report-visuals.css';

export type ChartPoint = { label: string; value: number; secondary?: number };
export type DonutSegment = { label: string; value: number };
export type WaterfallPoint = { label: string; value: number };

const palette = ['#005931', '#16835a', '#49a77b', '#86c5a4', '#d0a647', '#db765e', '#6f7fa3', '#8e6ca8'];

export function TrendAreaChart({
  title,
  eyebrow,
  points,
  valueLabel = 'القيمة',
  secondaryLabel,
  formatValue = money,
}: {
  title: string;
  eyebrow: string;
  points: ChartPoint[];
  valueLabel?: string;
  secondaryLabel?: string;
  formatValue?: (value: number | null | undefined) => string;
}) {
  const clean = points.filter((point) => Number.isFinite(point.value) && (point.secondary == null || Number.isFinite(point.secondary)));
  if (!clean.length) return <ChartEmpty title={title} eyebrow={eyebrow}/>;

  const width = 1000;
  const height = 320;
  const left = 42;
  const right = 18;
  const top = 24;
  const bottom = 54;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const allValues = clean.flatMap((point) => point.secondary == null ? [point.value] : [point.value, point.secondary]);
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(1, ...allValues);
  const range = Math.max(maxValue - minValue, 1);
  const x = (index: number) => left + (clean.length === 1 ? plotWidth / 2 : (index / (clean.length - 1)) * plotWidth);
  const y = (value: number) => top + ((maxValue - value) / range) * plotHeight;
  const baseline = y(0);
  const primaryPath = clean.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.value)}`).join(' ');
  const secondaryPath = clean.some((point) => point.secondary != null)
    ? clean.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.secondary ?? 0)}`).join(' ')
    : null;
  const areaPath = `${primaryPath} L ${x(clean.length - 1)} ${baseline} L ${x(0)} ${baseline} Z`;
  const labelStep = Math.max(1, Math.ceil(clean.length / 6));
  const gradientId = `trend-${title.replace(/\s+/g, '-')}`;

  return <ChartCard title={title} eyebrow={eyebrow} icon={<TrendingUp size={19}/>}>
    <div className="chart-legend chart-legend--inline">
      <span><i className="chart-dot chart-dot--primary"/>{valueLabel}</span>
      {secondaryPath && secondaryLabel && <span><i className="chart-dot chart-dot--secondary"/>{secondaryLabel}</span>}
    </div>
    <div className="svg-chart-wrap">
      <svg className="trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#16835a" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="#16835a" stopOpacity="0.02"/>
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const gy = top + ratio * plotHeight;
          const value = maxValue - ratio * range;
          return <g key={ratio}>
            <line className="chart-grid-line" x1={left} x2={width - right} y1={gy} y2={gy}/>
            <text className="chart-axis-value" x={left - 8} y={gy + 4}>{compact(value)}</text>
          </g>;
        })}
        <path d={areaPath} fill={`url(#${gradientId})`}/>
        <path className="chart-line chart-line--primary" d={primaryPath}/>
        {secondaryPath && <path className="chart-line chart-line--secondary" d={secondaryPath}/>} 
        {clean.map((point, index) => <g key={`${point.label}-${index}`}>
          <circle className="chart-point chart-point--primary" cx={x(index)} cy={y(point.value)} r="5"><title>{`${point.label} · ${valueLabel}: ${formatValue(point.value)}`}</title></circle>
          {point.secondary != null && <circle className="chart-point chart-point--secondary" cx={x(index)} cy={y(point.secondary)} r="4"><title>{`${point.label} · ${secondaryLabel || 'القيمة الثانية'}: ${formatValue(point.secondary)}`}</title></circle>}
          {(index % labelStep === 0 || index === clean.length - 1) && <text className="chart-axis-label" x={x(index)} y={height - 18}>{shortLabel(point.label)}</text>}
        </g>)}
      </svg>
    </div>
  </ChartCard>;
}

export function DonutChart({
  title,
  eyebrow,
  segments,
  centerLabel = 'الإجمالي',
  formatValue = money,
}: {
  title: string;
  eyebrow: string;
  segments: DonutSegment[];
  centerLabel?: string;
  formatValue?: (value: number | null | undefined) => string;
}) {
  const clean = segments.filter((segment) => Number.isFinite(segment.value) && segment.value > 0);
  const total = clean.reduce((sum, segment) => sum + segment.value, 0);
  if (!clean.length || total <= 0) return <ChartEmpty title={title} eyebrow={eyebrow}/>;

  let cursor = 0;
  const stops = clean.map((segment, index) => {
    const from = (cursor / total) * 100;
    cursor += segment.value;
    const to = (cursor / total) * 100;
    return `${palette[index % palette.length]} ${from}% ${to}%`;
  });
  const donutStyle: CSSProperties = { background: `conic-gradient(${stops.join(', ')})` };

  return <ChartCard title={title} eyebrow={eyebrow} icon={<PieChart size={19}/>}>
    <div className="donut-layout">
      <div className="donut-chart" style={donutStyle} role="img" aria-label={title}>
        <div className="donut-chart__center"><span>{centerLabel}</span><strong>{formatValue(total)}</strong></div>
      </div>
      <div className="donut-legend">{clean.map((segment, index) => {
        const percent = (segment.value / total) * 100;
        return <div className="donut-legend__row" key={`${segment.label}-${index}`}>
          <i style={{ background: palette[index % palette.length] }}/>
          <div><span>{segment.label}</span><small>{number(percent)}%</small></div>
          <strong>{formatValue(segment.value)}</strong>
        </div>;
      })}</div>
    </div>
  </ChartCard>;
}

export function RankedBarChart({
  title,
  eyebrow,
  items,
  formatValue = money,
  limit = 8,
}: {
  title: string;
  eyebrow: string;
  items: ChartPoint[];
  formatValue?: (value: number | null | undefined) => string;
  limit?: number;
}) {
  const clean = [...items]
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, limit);
  const max = Math.max(...clean.map((item) => Math.abs(item.value)), 0);
  if (!clean.length || max <= 0) return <ChartEmpty title={title} eyebrow={eyebrow}/>;

  return <ChartCard title={title} eyebrow={eyebrow} icon={<BarChart3 size={19}/>}>
    <div className="ranked-bars">{clean.map((item, index) => <div className="ranked-bar" key={`${item.label}-${index}`}>
      <div className="ranked-bar__head"><span><b>{index + 1}</b>{item.label}</span><strong>{formatValue(item.value)}</strong></div>
      <div className="ranked-bar__track"><span style={{ width: `${Math.max(2, (Math.abs(item.value) / max) * 100)}%` }}/></div>
    </div>)}</div>
  </ChartCard>;
}

export function WaterfallChart({
  title,
  eyebrow,
  points,
  formatValue = money,
}: {
  title: string;
  eyebrow: string;
  points: WaterfallPoint[];
  formatValue?: (value: number | null | undefined) => string;
}) {
  const clean = points.filter((point) => Number.isFinite(point.value));
  const max = Math.max(...clean.map((point) => Math.abs(point.value)), 0);
  if (!clean.length || max <= 0) return <ChartEmpty title={title} eyebrow={eyebrow}/>;

  return <ChartCard title={title} eyebrow={eyebrow} icon={<CircleDollarSign size={19}/>}>
    <div className="waterfall-chart">{clean.map((point, index) => {
      const size = Math.max(8, (Math.abs(point.value) / max) * 88);
      const positive = point.value >= 0;
      return <div className="waterfall-item" key={`${point.label}-${index}`} title={`${point.label}: ${formatValue(point.value)}`}>
        <strong>{formatValue(point.value)}</strong>
        <div className="waterfall-item__plot"><span className={positive ? 'is-positive' : 'is-negative'} style={{ height: `${size}%` }}/></div>
        <small>{shortLabel(point.label, 16)}</small>
      </div>;
    })}</div>
  </ChartCard>;
}

export function ReportVisuals({ reportKey, data }: { reportKey: ReportKey; data: ReportDocument }) {
  const summary = asRecord(data.summary);

  if (reportKey === 'sales') {
    const hourly = records(data.hourly).map((row) => ({ label: hourLabel(row.hour), value: num(row.net_sales) }));
    const paymentMethods = records(data.payment_methods).map((row) => ({ label: text(row.name, 'وسيلة دفع'), value: num(row.sales) }));
    const cashiers = records(data.cashiers).map((row) => ({ label: text(row.cashier_name, 'كاشير'), value: num(row.net_sales) }));
    return <VisualGrid>
      <TrendAreaChart eyebrow="Peak Hours" title="المبيعات حسب الساعة" points={hourly} valueLabel="صافي المبيعات"/>
      <DonutChart eyebrow="Payment Mix" title="توزيع المبيعات حسب وسيلة الدفع" segments={paymentMethods}/>
      <RankedBarChart eyebrow="Sales Ranking" title="ترتيب الكاشير حسب صافي المبيعات" items={cashiers}/>
    </VisualGrid>;
  }

  if (reportKey === 'profitability') {
    const daily = records(data.daily).map((row) => ({ label: dateLabel(row.date), value: num(row.net_sales), secondary: num(row.gross_profit) }));
    const waterfall = records(data.waterfall).map((row) => ({ label: text(row.label ?? row.key), value: num(row.value) }));
    return <VisualGrid>
      <TrendAreaChart eyebrow="Profit Trend" title="اتجاه المبيعات والربح" points={daily} valueLabel="صافي المبيعات" secondaryLabel="إجمالي الربح"/>
      <WaterfallChart eyebrow="Profit Bridge" title="جسر تكوين الربح" points={waterfall}/>
    </VisualGrid>;
  }

  if (reportKey === 'products') {
    const products = records(data.products).map((row) => ({ label: text(row.product_name), value: num(row.net_revenue) }));
    const categories = records(data.categories).map((row) => ({ label: text(row.category_name), value: num(row.net_revenue) }));
    return <VisualGrid>
      <RankedBarChart eyebrow="Top Products" title="أعلى المنتجات مساهمة في الإيراد" items={products}/>
      <DonutChart eyebrow="Category Mix" title="توزيع الإيراد على الأقسام" segments={categories}/>
    </VisualGrid>;
  }

  if (reportKey === 'inventory') {
    const categories = records(data.categories).map((row) => ({ label: text(row.category_name), value: num(row.purchase_value) }));
    const total = num(summary.inventory_rows);
    const low = num(summary.low_stock_rows);
    const out = num(summary.out_of_stock_rows);
    const healthy = Math.max(0, total - low - out);
    return <VisualGrid>
      <RankedBarChart eyebrow="Inventory Value" title="قيمة المخزون حسب القسم" items={categories}/>
      <DonutChart eyebrow="Stock Health" title="حالة توافر المخزون" centerLabel="الأصناف" formatValue={(value) => number(value)} segments={[
        { label: 'طبيعي', value: healthy },
        { label: 'منخفض', value: low },
        { label: 'نافد', value: out },
      ]}/>
    </VisualGrid>;
  }

  if (reportKey === 'payments') {
    const methods = records(data.methods);
    const daily = records(data.daily).map((row) => ({ label: dateLabel(row.date), value: num(row.gross_collected), secondary: num(row.net_movement) }));
    return <VisualGrid>
      <TrendAreaChart eyebrow="Collection Trend" title="اتجاه التحصيل وصافي الحركة" points={daily} valueLabel="إجمالي التحصيل" secondaryLabel="صافي الحركة"/>
      <DonutChart eyebrow="Collection Mix" title="توزيع التحصيل حسب وسيلة الدفع" segments={methods.map((row) => ({ label: text(row.name), value: num(row.gross_collected) }))}/>
      <RankedBarChart eyebrow="Payment Fees" title="تكلفة رسوم وسائل الدفع" items={methods.map((row) => ({ label: text(row.name), value: num(row.merchant_fees) }))}/>
    </VisualGrid>;
  }

  if (reportKey === 'returns') {
    const reasons = records(data.reasons);
    return <VisualGrid>
      <DonutChart eyebrow="Return Value" title="قيمة المرتجعات حسب السبب" segments={reasons.map((row) => ({ label: text(row.reason), value: num(row.value) }))}/>
      <RankedBarChart eyebrow="Return Frequency" title="أكثر أسباب المرتجعات تكرارًا" formatValue={(value) => number(value)} items={reasons.map((row) => ({ label: text(row.reason), value: num(row.returns) }))}/>
    </VisualGrid>;
  }

  if (reportKey === 'cashiers') {
    const cashiers = records(data.cashiers);
    return <VisualGrid>
      <RankedBarChart eyebrow="Cashier Sales" title="مقارنة صافي مبيعات الكاشير" items={cashiers.map((row) => ({ label: text(row.cashier_name), value: num(row.net_sales) }))}/>
      <RankedBarChart eyebrow="Sales Per Hour" title="الإنتاجية حسب ساعة العمل" items={cashiers.map((row) => ({ label: text(row.cashier_name), value: num(row.sales_per_hour) }))}/>
    </VisualGrid>;
  }

  if (reportKey === 'branches') {
    const branches = records(data.branches);
    return <VisualGrid>
      <RankedBarChart eyebrow="Branch Ranking" title="ترتيب الفروع حسب صافي المبيعات" items={branches.map((row) => ({ label: text(row.branch_name), value: num(asRecord(row.current).net_sales) }))}/>
      <RankedBarChart eyebrow="Operating Result" title="النتيجة التشغيلية المعروفة حسب الفرع" items={branches.map((row) => ({ label: text(row.branch_name), value: num(asRecord(row.current).known_operating_result) }))}/>
    </VisualGrid>;
  }

  if (reportKey === 'online') {
    const statuses = records(data.statuses);
    const daily = records(data.daily).map((row) => ({ label: dateLabel(row.day), value: num(row.order_value) }));
    return <VisualGrid>
      <TrendAreaChart eyebrow="Online Trend" title="اتجاه قيمة الطلبات اليومية" points={daily} valueLabel="قيمة الطلبات"/>
      <DonutChart eyebrow="Order Mix" title="توزيع الطلبات حسب الحالة" centerLabel="الطلبات" formatValue={(value) => number(value)} segments={statuses.map((row) => ({ label: statusLabel(row.status), value: num(row.orders) }))}/>
      <RankedBarChart eyebrow="Order Value" title="قيمة الطلبات حسب الحالة" items={statuses.map((row) => ({ label: statusLabel(row.status), value: num(row.order_value) }))}/>
    </VisualGrid>;
  }

  if (reportKey === 'customers') {
    const customers = records(data.customers).map((row) => ({ label: text(row.customer_name, 'عميل'), value: num(row.period_realized_value) }));
    return <VisualGrid>
      <DonutChart eyebrow="Customer Mix" title="عملاء جدد مقابل عائدين" centerLabel="العملاء" formatValue={(value) => number(value)} segments={[
        { label: 'جدد', value: num(summary.new_realized_customers) },
        { label: 'عائدون', value: num(summary.returning_realized_customers) },
      ]}/>
      <DonutChart eyebrow="Identity Coverage" title="تغطية ربط المبيعات بهوية العميل" centerLabel="العمليات" formatValue={(value) => number(value)} segments={[
        { label: 'مرتبط بعميل', value: num(summary.pos_linked_transactions) + num(summary.online_linked_orders) },
        { label: 'بدون هوية', value: num(summary.pos_anonymous_transactions) + num(summary.online_anonymous_orders) },
      ]}/>
      <RankedBarChart eyebrow="Customer Value" title="أعلى العملاء قيمة خلال الفترة" items={customers}/>
    </VisualGrid>;
  }

  if (reportKey === 'costs') {
    return <VisualGrid>
      <RankedBarChart eyebrow="Expense Mix" title="أكبر بنود المصروفات" items={records(data.expense_types).map((row) => ({ label: text(row.type, 'غير مصنف'), value: num(row.amount) }))}/>
      <RankedBarChart eyebrow="Purchases" title="أعلى الموردين في مشتريات الفترة" items={records(data.suppliers).map((row) => ({ label: text(row.supplier_name), value: num(row.period_purchase_total) }))}/>
    </VisualGrid>;
  }

  if (reportKey === 'transfers') {
    const transfers = records(data.recent_transfers).map((row) => ({ label: text(row.transfer_number), value: Math.abs(num(row.variance_measure)) }));
    return <VisualGrid>
      <DonutChart eyebrow="In Transit" title="التحويلات قيد النقل" centerLabel="التحويلات" formatValue={(value) => number(value)} segments={[
        { label: 'صادر', value: num(summary.in_transit_outgoing) },
        { label: 'وارد', value: num(summary.in_transit_incoming) },
      ]}/>
      <RankedBarChart eyebrow="Variance" title="أكبر فروق الاستلام" formatValue={(value) => number(value)} items={transfers}/>
    </VisualGrid>;
  }

  const insights = records(data.insights).map((row) => ({ label: text(row.title), value: Math.abs(num(row.metric_value)) }));
  return <VisualGrid>
    <DonutChart eyebrow="Insight Severity" title="توزيع الإشارات حسب الأولوية" centerLabel="الإشارات" formatValue={(value) => number(value)} segments={[
      { label: 'عاجل', value: num(summary.critical) },
      { label: 'تحذير', value: num(summary.warning) },
      { label: 'فرصة', value: num(summary.opportunity) },
      { label: 'معلومة', value: Math.max(0, num(summary.total) - num(summary.critical) - num(summary.warning) - num(summary.opportunity)) },
    ]}/>
    <RankedBarChart eyebrow="Priority Signals" title="أقوى الإشارات بالأرقام" formatValue={(value) => number(value)} items={insights}/>
  </VisualGrid>;
}

function ChartCard({ title, eyebrow, icon, children }: { title: string; eyebrow: string; icon: ReactNode; children: ReactNode }) {
  return <article className="section-card report-chart-card">
    <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div><span className="report-chart-card__icon">{icon}</span></div>
    {children}
  </article>;
}

function ChartEmpty({ title, eyebrow }: { title: string; eyebrow: string }) {
  return <ChartCard title={title} eyebrow={eyebrow} icon={<BarChart3 size={19}/>}><div className="chart-empty"><span>—</span><p>لا توجد بيانات كافية للرسم في الفترة المحددة.</p></div></ChartCard>;
}

function VisualGrid({ children }: { children: ReactNode }) {
  return <section className="report-visual-grid">{children}</section>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown, fallback = '—'): string {
  return value == null || value === '' ? fallback : String(value);
}

function compact(value: number) {
  return new Intl.NumberFormat('ar-EG', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function shortLabel(value: string, max = 11) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function hourLabel(value: unknown) {
  const hour = Number(value);
  return Number.isFinite(hour) ? `${String(hour).padStart(2, '0')}:00` : text(value);
}

function dateLabel(value: unknown) {
  if (!value) return '—';
  const raw = String(value);
  const date = new Date(raw.includes('T') ? raw : `${raw}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(date);
}

function statusLabel(value: unknown) {
  const labels: Record<string, string> = {
    open: 'مفتوح', waiting: 'في الانتظار', pending: 'معلق', processing: 'قيد التنفيذ', preparing: 'قيد التجهيز', ready: 'جاهز', out_for_delivery: 'خرج للتوصيل', delivered: 'تم التسليم', cancelled: 'ملغي', failed: 'فشل', refunded: 'مردود', paid: 'مدفوع',
  };
  return labels[String(value || '')] || text(value);
}
