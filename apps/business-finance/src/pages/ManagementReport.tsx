import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, ArrowRight, BarChart3, CalendarDays, Download, FileText, Lightbulb, Printer, Receipt, RefreshCcw, Truck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, number } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { ReportVisuals } from '../components/ReportVisuals';
import { useBusiness } from '../context/BusinessContext';
import { type BusinessFilters, type PeriodKey } from '../services/businessFinance';
import { fetchDetailedReport, type ReportDocument, type ReportKey } from '../services/reportingDetails';
import { makeCairoCustomRange } from '../services/salesReporting';
import './sales-report.css';

type ManagementReportKind = Extract<ReportKey, 'cashiers' | 'branches' | 'online' | 'customers' | 'costs' | 'transfers' | 'insights'>;
type Metric = { label: string; value: string; hint?: string };
type TableSpec = { eyebrow: string; title: string; columns: string[]; rows: string[][]; empty: string };
type Presentation = { metrics: Metric[]; tables: TableSpec[]; note?: string };

type Meta = { title: string; eyebrow: string; description: string; icon: typeof Users };
const reportMeta: Record<ManagementReportKind, Meta> = {
  cashiers: { title: 'الكاشير والورديات', eyebrow: 'Reporting V2 · Cashiers & Shifts', description: 'المبيعات والسرعة وفروق الخزنة وأداء كل كاشير ووردية.', icon: Users },
  branches: { title: 'مقارنة الفروع', eyebrow: 'Reporting V2 · Branches', description: 'مقارنة الفروع المتاحة في المبيعات والربحية والمصروفات من نفس تعريفات الأرقام.', icon: BarChart3 },
  online: { title: 'الأونلاين والتوصيل', eyebrow: 'Reporting V2 · Online', description: 'حالات الطلبات والتسليم والإلغاء وقيمة الطلب والشحن والتحصيل.', icon: Truck },
  customers: { title: 'العملاء والولاء', eyebrow: 'Reporting V2 · Customers', description: 'العملاء الجدد والعائدون وقيمة العميل وتغطية ربط الهوية بين POS والأونلاين.', icon: Users },
  costs: { title: 'التكاليف والموردون', eyebrow: 'Reporting V2 · Costs & Suppliers', description: 'المصروفات والمشتريات والرواتب والتزامات الموردين حسب الصلاحيات.', icon: Receipt },
  transfers: { title: 'تحويلات المخزون', eyebrow: 'Reporting V2 · Transfers', description: 'الصادر والوارد وفروق الاستلام وتكلفة التحويلات والمهام المتأخرة.', icon: ArrowLeftRight },
  insights: { title: 'الإشارات الذكية', eyebrow: 'Reporting V2 · Insights', description: 'مشكلات وفرص محسوبة من مؤشرات فعلية ومُرتبة حسب الأولوية.', icon: Lightbulb },
};

