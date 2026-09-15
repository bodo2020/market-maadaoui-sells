import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Boxes, CalendarDays, Download, FileText, PackageSearch, Printer, RefreshCcw, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, number } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { ReportVisuals } from '../components/ReportVisuals';
import { useBusiness } from '../context/BusinessContext';
import { type BusinessFilters, type PeriodKey } from '../services/businessFinance';
import { fetchDetailedReport, type ReportDocument } from '../services/reportingDetails';
import { makeCairoCustomRange } from '../services/salesReporting';
import './sales-report.css';

type OperationsReportKind = 'products' | 'inventory' | 'returns';
type CsvTable = { title: string; columns: string[]; rows: Array<Array<string | number>> };

const reportMeta = {
  products: { title: 'المنتجات والأقسام', eyebrow: 'Reporting V2 · Products', description: 'الأكثر مبيعًا وربحًا، الهامش ومساهمة الأقسام من Snapshot الفاتورة.', icon: PackageSearch },
  inventory: { title: 'تقرير المخزون', eyebrow: 'Reporting V2 · Inventory', description: 'قيمة المخزون الحالية، النواقص، النافد وصحة المخزون حسب الأقسام.', icon: Boxes },
  returns: { title: 'تقرير المرتجعات', eyebrow: 'Reporting V2 · Returns', description: 'قيمة وعدد المرتجعات، الأسباب، مهام رد المبلغ وتأثير الربح.', icon: RotateCcw },
} as const;

export default function OperationsReport({ kind }: { kind: OperationsReportKind }) {
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
  const summary = record(data?.summary);
  const permissions = record(data?.permissions);
  const canProfit = Boolean(permissions.can_view_profit);
  const note = kind === 'inventory' && data && !Boolean(summary.stock_turnover_available)
    ? text(summary.stock_turnover_note, 'معدل دوران المخزون غير مكتمل في المصدر الحالي.')
    : kind === 'returns' && data && !canProfit
      ? 'تأثير المرتجعات على الربح محجوب حسب صلاحيات مشاهدة الربحية.'
      : null;

  function exportCsv() {
    if (!data) return;
    const tables = buildCsv(kind, data, canProfit);
    const csv = tables.flatMap((table) => [[table.title], table.columns, ...table.rows, []]).map((row) => row.map(csvCell).join(',')).join('\n');
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

    {period === 'custom' && <section className="section-card custom-date-panel"><div><span className="eyebrow">Custom Range</span><h3>فترة مخصصة</h3><p>النطاق بتوقيت القاهرة وتاريخ النهاية داخل الحساب كاملًا.</p></div><div className="custom-date-inputs"><label><span>من</span><input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)}/></label><label><span>إلى</span><input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)}/></label></div></section>}

    <section className="section-card financial-report-actions"><div><span className="eyebrow">Report Scope</span><strong>{selectedBranch?.branch_name || 'الفرع'} · {periodLabel(period, customFrom, customTo)}</strong></div><div className="report-actions"><button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={16}/> طباعة / PDF</button><button className="secondary-button" type="button" disabled={!data} onClick={exportCsv}><Download size={16}/> CSV</button></div></section>

    {error && <section className="engine-banner"><div><strong>تعذر تحميل التقرير</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}

    <section className="finance-summary-grid">{loading
      ? [1, 2, 3, 4].map((item) => <article className="finance-summary" key={item}><span>جاري التحميل</span><div className="skeleton wide"/></article>)
      : kind === 'products' ? <ProductMetrics summary={summary} canProfit={canProfit}/>
        : kind === 'inventory' ? <InventoryMetrics summary={summary}/>
          : <ReturnMetrics summary={summary} canProfit={canProfit}/>}</section>

    {note && <p className="data-scope-note">{note}</p>}
    {data && <ReportVisuals reportKey={kind} data={data}/>} 
    {data && kind === 'products' && <ProductTables data={data} canProfit={canProfit}/>} 
    {data && kind === 'inventory' && <InventoryTables data={data}/>} 
    {data && kind === 'returns' && <ReturnTables data={data}/>} 
  </div>;
}

