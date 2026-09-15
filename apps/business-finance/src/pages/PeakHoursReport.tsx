import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Clock3, Download, Printer, RefreshCcw, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { number, money } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { TrendAreaChart } from '../components/ReportVisuals';
import { useBusiness } from '../context/BusinessContext';
import { type BusinessFilters, type PeriodKey } from '../services/businessFinance';
import { fetchPeakHoursReport, fetchStaffCoverageReport } from '../services/businessAnalytics';
import { makeCairoCustomRange } from '../services/salesReporting';
import type { ReportDocument } from '../services/reportingDetails';
import './sales-report.css';
import './business-analytics.css';

const weekdayLabels: Record<number, string> = { 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت', 7: 'الأحد' };

export default function PeakHoursReport() {
  const { selectedBranch } = useBusiness();
  const today = cairoToday();
  const [period, setPeriod] = useState<PeriodKey>('week');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [data, setData] = useState<ReportDocument | null>(null);
  const [coverage, setCoverage] = useState<ReportDocument | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
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
      if (period === 'custom') setError('اختر فترة مخصصة صحيحة.');
      return;
    }
    setLoading(true);
    setError(null);
    setCoverageError(null);
    const [peakResult, coverageResult] = await Promise.allSettled([
      fetchPeakHoursReport(filters),
      fetchStaffCoverageReport(filters),
    ]);
    if (peakResult.status === 'fulfilled') setData(peakResult.value);
    else {
      setData(null);
      setError(peakResult.reason instanceof Error ? peakResult.reason.message : 'تعذر تحميل ساعات الذروة.');
    }
    if (coverageResult.status === 'fulfilled') setCoverage(coverageResult.value);
    else {
      setCoverage(null);
      setCoverageError(coverageResult.reason instanceof Error ? coverageResult.reason.message : 'تعذر تحميل تغطية الموظفين.');
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [filters]);

  const summary = record(data?.summary);
  const hourly = rows(data?.hourly);
  const heatmap = rows(data?.weekday_hourly);
  const coverageSummary = record(coverage?.summary);
  const coverageHourly = rows(coverage?.hourly);
  const peakPos = record(summary.peak_pos);
  const peakOnline = record(summary.peak_online);
  const peakCombined = record(summary.peak_combined);
  const maxHeat = Math.max(1, ...heatmap.map((row) => num(row.combined_activity)));
  const workloadWithStaff = hourly.map((row) => {
    const hour = num(row.hour);
    const staffing = coverageHourly.find((item) => num(item.hour) === hour) || {};
    const avgStaff = num(staffing.avg_staff);
    const combined = num(row.combined_activity);
    return {
      ...row,
      avg_staff: avgStaff,
      max_staff: num(staffing.max_staff),
      activity_per_staff: avgStaff > 0 ? combined / avgStaff : null,
    };
  });
  const pressureHours = workloadWithStaff.filter((row) => nullable(row.activity_per_staff) != null).sort((a, b) => num(b.activity_per_staff) - num(a.activity_per_staff));
  const highestPressure = pressureHours[0] || null;

  function exportCsv() {
    if (!hourly.length) return;
    const lines = [
      ['الساعة', 'فواتير الفرع', 'مبيعات الفرع', 'طلبات الأونلاين', 'طلبات مسلمة', 'قيمة طلبات الأونلاين', 'إجمالي النشاط', 'متوسط الموظفين الموجودين', 'أقصى موظفين موجودين', 'نشاط لكل موظف'],
      ...workloadWithStaff.map((row) => [hourLabel(row.hour), num(row.pos_transactions), num(row.pos_sales), num(row.online_orders), num(row.online_delivered_orders), num(row.online_order_value), num(row.combined_activity), coverage ? num(row.avg_staff) : '', coverage ? num(row.max_staff) : '', nullable(row.activity_per_staff) ?? '']),
    ];
    const csv = lines.map((line) => line.map(csvCell).join(',')).join('\n');
    download(`elmadawy-peak-hours-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${csv}`);
  }

  return <div className="stack-lg sales-report-page">
    <section className="report-detail-head sales-report-head">
      <div className="report-detail-head__title"><Link to="/reports" className="back-button" aria-label="العودة للتقارير"><ArrowRight size={19}/></Link><span className="report-card__icon"><Clock3 size={22}/></span><div><span className="eyebrow">Workload Analytics · Cairo Time</span><h2>ساعات العمل والذروة</h2><p>مقارنة مباشرة بين نشاط الفرع وطلبات الأونلاين ساعة بساعة، ومع صلاحية الحضور نضيف تغطية الموظفين الفعلية.</p></div></div>
      <div className="sales-period-control"><PeriodSwitcher period={period} onChange={setPeriod}/><button type="button" className={period === 'custom' ? 'custom-period-button active' : 'custom-period-button'} onClick={() => setPeriod('custom')}><CalendarDays size={16}/> مخصص</button></div>
    </section>

    {period === 'custom' && <section className="section-card custom-date-panel"><div><span className="eyebrow">Custom Range</span><h3>فترة مخصصة</h3><p>كل الساعات محسوبة بتوقيت القاهرة، ويشمل تاريخ النهاية كاملًا.</p></div><div className="custom-date-inputs"><label><span>من</span><input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)}/></label><label><span>إلى</span><input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)}/></label></div></section>}

    <section className="section-card financial-report-actions"><div><span className="eyebrow">Peak Planning</span><strong>{selectedBranch?.branch_name || 'الفرع'} · POS مقابل Online مقابل Staff Coverage</strong></div><div className="report-actions"><button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={16}/> طباعة / PDF</button><button className="secondary-button" type="button" disabled={!hourly.length} onClick={exportCsv}><Download size={16}/> CSV</button></div></section>

    {error && <section className="engine-banner"><div><strong>تعذر تحميل التحليل</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}
    {coverageError && <section className="engine-banner engine-banner--soft"><div><strong>تغطية الموظفين غير متاحة</strong><p>{coverageError} — يظل تحليل ضغط الفرع والأونلاين متاحًا بشكل مستقل.</p></div></section>}

    <section className="finance-summary-grid">
      {loading ? [1,2,3,4].map((item) => <article className="finance-summary" key={item}><span>جاري التحميل</span><div className="skeleton wide"/></article>) : <>
        <Summary label="ذروة الفرع" value={peakLabel(peakPos)} hint={`${number(num(peakPos.pos_transactions))} فاتورة في الساعة`}/>
        <Summary label="ذروة الأونلاين" value={peakLabel(peakOnline)} hint={`${number(num(peakOnline.online_orders))} طلب في الساعة`}/>
        <Summary label="أعلى ضغط مشترك" value={peakLabel(peakCombined)} hint={`${number(num(peakCombined.combined_activity))} عملية/طلب`}/>
        <Summary label="إجمالي النشاط" value={number(num(summary.combined_activity))} hint={`${number(num(summary.pos_transactions))} فرع + ${number(num(summary.online_orders))} أونلاين`}/>
      </>}
    </section>

    {coverage && <section className="finance-summary-grid">
      <Summary label="إجمالي ساعات التواجد" value={`${number(num(coverageSummary.staff_hours))} س`} hint={`${number(num(coverageSummary.employees))} موظف ظهر في سجلات الحضور`}/>
      <Summary label="أعلى ضغط لكل موظف" value={highestPressure ? hourLabel(highestPressure.hour) : '—'} hint={highestPressure ? `${number(num(highestPressure.activity_per_staff))} عملية/طلب لكل موظف متواجد في المتوسط` : 'لا توجد بيانات مشتركة كافية'}/>
      <Summary label="جلسات حضور مكتملة" value={number(num(coverageSummary.closed_sessions))} hint="جلسات لها تسجيل دخول وخروج"/>
      <Summary label="جلسات مفتوحة الآن" value={number(num(coverageSummary.active_sessions))} hint="تحسب حتى الوقت الحالي فقط"/>
    </section>}

    {data && <section className="report-visual-grid">
      <TrendAreaChart eyebrow="Hourly Workload" title="عدد العمليات حسب الساعة" points={hourly.map((row) => ({ label: hourLabel(row.hour), value: num(row.pos_transactions), secondary: num(row.online_orders) }))} valueLabel="فواتير الفرع" secondaryLabel="طلبات الأونلاين" formatValue={(value) => number(value)}/>
      <TrendAreaChart eyebrow="Hourly Value" title="القيمة حسب الساعة" points={hourly.map((row) => ({ label: hourLabel(row.hour), value: num(row.pos_sales), secondary: num(row.online_order_value) }))} valueLabel="مبيعات الفرع" secondaryLabel="قيمة طلبات الأونلاين" formatValue={money}/>
      {coverage && <TrendAreaChart eyebrow="Staff Coverage" title="متوسط الموظفين الموجودين حسب الساعة" points={coverageHourly.map((row) => ({ label: hourLabel(row.hour), value: num(row.avg_staff), secondary: num(row.max_staff) }))} valueLabel="متوسط التواجد" secondaryLabel="أقصى تواجد" formatValue={(value) => number(value)}/>} 
      {coverage && <TrendAreaChart eyebrow="Demand / Coverage" title="ضغط النشاط لكل موظف متواجد" points={workloadWithStaff.map((row) => ({ label: hourLabel(row.hour), value: nullable(row.activity_per_staff) ?? 0 }))} valueLabel="عملية/طلب لكل موظف" formatValue={(value) => number(value)}/>} 
    </section>}

    <section className="section-card">
      <div className="section-heading"><div><span className="eyebrow">7 × 24 Heatmap</span><h3>خريطة الضغط حسب اليوم والساعة</h3><p className="muted">كلما زادت شدة الخانة زاد إجمالي فواتير الفرع + طلبات الأونلاين في هذه الساعة.</p></div><Clock3 size={20}/></div>
      {heatmap.length ? <div className="peak-heatmap-wrap"><div className="peak-heatmap">
        <div className="peak-heatmap__corner">اليوم</div>{Array.from({ length: 24 }, (_, hour) => <div className="peak-heatmap__hour" key={hour}>{String(hour).padStart(2, '0')}</div>)}
        {[1,2,3,4,5,6,7].flatMap((dow) => {
          const dayRows = heatmap.filter((row) => num(row.iso_dow) === dow);
          return [<div className="peak-heatmap__day" key={`d-${dow}`}>{weekdayLabels[dow]}</div>, ...Array.from({ length: 24 }, (_, hour) => {
            const row = dayRows.find((item) => num(item.hour) === hour) || {};
            const value = num(row.combined_activity);
            return <div className="peak-heatmap__cell" key={`${dow}-${hour}`} style={{ '--heat': Math.max(.06, value / maxHeat) } as React.CSSProperties} title={`${weekdayLabels[dow]} ${hourLabel(hour)} · فرع ${number(num(row.pos_transactions))} · أونلاين ${number(num(row.online_orders))}`}><span>{value ? number(value) : ''}</span></div>;
          })];
        })}
      </div></div> : <Empty text="لا توجد حركة كافية لبناء خريطة الذروة في الفترة المحددة."/>}
    </section>

    <section className="section-card analytics-guidance"><div><span className="eyebrow">Staffing Signal</span><h3>كيف تقرأ التقرير؟</h3></div><p>ذروة الفرع مبنية على وقت إصدار فواتير POS، وذروة الأونلاين على وقت وصول الطلب. تغطية الموظفين — عند السماح بها — مبنية على تقاطع جلسات الحضور الفعلية مع كل ساعة، بدون عرض هوية الموظف. مؤشر «النشاط لكل موظف» إشارة ضغط للمقارنة بين الساعات وليس معيار إنتاجية فردي.</p><div className="analytics-guidance__icon"><UsersRound size={20}/></div></section>
  </div>;
}

function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) { return <article className="finance-summary"><span>{label}</span><strong>{value}</strong>{hint && <small className="muted">{hint}</small>}</article>; }
function Empty({ text }: { text: string }) { return <div className="empty-data"><span>—</span><p>{text}</p></div>; }
function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function num(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function nullable(value: unknown): number | null { if (value == null || value === '') return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function hourLabel(value: unknown): string { const hour = Math.min(23, Math.max(0, Math.trunc(num(value)))); return `${String(hour).padStart(2, '0')}:00`; }
function peakLabel(value: Record<string, unknown>): string { return Object.keys(value).length ? hourLabel(value.hour) : '—'; }
function csvCell(value: unknown): string { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function download(filename: string, content: string) { const blob = new Blob([content], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }
function cairoToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