export default function ManagementReport({ kind }: { kind: ManagementReportKind }) {
  const { selectedBranch, branches } = useBusiness();
  const today = cairoToday();
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [data, setData] = useState<ReportDocument | null>(null);
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

  async function load() {
    if (!filters) {
      if (period === 'custom') setError('اختر نطاق تاريخ صحيح.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDetailedReport(kind, filters, branches));
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل التقرير.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [kind, filters, branches]);

  const meta = reportMeta[kind];
  const Icon = meta.icon;
  const presentation = data ? buildPresentation(kind, data) : null;

  function exportCsv() {
    if (!presentation) return;
    const csv = presentation.tables
      .flatMap((table) => [[table.title], table.columns, ...table.rows, []])
      .map((row) => row.map(csvCell).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `elmadawy-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return <div className="stack-lg sales-report-page">
    <section className="report-detail-head sales-report-head">
      <div className="report-detail-head__title"><Link to="/reports" className="back-button" aria-label="العودة للتقارير"><ArrowRight size={19}/></Link><span className="report-card__icon"><Icon size={22}/></span><div><span className="eyebrow">{meta.eyebrow}</span><h2>{meta.title}</h2><p>{meta.description}</p></div></div>
      <div className="sales-period-control"><PeriodSwitcher period={period} onChange={setPeriod}/><button type="button" className={period === 'custom' ? 'custom-period-button active' : 'custom-period-button'} onClick={() => setPeriod('custom')}><CalendarDays size={16}/> مخصص</button></div>
    </section>

    {period === 'custom' && <section className="section-card custom-date-panel"><div><span className="eyebrow">Custom Range</span><h3>فترة مخصصة</h3><p>الفترة محسوبة بتوقيت القاهرة ويشمل تاريخ النهاية كاملًا.</p></div><div className="custom-date-inputs"><label><span>من</span><input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)}/></label><label><span>إلى</span><input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)}/></label></div></section>}

    <section className="section-card financial-report-actions"><div><span className="eyebrow">Report Scope</span><strong>{kind === 'branches' ? 'كل الفروع المسموح بها' : selectedBranch?.branch_name || 'الفرع'} · {periodLabel(period, customFrom, customTo)}</strong></div><div className="report-actions"><button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={16}/> طباعة / PDF</button><button className="secondary-button" type="button" disabled={!presentation} onClick={exportCsv}><Download size={16}/> CSV</button></div></section>

    {error && <section className="engine-banner"><div><strong>تعذر تحميل التقرير</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}

    <section className="finance-summary-grid">{loading
      ? [1, 2, 3, 4].map((item) => <article className="finance-summary" key={item}><span>جاري التحميل</span><div className="skeleton wide"/></article>)
      : presentation?.metrics.map((item) => <Summary key={item.label} {...item}/>)}</section>

    {presentation?.note && <p className="data-scope-note">{presentation.note}</p>}
    {data && <ReportVisuals reportKey={kind} data={data}/>} 
    {presentation?.tables.map((table) => <TableCard key={`${table.eyebrow}-${table.title}`} {...table}/>)}
  </div>;
}

function buildPresentation(kind: ManagementReportKind, data: ReportDocument): Presentation {
  const summary = record(data.summary);

  if (kind === 'cashiers') {
    const canCash = Boolean(record(data.permissions).can_view_cash_control);
    return {
      metrics: [
        metric('صافي المبيعات', money(numeric(summary.net_sales))),
        metric('الفواتير', number(numeric(summary.invoice_count))),
        metric('الكاشير', number(numeric(summary.cashiers))),
        metric('فرق الخزنة المطلق', canCash ? moneyNullable(summary.cash_variance_absolute) : 'محجوب'),
      ],
      note: !canCash ? 'فروق الخزن الفعلية محجوبة حسب صلاحيات التحكم النقدي.' : undefined,
      tables: [
        table('Team Performance', 'أداء الكاشير', ['الكاشير', 'الورديات', 'الفواتير', 'صافي المبيعات', 'متوسط الفاتورة', 'مبيعات / ساعة', 'فرق الخزنة'], rows(data.cashiers).map((row) => [text(row.cashier_name), number(numeric(row.shift_count)), number(numeric(row.invoice_count)), money(numeric(row.net_sales)), money(numeric(row.average_ticket)), money(numeric(row.sales_per_hour)), canCash ? moneyNullable(row.cash_variance_signed) : 'محجوب']), 'لا توجد ورديات كاشير في الفترة.'),
        table('Shifts', 'تفاصيل الورديات', ['الكاشير', 'الجهاز', 'الحالة', 'الفواتير', 'صافي المبيعات', 'فتح', 'إغلاق'], rows(data.shifts).map((row) => [text(row.cashier_name), text(row.device_name), status(row.status), number(numeric(row.invoice_count)), money(numeric(row.net_sales)), dateTime(row.opened_at), dateTime(row.closed_at)]), 'لا توجد ورديات متقاطعة مع الفترة.'),
      ],
    };
  }

  if (kind === 'branches') {
    const branchRows = rows(data.branches).sort((a, b) => numeric(record(b.current).net_sales) - numeric(record(a.current).net_sales));
    const totals = branchRows.reduce<{ sales: number; transactions: number; expenses: number }>((acc, row) => {
      const current = record(row.current);
      return {
        sales: acc.sales + numeric(current.net_sales),
        transactions: acc.transactions + numeric(current.transactions),
        expenses: acc.expenses + numeric(current.expenses),
      };
    }, { sales: 0, transactions: 0, expenses: 0 });
    return {
      metrics: [metric('الفروع المتاحة', number(branchRows.length)), metric('صافي المبيعات', money(totals.sales)), metric('الفواتير والطلبات', number(totals.transactions)), metric('المصروفات', money(totals.expenses))],
      tables: [table('Branch Ranking', 'مقارنة الفروع', ['الفرع', 'صافي المبيعات', 'الفواتير', 'متوسط الفاتورة', 'إجمالي ربح POS', 'المصروفات', 'النتيجة المعروفة'], branchRows.map((row) => {
        const current = record(row.current);
        return [text(row.branch_name), money(numeric(current.net_sales)), number(numeric(current.transactions)), money(numeric(current.average_ticket)), moneyNullable(current.pos_gross_profit), money(numeric(current.expenses)), moneyNullable(current.known_operating_result)];
      }), 'لا توجد فروع متاحة للمقارنة.')],
    };
  }

  if (kind === 'online') {
    const quality = record(data.data_quality);
    const profitAvailable = quality.profit_available !== false && summary.online_gross_profit != null;
    const reconstructedLines = numeric(quality.reconstructed_legacy_lines);
    return {
      metrics: [
        metric('الطلبات', number(numeric(summary.order_count))),
        metric('قيمة الطلبات المسلمة', money(numeric(summary.delivered_order_value))),
        metric('صافي مبيعات الأونلاين', money(numeric(summary.online_net_sales))),
        metric('تكلفة الأونلاين', profitAvailable ? moneyNullable(summary.online_cogs) : '—'),
        metric('إجمالي ربح الأونلاين', profitAvailable ? moneyNullable(summary.online_gross_profit) : '—'),
        metric('هامش ربح الأونلاين', profitAvailable ? percent(summary.online_margin_percent) : '—'),
        metric('معدل التسليم', percent(summary.delivery_rate_percent)),
        metric('معدل الإلغاء', percent(summary.cancellation_rate_percent)),
      ],
      note: !profitAvailable
        ? 'يوجد بند أو أكثر بدون تكلفة موثقة؛ لذلك لا يعرض النظام رقم ربح تخميني.'
        : reconstructedLines > 0
          ? `${number(reconstructedLines)} بند تاريخي أُعيد بناؤه من سعر الشراء الموجود وقت التحديث؛ الطلبات الجديدة تحفظ تكلفة البيع كـ Snapshot عند تحقق الطلب.`
          : undefined,
      tables: [
        table('Orders', 'آخر الطلبات', ['العميل', 'الحالة', 'الدفع', 'الوسيلة', 'القيمة', 'الشحن', 'العناصر', 'الوقت'], rows(data.orders).map((row) => [text(row.customer_name, 'عميل غير مسجل'), status(row.status), status(row.payment_status), text(row.payment_method), money(numeric(row.total)), money(numeric(row.shipping_cost)), number(numeric(row.item_count)), dateTime(row.created_at)]), 'لا توجد طلبات أونلاين في الفترة.'),
        table('Fulfillment', 'حالات الطلبات', ['الحالة', 'الطلبات', 'القيمة', 'الشحن'], rows(data.statuses).map((row) => [status(row.status), number(numeric(row.orders)), money(numeric(row.order_value)), money(numeric(row.shipping_charged))]), 'لا توجد حالات طلبات مسجلة.'),
      ],
    };
  }

  if (kind === 'customers') {
    return {
      metrics: [metric('عملاء اشتروا', number(numeric(summary.realized_customers_in_period))), metric('عملاء جدد', number(numeric(summary.new_realized_customers))), metric('عملاء عائدون', number(numeric(summary.returning_realized_customers))), metric('تغطية هوية المبيعات', percent(summary.overall_identity_coverage_percent))],
      tables: [
        table('Customer Value', 'العملاء', ['العميل', 'الهاتف', 'المرحلة', 'فواتير POS', 'طلبات أونلاين', 'قيمة الفترة', 'القيمة التاريخية', 'نقاط الولاء'], rows(data.customers).map((row) => [text(row.customer_name), text(row.phone), customerStage(row.customer_stage), number(numeric(row.pos_invoices)), number(numeric(row.online_orders)), money(numeric(row.period_realized_value)), money(numeric(row.lifetime_realized_value)), number(numeric(row.points_balance))]), 'لا توجد حركة عملاء معروفة داخل الفترة.'),
        table('Identity Coverage', 'تغطية ربط العميل', ['القناة', 'الإجمالي', 'مرتبط بعميل', 'بدون هوية', 'نسبة التغطية'], [
          ['POS', number(numeric(summary.pos_transactions)), number(numeric(summary.pos_linked_transactions)), number(numeric(summary.pos_anonymous_transactions)), percent(summary.pos_identity_coverage_percent)],
          ['أونلاين', number(numeric(summary.online_orders)), number(numeric(summary.online_linked_orders)), number(numeric(summary.online_anonymous_orders)), percent(summary.online_identity_coverage_percent)],
        ], 'لا توجد بيانات تغطية.'),
      ],
    };
  }

  if (kind === 'costs') {
    const canCosts = Boolean(record(data.permissions).can_view_costs);
    return {
      metrics: [metric('المصروفات المعتمدة', canCosts ? moneyNullable(summary.active_expense_amount) : 'محجوب'), metric('المشتريات', canCosts ? moneyNullable(summary.purchase_total) : 'محجوب'), metric('رواتب مدفوعة', canCosts ? moneyNullable(summary.salary_paid_amount) : 'محجوب'), metric('التزامات الموردين', canCosts ? moneyNullable(summary.lifetime_supplier_outstanding) : 'محجوب')],
      note: !canCosts ? 'قيم التكلفة والموردين محجوبة حسب صلاحيات الحساب.' : undefined,
      tables: [
        table('Expenses', 'أنواع المصروفات', ['النوع', 'العمليات', 'القيمة'], rows(data.expense_types).map((row) => [text(row.type, 'غير مصنف'), number(numeric(row.records)), canCosts ? moneyNullable(row.amount) : 'محجوب']), 'لا توجد مصروفات مسجلة في الفترة.'),
        table('Suppliers', 'الموردون', ['المورد', 'مشتريات الفترة', 'إجمالي الفترة', 'المدفوع', 'المستحق التاريخي', 'آخر شراء'], rows(data.suppliers).map((row) => [text(row.supplier_name), number(numeric(row.period_purchase_count)), canCosts ? moneyNullable(row.period_purchase_total) : 'محجوب', canCosts ? moneyNullable(row.period_paid_total) : 'محجوب', canCosts ? moneyNullable(row.lifetime_outstanding) : 'محجوب', dateTime(row.last_purchase_at)]), 'لا توجد حركة موردين داخل الفترة.'),
      ],
    };
  }

  if (kind === 'transfers') {
    const canProfit = Boolean(record(data.permissions).can_view_profit);
    return {
      metrics: [metric('صادر قيد النقل', number(numeric(summary.in_transit_outgoing))), metric('وارد قيد النقل', number(numeric(summary.in_transit_incoming))), metric('استلامات بفروق', number(numeric(summary.received_with_variance_in_period))), metric('نسبة الفروق', percent(summary.variance_rate_percent))],
      note: numeric(summary.overdue_transfer_tasks) > 0 ? `يوجد ${number(numeric(summary.overdue_transfer_tasks))} مهمة تحويل متأخرة تحتاج إجراء.` : undefined,
      tables: [table('Inventory Transfers', 'آخر التحويلات', ['التحويل', 'الاتجاه', 'من', 'إلى', 'الحالة', 'الأصناف', 'المشحون', 'المستلم', 'الفرق', 'التكلفة'], rows(data.recent_transfers).map((row) => [text(row.transfer_number), row.direction === 'incoming' ? 'وارد' : 'صادر', text(row.from_branch_name), text(row.to_branch_name), status(row.status), number(numeric(row.items_count)), number(numeric(row.shipped_measure)), number(numeric(row.received_measure)), number(numeric(row.variance_measure)), canProfit ? moneyNullable(row.cost_value) : 'محجوب']), 'لا توجد تحويلات مخزون داخل الفترة.')],
    };
  }

  return {
    metrics: [metric('إجمالي الإشارات', number(numeric(summary.total))), metric('عاجل', number(numeric(summary.critical))), metric('تحذيرات', number(numeric(summary.warning))), metric('فرص', number(numeric(summary.opportunity)))],
    note: record(data.data_quality).generative_ai_used === false ? 'الإشارات مبنية على قواعد وبيانات فعلية، ولا تستخدم ذكاءً توليديًا لتخمين النتائج.' : undefined,
    tables: [table('Smart Insights', 'الإشارات حسب الأولوية', ['الإشارة', 'النوع', 'المؤشر', 'القيمة', 'الإجراء'], rows(data.insights).map((row) => [text(row.title), insightSeverity(row.severity), text(row.metric_label), `${number(numeric(row.metric_value))} ${text(row.metric_unit, '')}`.trim(), text(row.action)]), 'لا توجد إشارات تشغيلية للفترة المحددة.')],
  };
}

function metric(label: string, value: string, hint?: string): Metric { return { label, value, hint }; }
function table(eyebrow: string, title: string, columns: string[], body: string[][], empty: string): TableSpec { return { eyebrow, title, columns, rows: body, empty }; }
function TableCard({ eyebrow, title, columns, rows: tableRows, empty }: TableSpec) { return <section className="section-card report-table-card"><div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div><FileText size={20}/></div>{tableRows.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{tableRows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}</tr>)}</tbody></table></div> : <div className="empty-data"><span>—</span><p>{empty}</p></div>}</section>; }
function Summary({ label, value, hint }: Metric) { return <article className="finance-summary"><span>{label}</span><strong>{value}</strong>{hint && <small className="muted">{hint}</small>}</article>; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.map(record) : []; }
function numeric(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function text(value: unknown, fallback = '—'): string { return value == null || value === '' ? fallback : String(value); }
function moneyNullable(value: unknown) { return value == null || value === '' ? '—' : money(numeric(value)); }
function percent(value: unknown) { return `${number(numeric(value))}%`; }
function dateTime(value: unknown) { if (!value) return '—'; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }); }
function customerStage(value: unknown) { const labels: Record<string, string> = { prospect: 'محتمل', new: 'جديد', returning: 'عائد', engaged: 'نشط' }; return labels[String(value || '')] || text(value); }
function insightSeverity(value: unknown) { const labels: Record<string, string> = { critical: 'عاجل', warning: 'تحذير', opportunity: 'فرصة', info: 'معلومة' }; return labels[String(value || '')] || text(value); }
function status(value: unknown) { const labels: Record<string, string> = { open: 'مفتوحة', closed: 'مغلقة', approved: 'معتمد', rejected: 'مرفوض', pending: 'معلق', delivered: 'تم التسليم', cancelled: 'ملغي', processing: 'قيد التنفيذ', paid: 'مدفوع', failed: 'فشل', refunded: 'مردود' }; return labels[String(value || '')] || text(value); }
function csvCell(value: unknown) { const string = String(value ?? ''); return `"${string.replace(/"/g, '""')}"`; }
function cairoToday() { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function periodLabel(period: PeriodKey, from: string, to: string) { if (period === 'custom') return `${from} ← ${to}`; const labels: Record<PeriodKey, string> = { today: 'اليوم', yesterday: 'أمس', week: 'الأسبوع', month: 'الشهر', custom: 'مخصص' }; return labels[period]; }