function ProductMetrics({ summary, canProfit }: { summary: Record<string, unknown>; canProfit: boolean }) {
  return <><Summary label="المنتجات المباعة" value={number(numeric(summary.products_sold))}/><Summary label="صافي الإيراد" value={money(numeric(summary.net_revenue))}/><Summary label="صافي الربح" value={canProfit ? moneyNullable(summary.net_profit) : 'محجوب'}/><Summary label="هامش الربح" value={canProfit && nullable(summary.margin_percent) != null ? `${number(numeric(summary.margin_percent))}%` : '—'}/></>;
}
function InventoryMetrics({ summary }: { summary: Record<string, unknown> }) {
  return <><Summary label="قيمة الشراء الحالية" value={money(numeric(summary.purchase_value))}/><Summary label="قيمة البيع المتوقعة" value={money(numeric(summary.retail_value))}/><Summary label="منخفض المخزون" value={number(numeric(summary.low_stock_rows))}/><Summary label="نافد المخزون" value={number(numeric(summary.out_of_stock_rows))}/></>;
}
function ReturnMetrics({ summary, canProfit }: { summary: Record<string, unknown>; canProfit: boolean }) {
  return <><Summary label="قيمة المرتجعات المعتمدة" value={money(numeric(summary.approved_value))}/><Summary label="المرتجعات المعتمدة" value={number(numeric(summary.approved_count))}/><Summary label="مهام رد معلقة" value={number(numeric(summary.pending_refund_tasks))} hint={money(numeric(summary.pending_refund_amount))}/><Summary label="تأثير الربح" value={canProfit ? moneyNullable(summary.profit_impact) : 'محجوب'}/></>;
}

function ProductTables({ data, canProfit }: { data: ReportDocument; canProfit: boolean }) {
  return <><TableCard eyebrow="Product Performance" title="المنتجات" columns={['المنتج', 'القسم', 'الفواتير', 'صافي الكمية', 'صافي الإيراد', 'الربح']} rows={rows(data.products).map((row) => [text(row.product_name), text(row.category_name), number(numeric(row.invoices)), number(numeric(row.net_measure)), money(numeric(row.net_revenue)), canProfit ? moneyNullable(row.net_profit) : 'محجوب'])} empty="لا توجد مبيعات منتجات داخل الفترة."/><TableCard eyebrow="Category Contribution" title="مساهمة الأقسام" columns={['القسم', 'المنتجات', 'صافي الإيراد', 'المساهمة', 'الهامش']} rows={rows(data.categories).map((row) => [text(row.category_name), number(numeric(row.products)), money(numeric(row.net_revenue)), `${number(numeric(row.contribution_percent))}%`, canProfit && nullable(row.margin_percent) != null ? `${number(numeric(row.margin_percent))}%` : '—'])} empty="لا توجد بيانات أقسام داخل الفترة."/></>;
}
function InventoryTables({ data }: { data: ReportDocument }) {
  const alerts = [...rows(data.out_of_stock), ...rows(data.low_stock)];
  return <><TableCard eyebrow="Stock Alerts" title="منخفض ونافد المخزون" columns={['المنتج', 'القسم', 'الكمية', 'الحد']} rows={alerts.map((row) => [text(row.product_name), text(row.category_name), number(numeric(row.quantity)), number(numeric(row.threshold))])} empty="لا توجد منتجات منخفضة أو نافدة المخزون."/><TableCard eyebrow="Inventory Value" title="قيمة المخزون حسب الأقسام" columns={['القسم', 'الأصناف', 'متوفر', 'نافد', 'قيمة الشراء', 'قيمة البيع']} rows={rows(data.categories).map((row) => [text(row.category_name), number(numeric(row.sku_rows)), number(numeric(row.in_stock_rows)), number(numeric(row.out_of_stock_rows)), money(numeric(row.purchase_value)), money(numeric(row.retail_value))])} empty="لا توجد بيانات مخزون مجمعة حسب الأقسام."/></>;
}
function ReturnTables({ data }: { data: ReportDocument }) {
  return <><TableCard eyebrow="Returns Drill-down" title="آخر المرتجعات" columns={['المستند', 'النوع', 'السبب', 'وسيلة الدفع', 'القيمة', 'الحالة', 'الوقت']} rows={rows(data.recent).map((row) => [text(row.document_number), returnType(row.return_type), text(row.reason), text(row.payment_name), money(numeric(row.total_amount)), status(row.status), dateTime(row.event_at)])} empty="لا توجد مرتجعات في الفترة."/><TableCard eyebrow="Return Reasons" title="أسباب المرتجع" columns={['السبب', 'العدد', 'القيمة']} rows={rows(data.reasons).map((row) => [text(row.reason), number(numeric(row.returns)), money(numeric(row.value))])} empty="لا توجد أسباب مرتجعات مسجلة."/></>;
}

