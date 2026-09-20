import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CircleDollarSign, Download, FileText, Printer, RefreshCcw, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, number } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { ReportVisuals } from '../components/ReportVisuals';
import { useBusiness } from '../context/BusinessContext';
import { type BusinessFilters, type PeriodKey } from '../services/businessFinance';
import { fetchDetailedReport, type ReportDocument } from '../services/reportingDetails';
import { makeCairoCustomRange } from '../services/salesReporting';
import './sales-report.css';

type FinancialReportKind = 'profitability' | 'payments';
type CsvTable = { title: string; columns: string[]; rows: Array<Array<string | number>> };

const reportMeta = {
  profitability: {
    title: 'تقرير الربحية المتقدم',
    eyebrow: 'Reporting V2 · Profitability',
    description: 'من صافي المبيعات والتكلفة حتى إجمالي الربح ورسوم الدفع والمصروفات والنتيجة التشغيلية.',
    icon: CircleDollarSign,
  },
  payments: {
    title: 'وسائل الدفع والتسويات',
    eyebrow: 'Reporting V2 · Payments & Settlements',
    description: 'التحصيل والمرتجعات والرسوم وصافي الحركة والأرصدة غير المسواة لكل وسيلة دفع.',
    icon: WalletCards,
  },
} as const;

export default function FinancialReport({ kind }: { kind: FinancialReportKind }) {
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
  const permission = record(data?.permissions);
  const canFinance = kind !== 'payments' || Boolean(permission.can_view_finance);
  const reconstructedOnlineLines = numeric(record(data?.online_profit_quality).reconstructed_legacy_lines);
  const missingOnlineCostLines = numeric(record(data?.online_profit_quality).missing_cost_lines);
  const note = kind === 'profitability' && data && !Boolean(data.online_profit_complete)
    ? `ربح الأونلاين غير مكتمل لأن تكلفة ${number(missingOnlineCostLines)} بند لم تُحفظ بعد؛ لن يتم تخمين الربح لهذه البنود.`
    : kind === 'profitability' && data && reconstructedOnlineLines > 0
      ? `أرباح الأونلاين ظاهرة الآن. ${number(reconstructedOnlineLines)} بند تاريخي أُعيد بناؤه من سعر الشراء الموجود وقت التحديث؛ الطلبات الجديدة تحفظ Snapshot للتكلفة عند تحقق البيع.`
      : kind === 'payments' && data && !canFinance
        ? 'تفاصيل التسويات والأرصدة الحية محجوبة حسب صلاحيات الحساب، بينما أرقام التحصيل المتاحة تظل ظاهرة.'
        : null;

  function exportCsv() {
    if (!data) return;
    const tables = kind === 'profitability' ? profitabilityCsv(data) : paymentsCsv(data, canFinance);
    const csv = tables.flatMap((table) => [
      [table.title],
      table.columns,
      ...table.rows,
      [],
    ]).map((row) => row.map(csvCell).join(',')).join('\n');
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
      <div className="report-detail-head__title">
        <Link to="/reports" className="back-button" aria-label="العودة للتقارير"><ArrowRight size={19}/></Link>
        <span className="report-card__icon"><Icon size={22}/></span>
        <div><span className="eyebrow">{meta.eyebrow}</span><h2>{meta.title}</h2><p>{meta.description}</p></div>
      </div>
      <div className="sales-period-control">
        <PeriodSwitcher period={period} onChange={setPeriod}/>
        <button type="button" className={period === 'custom' ? 'custom-period-button active' : 'custom-period-button'} onClick={() => setPeriod('custom')}><CalendarDays size={16}/> مخصص</button>
      </div>
    </section>

    {period === 'custom' && <section className="section-card custom-date-panel">
      <div><span className="eyebrow">Custom Range</span><h3>فترة مخصصة</h3><p>النطاق بتوقيت القاهرة، وتاريخ النهاية محسوب كاملًا.</p></div>
      <div className="custom-date-inputs"><label><span>من</span><input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)}/></label><label><span>إلى</span><input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)}/></label></div>
    </section>}

    <section className="section-card financial-report-actions">
      <div><span className="eyebrow">Report Scope</span><strong>{selectedBranch?.branch_name || 'الفرع'} · {periodLabel(period, customFrom, customTo)}</strong></div>
      <div className="report-actions"><button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={16}/> طباعة / PDF</button><button className="secondary-button" type="button" disabled={!data} onClick={exportCsv}><Download size={16}/> CSV</button></div>
    </section>

    {error && <section className="engine-banner"><div><strong>تعذر تحميل التقرير</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}

    <section className="finance-summary-grid">{loading
      ? [1, 2, 3, 4].map((item) => <article className="finance-summary" key={item}><span>جاري التحميل</span><div className="skeleton wide"/></article>)
      : kind === 'profitability'
        ? <>
          <Summary label="صافي مبيعات POS" value={money(numeric(summary.pos_net_sales))}/>
          <Summary label="إجمالي ربح POS" value={moneyNullable(summary.pos_gross_profit)}/>
          <Summary label="صافي مبيعات الأونلاين" value={money(numeric(summary.online_net_sales))}/>
          <Summary label="تكلفة الأونلاين" value={moneyNullable(summary.online_cogs)}/>
          <Summary label="إجمالي ربح الأونلاين" value={moneyNullable(summary.online_gross_profit)}/>
          <Summary label="هامش ربح الأونلاين" value={percentNullable(summary.online_margin_percent)}/>
          <Summary label="إجمالي الربح POS + Online" value={moneyNullable(summary.combined_gross_profit)}/>
          <Summary label="النتيجة التشغيلية المعروفة (POS)" value={moneyNullable(summary.known_operating_result)}/>
        </>
        : <>
          <Summary label="إجمالي التحصيل" value={money(numeric(summary.gross_collected))}/>
          <Summary label="المرتجعات" value={money(numeric(summary.refunds))}/>
          <Summary label="رسوم على المتجر" value={money(numeric(summary.merchant_fees))}/>
          <Summary label="صافي حركة الفترة" value={money(numeric(summary.net_period_movement))}/>
        </>}
    </section>

    {note && <p className="data-scope-note">{note}</p>}
    {data && <ReportVisuals reportKey={kind} data={data}/>} 

    {data && kind === 'profitability' && <ProfitabilityTables data={data}/>} 
    {data && kind === 'payments' && <PaymentTables data={data} canFinance={canFinance}/>} 
  </div>;
}

