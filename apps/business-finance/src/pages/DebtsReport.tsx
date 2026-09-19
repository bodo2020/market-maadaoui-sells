import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeDollarSign, Download, Printer, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { money } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { RankedBarChart } from '../components/ReportVisuals';
import { useBusiness } from '../context/BusinessContext';
import { type BusinessFilters, type PeriodKey } from '../services/businessFinance';
import { fetchDebtReport } from '../services/businessOperations';
import type { ReportDocument } from '../services/reportingDetails';
import './operations-admin.css';

export default function DebtsReport() {
  const { selectedBranch } = useBusiness();
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [data, setData] = useState<ReportDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo<BusinessFilters | null>(() => selectedBranch ? { branchId: selectedBranch.branch_id, period } : null, [selectedBranch, period]);
  async function load() {
    if (!filters) return;
    setLoading(true); setError(null);
    try { setData(await fetchDebtReport(filters)); }
    catch (cause) { setData(null); setError(cause instanceof Error ? cause.message : 'تعذر تحميل تقرير المديونيات.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [filters]);

  const summary = record(data?.summary);
  const movement = record(data?.period_movement);
  const customers = rows(data?.customers);
  const employees = rows(data?.employees);
  const suppliers = rows(data?.suppliers);

  function exportCsv() {
    const lines: Array<Array<string | number>> = [
      ['تقرير مديونيات المعداوي'],
      ['الفرع', selectedBranch?.branch_name || '—'],
      ['مديونيات العملاء الحالية', num(summary.customer_receivables)],
      ['مديونيات الموظفين الحالية', num(summary.employee_receivables)],
      ['مستحقات الموردين الحالية', num(summary.supplier_payables)],
      ['حركة العملاء خلال الفترة', num(movement.customer_receivables)],
      ['حركة الموظفين خلال الفترة', num(movement.employee_receivables)],
      ['حركة الموردين خلال الفترة', num(movement.supplier_payables)],
      [],
      ['النوع','الاسم','الرصيد'],
      ...customers.map((row) => ['عميل', text(row.name), num(row.balance)]),
      ...employees.map((row) => ['موظف', text(row.name), num(row.balance)]),
      ...suppliers.map((row) => ['مورد', text(row.name), num(row.balance)]),
    ];
    const csv = lines.map((line) => line.map(csvCell).join(',')).join('\n');
    download(`elmadawy-debts-${new Date().toISOString().slice(0,10)}.csv`, `\uFEFF${csv}`);
  }

  return <div className="stack-lg ops-page">
    <section className="ops-head"><div className="ops-head__title"><Link to="/reports" className="back-button"><ArrowRight size={19}/></Link><span className="report-card__icon"><BadgeDollarSign size={21}/></span><div><span className="eyebrow">Debt Analytics</span><h2>تقرير المديونيات</h2><p>الأرصدة الحالية منفصلة عن حركة الفترة حتى لا يتحول Snapshot حالي إلى مقياس زمني مضلل.</p></div></div><PeriodSwitcher period={period} onChange={setPeriod}/></section>

    <section className="section-card financial-report-actions"><div><span className="eyebrow">Exports</span><strong>{selectedBranch?.branch_name || 'الفرع'}</strong></div><div className="report-actions"><button className="secondary-button" onClick={() => window.print()}><Printer size={16}/> طباعة / PDF</button><button className="secondary-button" disabled={!data} onClick={exportCsv}><Download size={16}/> CSV</button></div></section>
    {error && <section className="engine-banner"><div><strong>تعذر تحميل التقرير</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={16}/> إعادة المحاولة</button></section>}

    <section className="ops-action-grid">
      <article className="ops-action-card"><span>مديونيات العملاء الحالية</span><strong>{loading ? '…' : money(num(summary.customer_receivables))}</strong></article>
      <article className="ops-action-card"><span>مديونيات الموظفين الحالية</span><strong>{loading ? '…' : money(num(summary.employee_receivables))}</strong></article>
      <article className="ops-action-card"><span>إجمالي مستحقات الشركة</span><strong>{loading ? '…' : money(num(summary.total_receivables))}</strong></article>
      <article className="ops-action-card"><span>مستحقات الموردين الحالية</span><strong>{loading ? '…' : money(num(summary.supplier_payables))}</strong></article>
    </section>

    <section className="report-movement-grid">
      <article className="ops-action-card"><span>صافي حركة ديون العملاء في الفترة</span><strong className={num(movement.customer_receivables) >= 0 ? 'negative-text' : 'positive-text'}>{money(num(movement.customer_receivables))}</strong></article>
      <article className="ops-action-card"><span>صافي حركة ديون الموظفين في الفترة</span><strong className={num(movement.employee_receivables) >= 0 ? 'negative-text' : 'positive-text'}>{money(num(movement.employee_receivables))}</strong></article>
      <article className="ops-action-card"><span>صافي حركة التزامات الموردين</span><strong>{money(num(movement.supplier_payables))}</strong></article>
    </section>

    {data && <section className="report-visual-grid">
      <RankedBarChart eyebrow="Customer Receivables" title="أعلى مديونيات العملاء" items={customers.slice(0,10).map((row) => ({ label:text(row.name), value:num(row.balance) }))} formatValue={money}/>
      <RankedBarChart eyebrow="Employee Receivables" title="أعلى مديونيات الموظفين" items={employees.slice(0,10).map((row) => ({ label:text(row.name), value:num(row.balance) }))} formatValue={money}/>
      <RankedBarChart eyebrow="Supplier Payables" title="أعلى مستحقات الموردين" items={suppliers.filter((row)=>num(row.balance)>0).slice(0,10).map((row) => ({ label:text(row.name), value:num(row.balance) }))} formatValue={money}/>
    </section>}

    <p className="data-scope-note">الرصيد الحالي نقطة زمنية لحظة فتح التقرير. حركة الفترة محسوبة من القيود التي حدثت داخل الفترة المختارة، لذلك لا يتم طرح أحدهما من الآخر كأنهما نفس النوع من المقاييس.</p>
  </div>;
}

function rows(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function num(value: unknown) { const parsed=Number(value??0); return Number.isFinite(parsed)?parsed:0; }
function text(value: unknown, fallback='—') { return value==null||value===''?fallback:String(value); }
function csvCell(value: unknown){const valueText=String(value??'');return /[",\n]/.test(valueText)?`"${valueText.replace(/"/g,'""')}"`:valueText;}
function download(filename:string,content:string){const blob=new Blob([content],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);}