function TableCard({ eyebrow, title, columns, rows: tableRows, empty }: { eyebrow: string; title: string; columns: string[]; rows: string[][]; empty: string }) {
  return <section className="section-card report-table-card"><div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div><FileText size={20}/></div>{tableRows.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{tableRows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}</tr>)}</tbody></table></div> : <div className="empty-data"><span>—</span><p>{empty}</p></div>}</section>;
}
function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) { return <article className="finance-summary"><span>{label}</span><strong>{value}</strong>{hint && <small className="muted">{hint}</small>}</article>; }

function buildCsv(kind: OperationsReportKind, data: ReportDocument, canProfit: boolean): CsvTable[] {
  if (kind === 'products') return [
    { title: 'المنتجات', columns: ['المنتج', 'القسم', 'الفواتير', 'صافي الكمية', 'صافي الإيراد', 'الربح'], rows: rows(data.products).map((row) => [text(row.product_name), text(row.category_name), numeric(row.invoices), numeric(row.net_measure), numeric(row.net_revenue), canProfit ? numeric(row.net_profit) : 'محجوب']) },
    { title: 'الأقسام', columns: ['القسم', 'المنتجات', 'صافي الإيراد', 'المساهمة %', 'الهامش %'], rows: rows(data.categories).map((row) => [text(row.category_name), numeric(row.products), numeric(row.net_revenue), numeric(row.contribution_percent), canProfit ? numeric(row.margin_percent) : 'محجوب']) },
  ];
  if (kind === 'inventory') return [
    { title: 'تنبيهات المخزون', columns: ['المنتج', 'القسم', 'الكمية', 'الحد'], rows: [...rows(data.out_of_stock), ...rows(data.low_stock)].map((row) => [text(row.product_name), text(row.category_name), numeric(row.quantity), numeric(row.threshold)]) },
    { title: 'قيمة المخزون', columns: ['القسم', 'الأصناف', 'متوفر', 'نافد', 'قيمة الشراء', 'قيمة البيع'], rows: rows(data.categories).map((row) => [text(row.category_name), numeric(row.sku_rows), numeric(row.in_stock_rows), numeric(row.out_of_stock_rows), numeric(row.purchase_value), numeric(row.retail_value)]) },
  ];
  return [
    { title: 'المرتجعات', columns: ['المستند', 'النوع', 'السبب', 'وسيلة الدفع', 'القيمة', 'الحالة', 'الوقت'], rows: rows(data.recent).map((row) => [text(row.document_number), returnType(row.return_type), text(row.reason), text(row.payment_name), numeric(row.total_amount), status(row.status), text(row.event_at)]) },
    { title: 'أسباب المرتجع', columns: ['السبب', 'العدد', 'القيمة'], rows: rows(data.reasons).map((row) => [text(row.reason), numeric(row.returns), numeric(row.value)]) },
  ];
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.map(record) : []; }
function numeric(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function nullable(value: unknown): number | null { return value == null || value === '' ? null : numeric(value); }
function text(value: unknown, fallback = '—'): string { return value == null || value === '' ? fallback : String(value); }
function moneyNullable(value: unknown) { return nullable(value) == null ? '—' : money(numeric(value)); }
function dateTime(value: unknown) { if (!value) return '—'; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }); }
function returnType(value: unknown) { const labels: Record<string, string> = { full: 'كامل', partial: 'جزئي' }; return labels[String(value || '')] || text(value); }
function status(value: unknown) { const labels: Record<string, string> = { pending: 'معلق', approved: 'معتمد', rejected: 'مرفوض', completed: 'مكتمل', refunded: 'تم رد المبلغ', active: 'نشط', closed: 'مغلق' }; return labels[String(value || '')] || text(value); }
function csvCell(value: unknown) { const string = String(value ?? ''); return `"${string.replace(/"/g, '""')}"`; }
function cairoToday() { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function periodLabel(period: PeriodKey, from: string, to: string) { if (period === 'custom') return `${from} ← ${to}`; const labels: Record<PeriodKey, string> = { today: 'اليوم', yesterday: 'أمس', week: 'الأسبوع', month: 'الشهر', custom: 'مخصص' }; return labels[period]; }
