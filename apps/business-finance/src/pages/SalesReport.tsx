import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Download, Filter, Printer, RefreshCcw, Search, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, number } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { ReportVisuals } from '../components/ReportVisuals';
import { useBusiness } from '../context/BusinessContext';
import { type PeriodKey } from '../services/businessFinance';
import { fetchAdvancedSalesReport, fetchAllAdvancedSalesRows, makeCairoCustomRange, type SalesChannel } from '../services/salesReporting';
import type { ReportDocument } from '../services/reportingDetails';
import './sales-report.css';

type Option = { value: string; label: string };

export default function SalesReport() {
  const { selectedBranch } = useBusiness();
  const today = cairoToday();
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [channel, setChannel] = useState<SalesChannel>('all');
  const [cashierId, setCashierId] = useState('');
  const [paymentCode, setPaymentCode] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ReportDocument | null>(null);
  const [cashierOptions, setCashierOptions] = useState<Option[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limit = 50;

  const customRange = useMemo(() => {
    if (period !== 'custom') return null;
    try { return makeCairoCustomRange(customFrom, customTo); } catch { return null; }
  }, [period, customFrom, customTo]);

  const filters = useMemo(() => selectedBranch && (period !== 'custom' || customRange) ? {
    branchId: selectedBranch.branch_id,
    period,
    from: customRange?.from,
    to: customRange?.to,
    channel,
    cashierId: cashierId || null,
    paymentCode: paymentCode || null,
    search,
    limit,
    offset,
  } : null, [selectedBranch, period, customRange, channel, cashierId, paymentCode, search, offset]);

  async function load() {
    if (!filters) {
      if (period === 'custom') setError('اختر نطاق تاريخ صحيح.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const report = await fetchAdvancedSalesReport(filters);
      setData(report);
      setCashierOptions((current) => mergeOptions(current, rows(report.cashiers).map((row) => ({
        value: text(row.cashier_id, ''),
        label: text(row.cashier_name, 'كاشير'),
      })).filter((option) => option.value)));
      setPaymentOptions((current) => mergeOptions(current, rows(report.payment_methods).map((row) => ({
        value: text(row.code, ''),
        label: text(row.name, 'وسيلة دفع'),
      })).filter((option) => option.value)));
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل تقرير المبيعات.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [filters]);

  useEffect(() => {
    setOffset(0);
  }, [period, customFrom, customTo, channel, cashierId, paymentCode, search, selectedBranch?.branch_id]);

  const summary = record(data?.summary);
  const pagination = record(data?.pagination);
  const transactionRows = rows(data?.rows);
  const total = numeric(pagination.total);
  const hasMore = Boolean(pagination.has_more);
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  function changeChannel(next: SalesChannel) {
    setChannel(next);
    if (next === 'online') setCashierId('');
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchDraft.trim());
  }

  function clearFilters() {
    setPeriod('today');
    setCustomFrom(today);
    setCustomTo(today);
    setChannel('all');
    setCashierId('');
    setPaymentCode('');
    setSearchDraft('');
    setSearch('');
    setOffset(0);
  }

  async function exportCsv() {
    if (!filters || total <= 0 || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const exportRows = await fetchAllAdvancedSalesRows({ ...filters, offset: 0 });
      const headers = ['المرجع', 'القناة', 'الكاشير/العميل', 'وسيلة الدفع', 'الإجمالي', 'الخصومات', 'المرتجعات', 'الصافي', 'عدد الأصناف', 'التاريخ'];
      const csvRows = exportRows.map((row) => [
        text(row.document_number),
        channelLabel(row.channel),
        text(row.cashier_name ?? row.customer_name),
        text(row.payment_name),
        decimal(row.gross_amount),
        decimal(numeric(row.product_discount) + numeric(row.loyalty_discount)),
        decimal(row.refunds),
        decimal(row.net_sale),
        numeric(row.item_count),
        text(row.occurred_at),
      ]);
      const csv = [headers, ...csvRows].map((row) => row.map(csvCell).join(',')).join('\n');
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `elmadawy-sales-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تصدير التقرير.');
    } finally {
      setExporting(false);
    }
  }

  return <div className="stack-lg sales-report-page">
    <section className="report-detail-head sales-report-head">
      <div className="report-detail-head__title">
        <Link to="/reports" className="back-button" aria-label="العودة للتقارير"><ArrowRight size={19}/></Link>
        <span className="report-card__icon"><ShoppingCart size={22}/></span>
        <div><span className="eyebrow">Reporting V2 · Sales Deep Dive</span><h2>تقرير المبيعات المتقدم</h2><p>تحليل POS والأونلاين والكاشير ووسائل الدفع من نفس محرك التقارير.</p></div>
      </div>
      <div className="sales-period-control"><PeriodSwitcher period={period} onChange={setPeriod}/><button type="button" className={period === 'custom' ? 'custom-period-button active' : 'custom-period-button'} onClick={() => setPeriod('custom')}><CalendarDays size={16}/> مخصص</button></div>
    </section>

    {period === 'custom' && <section className="section-card custom-date-panel">
      <div><span className="eyebrow">Custom Range</span><h3>فترة مخصصة</h3><p>يتم احتساب الأيام بتوقيت القاهرة ويشمل تاريخ النهاية كاملًا.</p></div>
      <div className="custom-date-inputs"><label><span>من</span><input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)}/></label><label><span>إلى</span><input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)}/></label></div>
    </section>}

    <section className="section-card sales-report-toolbar">
      <div className="section-heading">
        <div><span className="eyebrow">Global Filters</span><h3><Filter size={18}/> تصفية التقرير</h3></div>
        <div className="report-actions">
          <button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={16}/> طباعة / PDF</button>
          <button className="secondary-button" type="button" disabled={total <= 0 || exporting} onClick={() => void exportCsv()}><Download size={16}/> {exporting ? 'جاري التصدير…' : `CSV (${number(total)})`}</button>
        </div>
      </div>

      <div className="sales-filter-grid">
        <label className="sales-filter"><span>القناة</span><select value={channel} onChange={(event) => changeChannel(event.target.value as SalesChannel)}>
          <option value="all">POS + Online</option><option value="pos">POS فقط</option><option value="online">Online فقط</option>
        </select></label>
        <label className="sales-filter"><span>الكاشير</span><select value={cashierId} disabled={channel === 'online'} onChange={(event) => setCashierId(event.target.value)}>
          <option value="">كل الكاشير</option>{cashierOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select></label>
        <label className="sales-filter"><span>وسيلة الدفع</span><select value={paymentCode} onChange={(event) => setPaymentCode(event.target.value)}>
          <option value="">كل وسائل الدفع</option>{paymentOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select></label>
        <form className="sales-search" onSubmit={submitSearch}><label><span>بحث</span><div><Search size={16}/><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="فاتورة، عميل، هاتف، كاشير…"/><button type="submit">بحث</button></div></label></form>
      </div>
      <div className="filter-summary"><span>{selectedBranch?.branch_name}</span><span>{periodLabel(period, customFrom, customTo)}</span><span>{channel === 'all' ? 'كل القنوات' : channel === 'pos' ? 'POS' : 'Online'}</span>{search && <span>بحث: {search}</span>}<button type="button" onClick={clearFilters}>مسح الفلاتر</button></div>
    </section>

    {error && <section className="engine-banner"><div><strong>تعذر تحميل تقرير المبيعات</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}

    <section className="finance-summary-grid">
      <SummaryCard label="صافي المبيعات" value={loading ? '…' : money(numeric(summary.net_sales))}/>
      <SummaryCard label="الفواتير والطلبات" value={loading ? '…' : number(numeric(summary.transactions))}/>
      <SummaryCard label="متوسط الفاتورة" value={loading ? '…' : money(numeric(summary.average_ticket))}/>
      <SummaryCard label="المرتجعات" value={loading ? '…' : money(numeric(summary.refunds))}/>
    </section>

    {data && <ReportVisuals reportKey="sales" data={data}/>} 

    <section className="section-card report-table-card sales-transactions-card">
      <div className="section-heading"><div><span className="eyebrow">Drill-down</span><h3>الفواتير والطلبات</h3></div><strong className="table-total">{number(total)} عملية</strong></div>
      {loading ? <div className="sales-loading"><div className="skeleton wide"/><div className="skeleton wide"/><div className="skeleton wide"/></div> : transactionRows.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>المرجع</th><th>القناة</th><th>المسؤول / العميل</th><th>الدفع</th><th>الإجمالي</th><th>الخصومات</th><th>المرتجعات</th><th>الصافي</th><th>الوقت</th></tr></thead><tbody>{transactionRows.map((row, index) => <tr key={`${text(row.channel)}-${text(row.id)}-${index}`}><td>{text(row.document_number)}</td><td><span className={`channel-badge channel-badge--${text(row.channel)}`}>{channelLabel(row.channel)}</span></td><td>{text(row.cashier_name ?? row.customer_name)}</td><td>{text(row.payment_name)}</td><td>{money(numeric(row.gross_amount))}</td><td>{money(numeric(row.product_discount) + numeric(row.loyalty_discount))}</td><td>{money(numeric(row.refunds))}</td><td><strong>{money(numeric(row.net_sale))}</strong></td><td>{dateTime(row.occurred_at)}</td></tr>)}</tbody></table></div> : <div className="empty-data"><span>—</span><p>لا توجد عمليات تطابق الفلاتر الحالية.</p></div>}

      <div className="sales-pagination"><span>صفحة {number(page)} من {number(pages)}</span><div><button type="button" className="secondary-button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}><ChevronRight size={16}/> السابق</button><button type="button" className="secondary-button" disabled={!hasMore || loading} onClick={() => setOffset(offset + limit)}>التالي <ChevronLeft size={16}/></button></div></div>
    </section>
  </div>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <article className="finance-summary"><span>{label}</span><strong>{value}</strong></article>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decimal(value: unknown) {
  return numeric(value).toFixed(2);
}

function text(value: unknown, fallback = '—'): string {
  return value == null || value === '' ? fallback : String(value);
}

function dateTime(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return text(value);
  return date.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
}

function channelLabel(value: unknown) {
  return String(value) === 'online' ? 'Online' : 'POS';
}

function mergeOptions(current: Option[], incoming: Option[]) {
  const map = new Map(current.map((option) => [option.value, option]));
  incoming.forEach((option) => map.set(option.value, option));
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'ar'));
}

function csvCell(value: unknown) {
  const string = String(value ?? '');
  return `"${string.replace(/"/g, '""')}"`;
}

function cairoToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function periodLabel(period: PeriodKey, from: string, to: string) {
  if (period === 'custom') return `${from} ← ${to}`;
  const labels: Record<PeriodKey, string> = { today: 'اليوم', yesterday: 'أمس', week: 'الأسبوع', month: 'الشهر', custom: 'مخصص' };
  return labels[period];
}
