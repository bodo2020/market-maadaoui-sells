import { money, number } from './MetricCard';
import { DonutChart, RankedBarChart, TrendAreaChart, WaterfallChart } from './ReportVisuals';
import type { ReportDocument, ReportKey } from '../services/reportingDetails';

export default function DetailedReportVisuals({ reportKey, data }: { reportKey: ReportKey; data: ReportDocument }) {
  const summary = asRecord(data.summary);

  if (reportKey === 'sales') {
    const hourly = records(data.hourly).map((row) => ({
      label: hourLabel(row.hour),
      value: num(row.net_sales),
    }));
    const payments = records(data.payment_methods).map((row) => ({
      label: text(row.name, 'وسيلة دفع'),
      value: num(row.sales),
    }));
    const cashiers = records(data.cashiers).map((row) => ({
      label: text(row.cashier_name, 'كاشير'),
      value: num(row.net_sales),
    }));

    return <VisualGrid>
      <TrendAreaChart eyebrow="Peak Hours" title="المبيعات حسب الساعة" points={hourly} valueLabel="صافي المبيعات"/>
      <DonutChart eyebrow="Payment Mix" title="توزيع المبيعات حسب وسيلة الدفع" segments={payments}/>
      <RankedBarChart eyebrow="Sales Ranking" title="ترتيب الكاشير حسب صافي المبيعات" items={cashiers}/>
    </VisualGrid>;
  }

  if (reportKey === 'profitability') {
    const daily = records(data.daily).map((row) => ({
      label: dateLabel(row.date),
      value: num(row.net_sales),
      secondary: num(row.gross_profit),
    }));
    const waterfall = records(data.waterfall).map((row) => ({
      label: text(row.label ?? row.key),
      value: num(row.value),
    }));

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
      <DonutChart
        eyebrow="Stock Health"
        title="حالة توافر المخزون"
        centerLabel="الأصناف"
        formatValue={(value) => number(value)}
        segments={[
          { label: 'طبيعي', value: healthy },
          { label: 'منخفض', value: low },
          { label: 'نافد', value: out },
        ]}
      />
    </VisualGrid>;
  }

  if (reportKey === 'payments') {
    const methods = records(data.methods);
    const daily = records(data.daily).map((row) => ({
      label: dateLabel(row.date),
      value: num(row.gross_collected),
      secondary: num(row.net_movement),
    }));

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

function VisualGrid({ children }: { children: React.ReactNode }) {
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

function hourLabel(value: unknown) {
  const hour = Number(value);
  return Number.isFinite(hour) ? `${String(hour).padStart(2, '0')}:00` : text(value);
}

function dateLabel(value: unknown) {
  if (!value) return '—';
  const date = new Date(`${String(value)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return text(value);
  return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(date);
}

function statusLabel(value: unknown) {
  const labels: Record<string, string> = {
    open: 'مفتوح',
    waiting: 'في الانتظار',
    pending: 'معلق',
    processing: 'قيد التنفيذ',
    preparing: 'قيد التجهيز',
    ready: 'جاهز',
    out_for_delivery: 'خرج للتوصيل',
    delivered: 'تم التسليم',
    cancelled: 'ملغي',
    failed: 'فشل',
    refunded: 'مردود',
    paid: 'مدفوع',
  };
  return labels[String(value || '')] || text(value);
}
