import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Download, Printer, Receipt, RefreshCcw, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, number } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { DonutChart, RankedBarChart } from '../components/ReportVisuals';
import { useBusiness } from '../context/BusinessContext';
import { type BusinessFilters, type PeriodKey } from '../services/businessFinance';
import { fetchWorkforceCostsReport, type WorkforceCostsBundle } from '../services/businessAnalytics';
import { makeCairoCustomRange } from '../services/salesReporting';
import './sales-report.css';
import './business-analytics.css';

export default function WorkforceCostsReport() {
  const { selectedBranch } = useBusiness();
  const now = cairoParts();
  const today = `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [payrollMonth, setPayrollMonth] = useState(now.month);
  const [payrollYear, setPayrollYear] = useState(now.year);
  const [data, setData] = useState<WorkforceCostsBundle | null>(null);
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
    if (!filters) { if (period === 'custom') setError('اختر فترة مصروفات صحيحة.'); return; }
    setLoading(true); setError(null);
    try { setData(await fetchWorkforceCostsReport(filters, payrollMonth, payrollYear)); }
    catch (cause) { setData(null); setError(cause instanceof Error ? cause.message : 'تعذر تحميل المرتبات والمصروفات.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [filters, payrollMonth, payrollYear]);

  const costs = data?.costs || {};
  const costSummary = record(costs.summary);
  const costPermissions = record(costs.permissions);
  const canViewCosts = Boolean(costPermissions.can_view_costs);
  const payroll = data?.payroll || null;
  const run = record(payroll?.run);
  const payrollItems = rows(payroll?.items);
  const expenseTypes = rows(costs.expense_types);
  const expenses = rows(costs.expenses);
  const overviewCurrent = record(data?.overview?.current);
  const payrollNet = nullable(run.total_net);
  const expenseAmount = nullable(costSummary.active_expense_amount);
  const netSales = nullable(overviewCurrent.net_sales);
  const payrollComparisonMatches = isComparablePayrollSalesPeriod(period, customFrom, customTo, payrollMonth, payrollYear, now);
  const payrollRatio = payrollComparisonMatches && payrollNet != null && netSales != null && netSales !== 0 ? payrollNet / Math.abs(netSales) * 100 : null;
  const expenseRatio = expenseAmount != null && netSales != null && netSales !== 0 ? expenseAmount / Math.abs(netSales) * 100 : null;

  function exportCsv() {
    const blocks: Array<Array<Array<string | number>>> = [];
    if (payrollItems.length) blocks.push([
      ['المرتبات'],
      ['الموظف', 'الأساسي', 'أيام الحضور', 'ساعات العمل', 'إضافي', 'إجمالي الخصومات', 'الإجمالي', 'الصافي'],
      ...payrollItems.map((row) => [text(row.employee_name), num(row.base_salary), num(row.attended_days), round2(num(row.worked_minutes) / 60), num(row.overtime_amount), num(row.total_deductions), num(row.gross_amount), num(row.net_amount)]),
    ]);
    if (expenses.length) blocks.push([
      ['المصروفات'],
      ['الوقت', 'النوع', 'الوصف', 'القيمة', 'وسيلة الدفع'],
      ...expenses.map((row) => [dateTime(row.date), text(row.type), text(row.description), num(row.amount), text(row.payment_method)]),
    ]);
    if (!blocks.length) return;
    const csv = blocks.flatMap((block) => [...block, []]).map((line) => line.map(csvCell).join(',')).join('\n');
    download(`elmadawy-payroll-expenses-${payrollYear}-${String(payrollMonth).padStart(2, '0')}.csv`, `\uFEFF${csv}`);
  }

  return <div className="stack-lg sales-report-page">
    <section className="report-detail-head sales-report-head">
      <div className="report-detail-head__title"><Link to="/reports" className="back-button" aria-label="العودة للتقارير"><ArrowRight size={19}/></Link><span className="report-card__icon"><UsersRound size={22}/></span><div><span className="eyebrow">People Cost & Operating Expenses</span><h2>المرتبات والمصروفات</h2><p>تكلفة العمالة من Payroll V2 مع المصروفات التشغيلية الفعلية ونسبتها إلى صافي المبيعات.</p></div></div>
      <div className="sales-period-control"><PeriodSwitcher period={period} onChange={setPeriod}/><button type="button" className={period === 'custom' ? 'custom-period-button active' : 'custom-period-button'} onClick={() => setPeriod('custom')}><CalendarDays size={16}/> مخصص</button></div>
    </section>

    <section className="section-card payroll-period-panel">
      <div><span className="eyebrow">Payroll Cycle</span><h3>دورة المرتبات</h3><p>المرتبات شهرية، بينما فلتر الفترة بالأعلى يتحكم في المصروفات والمبيعات المستخدمة للمقارنة. نسبة العمالة للمبيعات لا تظهر إلا عندما تتطابق الفترتان.</p></div>
      <div className="payroll-period-fields"><label><span>الشهر</span><select value={payrollMonth} onChange={(event) => setPayrollMonth(Number(event.target.value))}>{months.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label><label><span>السنة</span><input type="number" min="2020" max="2200" value={payrollYear} onChange={(event) => setPayrollYear(Number(event.target.value))}/></label></div>
    </section>

    {period === 'custom' && <section className="section-card custom-date-panel"><div><span className="eyebrow">Expenses Range</span><h3>فترة المصروفات</h3><p>تؤثر على المصروفات وصافي المبيعات المقارن، ولا تغيّر دورة المرتب الشهرية.</p></div><div className="custom-date-inputs"><label><span>من</span><input type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)}/></label><label><span>إلى</span><input type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)}/></label></div></section>}

    <section className="section-card financial-report-actions"><div><span className="eyebrow">Cost Control</span><strong>{selectedBranch?.branch_name || 'الفرع'} · {months[payrollMonth - 1]} {payrollYear}</strong></div><div className="report-actions"><button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={16}/> طباعة / PDF</button><button className="secondary-button" type="button" disabled={!payrollItems.length && !expenses.length} onClick={exportCsv}><Download size={16}/> CSV</button></div></section>

    {error && <section className="engine-banner"><div><strong>تعذر تحميل التكاليف</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}
    {data?.payrollError && <section className="engine-banner engine-banner--soft"><div><strong>تفاصيل المرتبات محجوبة</strong><p>{data.payrollError}</p></div></section>}

    <section className="finance-summary-grid">{loading ? [1,2,3,4].map((item) => <article className="finance-summary" key={item}><span>جاري التحميل</span><div className="skeleton wide"/></article>) : <>
      <Summary label="صافي دورة المرتبات" value={payrollNet == null ? '—' : money(payrollNet)} hint={Object.keys(run).length ? `الحالة: ${payrollStatus(run.status)}` : 'لم تُنشأ دورة لهذا الشهر'}/>
      <Summary label="المصروفات التشغيلية" value={canViewCosts ? money(expenseAmount) : 'محجوب'} hint={canViewCosts && expenseRatio != null ? `${number(expenseRatio)}% من صافي المبيعات` : undefined}/>
      <Summary label="إجمالي الخصومات" value={payrollNet == null ? '—' : money(nullable(run.total_deductions))} hint="خصومات دورة Payroll V2"/>
      <Summary label="تكلفة العمالة / المبيعات" value={payrollRatio == null ? '—' : `${number(payrollRatio)}%`} hint={!payrollComparisonMatches ? 'اختر نفس شهر دورة المرتب في فترة المبيعات للمقارنة العادلة' : netSales == null ? 'صافي المبيعات غير متاح للمقارنة' : `صافي المبيعات ${money(netSales)}`}/>
    </>}</section>

    {payrollItems.length > 0 && <section className="report-visual-grid">
      <RankedBarChart eyebrow="Payroll Cost" title="صافي المرتب حسب الموظف" items={payrollItems.map((row) => ({ label: text(row.employee_name), value: num(row.net_amount) }))}/>
      <DonutChart eyebrow="Operating Expenses" title="توزيع المصروفات حسب النوع" segments={expenseTypes.map((row) => ({ label: text(row.type, 'غير مصنف'), value: num(row.amount) }))}/>
    </section>}

    <section className="section-card report-table-card">
      <div className="section-heading"><div><span className="eyebrow">Payroll V2</span><h3>تفاصيل مرتبات الموظفين</h3></div><UsersRound size={20}/></div>
      {payrollItems.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>الموظف</th><th>الأساسي</th><th>الحضور</th><th>ساعات العمل</th><th>الإضافي</th><th>الغياب/التأخير</th><th>السلف</th><th>إجمالي الخصومات</th><th>الصافي</th></tr></thead><tbody>{payrollItems.map((row) => <tr key={text(row.id)}><td><strong>{text(row.employee_name)}</strong><small className="table-subtext">{text(row.employee_code)}</small></td><td>{money(num(row.base_salary))}</td><td>{number(num(row.attended_days))} يوم</td><td>{hours(num(row.worked_minutes))}</td><td>{money(num(row.overtime_amount))}</td><td>{money(num(row.absence_deduction) + num(row.late_deduction) + num(row.early_deduction) + num(row.unpaid_leave_deduction))}</td><td>{money(num(row.advance_deduction))}</td><td>{money(num(row.total_deductions))}</td><td><strong>{money(num(row.net_amount))}</strong></td></tr>)}</tbody></table></div> : <Empty text={data?.payrollError || 'لم يتم إنشاء دورة مرتبات لهذا الشهر بعد.'}/>} 
    </section>

    <section className="section-card report-table-card">
      <div className="section-heading"><div><span className="eyebrow">Expenses Ledger</span><h3>المصروفات التشغيلية</h3></div><Receipt size={20}/></div>
      {expenses.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>الوقت</th><th>النوع</th><th>الوصف</th><th>القيمة</th><th>الدفع</th></tr></thead><tbody>{expenses.map((row) => <tr key={text(row.expense_id)}><td>{dateTime(row.date)}</td><td>{text(row.type, 'غير مصنف')}</td><td>{text(row.description)}</td><td>{canViewCosts ? money(nullable(row.amount)) : 'محجوب'}</td><td>{text(row.payment_method)}</td></tr>)}</tbody></table></div> : <Empty text="لا توجد مصروفات مسجلة في الفترة المحددة."/>}
    </section>
  </div>;
}

const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) { return <article className="finance-summary"><span>{label}</span><strong>{value}</strong>{hint && <small className="muted">{hint}</small>}</article>; }
function Empty({ text }: { text: string }) { return <div className="empty-data"><span>—</span><p>{text}</p></div>; }
function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function num(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function nullable(value: unknown): number | null { if (value == null || value === '') return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function text(value: unknown, fallback = '—'): string { return value == null || value === '' ? fallback : String(value); }
function round2(value: number) { return Math.round(value * 100) / 100; }
function hours(minutes: number) { const total = Math.max(0, Math.round(minutes)); const h = Math.floor(total / 60); const m = total % 60; return `${number(h)}س ${number(m)}د`; }
function payrollStatus(value: unknown) { const map: Record<string,string> = { draft:'مسودة', hr_review:'مراجعة HR', finance_review:'مراجعة مالية', locked:'معتمدة', paid:'مدفوعة', cancelled:'ملغاة' }; return map[String(value || '')] || text(value); }
function dateTime(value: unknown) { if (!value) return '—'; return new Date(String(value)).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }); }
function csvCell(value: unknown): string { const valueText = String(value ?? ''); return /[",\n]/.test(valueText) ? `"${valueText.replace(/"/g, '""')}"` : valueText; }
function download(filename: string, content: string) { const blob = new Blob([content], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }
function cairoParts() { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value])); return { year:Number(parts.year), month:Number(parts.month), day:Number(parts.day) }; }
function isComparablePayrollSalesPeriod(period: PeriodKey, customFrom: string, customTo: string, payrollMonth: number, payrollYear: number, now: { year: number; month: number; day: number }) {
  if (period === 'month') return payrollMonth === now.month && payrollYear === now.year;
  if (period !== 'custom') return false;
  const first = `${payrollYear}-${String(payrollMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(payrollYear, payrollMonth, 0)).getUTCDate();
  const last = `${payrollYear}-${String(payrollMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return customFrom === first && customTo === last;
}