function ProfitabilityTables({ data }: { data: ReportDocument }) {
  const waterfall = rows(data.waterfall);
  const daily = rows(data.daily);
  return <>
    <TableCard eyebrow="Profit Waterfall" title="تكوين الربح" columns={['البند', 'القيمة']} rows={waterfall.map((row) => [text(row.label ?? row.key), money(numeric(row.value))])} empty="لا توجد مكونات ربح داخل الفترة."/>
    <TableCard eyebrow="Daily Profitability" title="الربحية حسب اليوم" columns={['اليوم', 'صافي POS', 'تكلفة POS', 'ربح POS', 'صافي Online', 'تكلفة Online', 'ربح Online', 'إجمالي الربح']} rows={daily.map((row) => [text(row.date), money(numeric(row.net_sales)), money(numeric(row.net_cogs)), money(numeric(row.gross_profit)), money(numeric(row.online_net_sales)), moneyNullable(row.online_cogs), moneyNullable(row.online_gross_profit), moneyNullable(row.combined_gross_profit)])} empty="لا توجد حركة يومية داخل الفترة."/>
  </>;
}

function PaymentTables({ data, canFinance }: { data: ReportDocument; canFinance: boolean }) {
  const methods = rows(data.methods);
  const settlements = rows(data.recent_settlements);
  return <>
    <TableCard eyebrow="Payment Ledger" title="وسائل الدفع" columns={['الوسيلة', 'العمليات', 'التحصيل', 'المرتجعات', 'الرسوم', 'صافي الحركة', 'غير مسوّى']} rows={methods.map((row) => [text(row.name), number(numeric(row.transactions)), money(numeric(row.gross_collected)), money(numeric(row.refunds)), money(numeric(row.merchant_fees)), money(numeric(row.net_period_movement)), canFinance ? moneyNullable(row.unsettled_balance) : 'محجوب'])} empty="لا توجد حركات دفع داخل الفترة."/>
    <TableCard eyebrow="Settlements" title="آخر التسويات" columns={['الوسيلة', 'الإجمالي', 'الرسوم', 'الصافي', 'المرجع', 'التاريخ']} rows={settlements.map((row) => [text(row.payment_method), money(numeric(row.gross_amount)), money(numeric(row.fee_amount)), money(numeric(row.net_amount)), text(row.provider_reference), dateTime(row.settled_at)])} empty="لا توجد تسويات مسجلة داخل الفترة."/>
  </>;
}

