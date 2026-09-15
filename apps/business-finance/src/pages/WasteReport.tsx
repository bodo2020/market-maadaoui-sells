import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarDays, Download, Printer, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, number } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { DonutChart, RankedBarChart, TrendAreaChart } from '../components/ReportVisuals';
import { useBusiness } from '../context/BusinessContext';
import { type BusinessFilters, type PeriodKey } from '../services/businessFinance';
import { fetchWasteReport } from '../services/businessAnalytics';
import { makeCairoCustomRange } from '../services/salesReporting';
import type { ReportDocument } from '../services/reportingDetails';
import './sales-report.css';
import './business-analytics.css';

export default function WasteReport() {
  const { selectedBranch } = useBusiness();
  const today = cairoToday();
  const [period, setPeriod] = useState<PeriodKey>('month');
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
    branchId: selectedBranch.branch_id, period, from: customRange?.from, to: customRange?.to,
  } : null, [selectedBranch, period, customRange]);

  async function load() {
    if (!filters) { if (period === 'custom') setError('اختر فترة مخصصة صحيحة.'); return; }
    setLoading(true); setError(null);
    try { setData(await fetchWasteReport(filters)); }
    catch (cause) { setData(null); setError(cause instanceof Error ? cause.message : 'تعذر تحميل تقرير التالف.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [filters]);

  const summary = record(data?.summary);
  const permissions = record(data?.permissions);
  const canViewCost = Boolean(permissions.can_view_cost_loss);
  const products = rows(data?.products);
  const reasons = rows(data?.reasons);
  const daily = rows(data?.daily);
  const recent = rows(data?.recent);

  function exportCsv() {
    if (!recent.length) return;
    const lines = [
      ['الوقت', 'المنتج', 'الباركود', 'السبب', 'الكمية/الوزن التالف', 'الوحدة', 'تكلفة الخسارة', 'ملاحظة'],
      ...recent.map((row) => [dateTime(row.event_at), text(row.product_name), text(row.barcode), reasonLabel(row.reason_code), num(row.damaged_measure), text(row.unit_of_measure), canViewCost ? num(row.cost_loss) : 'محجوب', text(row.note)]),
    ];
    const csv = lines.map((line) => line.map(csvCell).join(',')).join('\n');
    download(`elmadawy-waste-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${csv}`);
  }

  return <div className="stack-lg sales-report-page">
    <section className="report-detail-head sales-report-head">
      <div className="report-detail-head__title"><Link to="/reports" className="back-button" aria-label="العودة للتقارير"><ArrowRight size={19}/></Link><span className="report-card__icon"><AlertTriangle size={22}/></span><div><span className="eyebrow">Inventory Loss Control</span><h2>التالف والهالك</h2><p>تحليل التالف والكسر المعتمد من مراجعات المخزون، مع قياس الكمية وتكلفة الخسارة الحقيقية.</p></div></div>
      <div className="sales-period-control"><PeriodSwitcher period={period} onChange={setPeriod}/><button type="button" className={period === 'custom' ? 'custom-period-button active' : 'custom-period-button'} onClick={() => setPeriod('custom')}><CalendarDays size={16}/> مخصص</button></div>
    </section>

    {period === 'custom' && <section className="section-card custom-date-panel"><div><span className="eyebrow">Custom Range</span><h3>فترة مخصصة</h3><p>التالف يُنسب لتاريخ اعتماد حركة المخزون بتوقيت القاهرة.</p></div><div className="custom-date-inputs"><label><span>من</span><input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)}/></label><label><span>إلى</span><input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)}/></label></div></section>}

    <section className="section-card financial-report-actions"><div><span className="eyebrow">Approved Losses</span><strong>{selectedBranch?.branch_name || 'الفرع'} · Damage + Breakage</strong></div><div className="report-actions"><button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={16}/> طباعة / PDF</button><button className="secondary-button" type="button" disabled={!recent.length} onClick={exportCsv}><Download size={16}/> CSV</button></div></section>

    {error && <section className="engine-banner"><div><strong>تعذر تحميل التالف</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}

    <section className="finance-summary-grid">{loading ? [1,2,3,4].map((item) => <article className="finance-summary" key={item}><span>جاري التحميل</span><div className="skeleton wide"/></article>) : <>
      <Summary label="عمليات تلف معتمدة" value={number(num(summary.events))}/>
      <Summary label="منتجات متأثرة" value={number(num(summary.affected_products))}/>
      <Summary label="إجمالي الكمية/الوزن" value={number(num(summary.damaged_measure))}/>
      <Summary label="تكلفة الخسارة" value={canViewCost ? money(nullable(summary.cost_loss)) : 'محجوب'} hint={canViewCost ? 'بسعر الشراء Snapshot وقت المراجعة' : 'تحتاج صلاحية عرض الربحية'}/>
    </>}</section>

    {data && <section className="report-visual-grid">
      <TrendAreaChart eyebrow="Waste Trend" title="اتجاه التالف حسب اليوم" points={daily.map((row) => ({ label: dateLabel(row.day), value: num(row.damaged_measure) }))} valueLabel="الكمية/الوزن" formatValue={(value) => number(value)}/>
      <RankedBarChart eyebrow="Top Damaged Products" title="أكثر المنتجات تعرضًا للتلف" items={products.map((row) => ({ label: text(row.product_name), value: num(row.damaged_measure) }))} formatValue={(value) => number(value)}/>
      <DonutChart eyebrow="Waste Reasons" title="توزيع التالف حسب السبب" segments={reasons.map((row) => ({ label: reasonLabel(row.reason_code), value: num(row.damaged_measure) }))} formatValue={(value) => number(value)} centerLabel="التالف"/>
    </section>}

    <section className="section-card report-table-card">
      <div className="section-heading"><div><span className="eyebrow">Damage Ledger</span><h3>آخر حركات التالف المعتمدة</h3></div><AlertTriangle size={20}/></div>
      {recent.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>الوقت</th><th>المنتج</th><th>السبب</th><th>الكمية/الوزن</th><th>الوحدة</th><th>تكلفة الخسارة</th><th>ملاحظة</th></tr></thead><tbody>{recent.map((row, index) => <tr key={`${text(row.task_id)}-${index}`}><td>{dateTime(row.event_at)}</td><td><strong>{text(row.product_name)}</strong><small className="table-subtext">{text(row.barcode)}</small></td><td>{reasonLabel(row.reason_code)}</td><td>{number(num(row.damaged_measure))}</td><td>{text(row.unit_of_measure)}</td><td>{canViewCost ? money(nullable(row.cost_loss)) : 'محجوب'}</td><td>{text(row.note)}</td></tr>)}</tbody></table></div> : <Empty text="لا توجد حركات تلف أو كسر معتمدة في الفترة. أول حركة Inventory Adjustment بسبب تلف أو كسر ستظهر هنا تلقائيًا."/>}
    </section>
  </div>;
}

function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) { return <article className="finance-summary"><span>{label}</span><strong>{value}</strong>{hint && <small className="muted">{hint}</small>}</article>; }
function Empty({ text }: { text: string }) { return <div className="empty-data"><span>—</span><p>{text}</p></div>; }
function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function num(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function nullable(value: unknown): number | null { if (value == null || value === '') return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function text(value: unknown, fallback = '—'): string { return value == null || value === '' ? fallback : String(value); }
function reasonLabel(value: unknown): string { const key = String(value || ''); return key === 'damage' ? 'تلف' : key === 'breakage' ? 'كسر' : text(value); }
function dateLabel(value: unknown) { if (!value) return '—'; return new Date(`${String(value)}T12:00:00`).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' }); }
function dateTime(value: unknown) { if (!value) return '—'; return new Date(String(value)).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }); }
function csvCell(value: unknown): string { const valueText = String(value ?? ''); return /[",\n]/.test(valueText) ? `"${valueText.replace(/"/g, '""')}"` : valueText; }
function download(filename: string, content: string) { const blob = new Blob([content], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }
function cairoToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