function TableCard({ eyebrow, title, columns, rows: tableRows, empty }: { eyebrow: string; title: string; columns: string[]; rows: string[][]; empty: string }) {
  return <section className="section-card report-table-card">
    <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div><FileText size={20}/></div>
    {tableRows.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{tableRows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}</tr>)}</tbody></table></div> : <div className="empty-data"><span>—</span><p>{empty}</p></div>}
  </section>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <article className="finance-summary"><span>{label}</span><strong>{value}</strong></article>;
}

function profitabilityCsv(data: ReportDocument): CsvTable[] {
  return [
    { title: 'تكوين الربح', columns: ['البند', 'القيمة'], rows: rows(data.waterfall).map((row) => [text(row.label ?? row.key), numeric(row.value)]) },
    { title: 'الربحية حسب اليوم', columns: ['اليوم', 'صافي POS', 'تكلفة POS', 'ربح POS', 'صافي Online', 'تكلفة Online', 'ربح Online', 'إجمالي الربح'], rows: rows(data.daily).map((row) => [text(row.date), numeric(row.net_sales), numeric(row.net_cogs), numeric(row.gross_profit), numeric(row.online_net_sales), nullableCsvNumber(row.online_cogs), nullableCsvNumber(row.online_gross_profit), nullableCsvNumber(row.combined_gross_profit)]) },
  ];
}

function paymentsCsv(data: ReportDocument, canFinance: boolean): CsvTable[] {
  return [
    { title: 'وسائل الدفع', columns: ['الوسيلة', 'العمليات', 'التحصيل', 'المرتجعات', 'الرسوم', 'صافي الحركة', 'غير مسوّى'], rows: rows(data.methods).map((row) => [text(row.name), numeric(row.transactions), numeric(row.gross_collected), numeric(row.refunds), numeric(row.merchant_fees), numeric(row.net_period_movement), canFinance ? numeric(row.unsettled_balance) : 'محجوب']) },
    { title: 'التسويات', columns: ['الوسيلة', 'الإجمالي', 'الرسوم', 'الصافي', 'المرجع', 'التاريخ'], rows: rows(data.recent_settlements).map((row) => [text(row.payment_method), numeric(row.gross_amount), numeric(row.fee_amount), numeric(row.net_amount), text(row.provider_reference), text(row.settled_at)]) },
  ];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.map(record) : []; }
function numeric(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function text(value: unknown, fallback = '—'): string { return value == null || value === '' ? fallback : String(value); }
function moneyNullable(value: unknown) { return value == null || value === '' ? '—' : money(numeric(value)); }
function percentNullable(value: unknown) { return value == null || value === '' ? '—' : `${number(numeric(value))}%`; }
function nullableCsvNumber(value: unknown) { return value == null || value === '' ? '' : numeric(value); }
function dateTime(value: unknown) { if (!value) return '—'; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }); }
function csvCell(value: unknown) { const string = String(value ?? ''); return `"${string.replace(/"/g, '""')}"`; }
function cairoToday() { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function periodLabel(period: PeriodKey, from: string, to: string) { if (period === 'custom') return `${from} ← ${to}`; const labels: Record<PeriodKey, string> = { today: 'اليوم', yesterday: 'أمس', week: 'الأسبوع', month: 'الشهر', custom: 'مخصص' }; return labels[period]; }
