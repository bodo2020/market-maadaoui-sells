import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, ArrowRight, BarChart3, Boxes, CircleDollarSign, FileText, Lightbulb, PackageSearch, Receipt, RefreshCcw, RotateCcw, ShoppingCart, Truck, Users, WalletCards } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { money, number } from '../components/MetricCard';
import PeriodSwitcher from '../components/PeriodSwitcher';
import { useBusiness } from '../context/BusinessContext';
import { type BusinessFilters, type PeriodKey } from '../services/businessFinance';
import { fetchDetailedReport, isReportKey, type ReportDocument, type ReportKey } from '../services/reportingDetails';
import { reports } from './Reports';

type Metric = { label: string; value: string; hint?: string };
type Table = { eyebrow: string; title: string; columns: string[]; rows: string[][]; empty: string };
type Presentation = { metrics: Metric[]; tables: Table[]; note?: string };

const icons: Record<ReportKey, LucideIcon> = {
  sales: ShoppingCart,
  profitability: CircleDollarSign,
  products: PackageSearch,
  inventory: Boxes,
  payments: WalletCards,
  returns: RotateCcw,
  cashiers: Users,
  branches: BarChart3,
  online: Truck,
  customers: Users,
  costs: Receipt,
  insights: Lightbulb,
  transfers: ArrowLeftRight,
};

export default function ReportDetail() {
  const { reportKey } = useParams();
  const { selectedBranch, branches } = useBusiness();
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [data, setData] = useState<ReportDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const validKey = isReportKey(reportKey) ? reportKey : null;
  const filters = useMemo<BusinessFilters | null>(() => selectedBranch ? { branchId: selectedBranch.branch_id, period } : null, [period, selectedBranch]);

  async function load() {
    if (!validKey || !filters) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDetailedReport(validKey, filters, branches));
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل التقرير.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [validKey, filters, branches]);
  if (!validKey) return <Navigate to="/reports" replace/>;

  const meta = reports.find((report) => report.key === validKey)!;
  const Icon = icons[validKey];
  const presentation = data ? present(validKey, data) : null;

  return <div className="stack-lg">
    <section className="report-detail-head">
      <div className="report-detail-head__title"><Link to="/reports" className="back-button" aria-label="العودة للتقارير"><ArrowRight size={19}/></Link><span className="report-card__icon"><Icon size={22}/></span><div><span className="eyebrow">Reporting V2</span><h2>{meta.title}</h2><p>{meta.desc}</p></div></div>
      <PeriodSwitcher period={period} onChange={setPeriod}/>
    </section>

    {error && <section className="engine-banner"><div><strong>تعذر تحميل التقرير</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}

    <section className="finance-summary-grid">{loading
      ? [1, 2, 3, 4].map((item) => <article className="finance-summary" key={item}><span>جاري التحميل</span><div className="skeleton wide"/></article>)
      : presentation?.metrics.map((metric) => <article className="finance-summary" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.hint && <small className="muted">{metric.hint}</small>}</article>)}</section>

    {presentation?.note && <p className="data-scope-note">{presentation.note}</p>}

    {presentation?.tables.map((reportTable) => <section className="section-card report-table-card" key={`${reportTable.eyebrow}-${reportTable.title}`}>
      <div className="section-heading"><div><span className="eyebrow">{reportTable.eyebrow}</span><h3>{reportTable.title}</h3></div><FileText size={20}/></div>
      {reportTable.rows.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr>{reportTable.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{reportTable.rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}</tr>)}</tbody></table></div> : <div className="empty-data"><span>—</span><p>{reportTable.empty}</p></div>}
    </section>)}
  </div>;
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(asRecord) : [];
const n = (value: unknown): number => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; };
const nullable = (value: unknown): number | null => value == null || value === '' ? null : n(value);
const s = (value: unknown, fallback = '—'): string => value == null || value === '' ? fallback : String(value);
const date = (value: unknown): string => value ? new Date(String(value)).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const percent = (value: unknown): string => `${number(n(value))}%`;

function present(key: ReportKey, data: ReportDocument): Presentation {
  const summary = asRecord(data.summary);
  if (key === 'sales') return salesPresentation(data, summary);
  if (key === 'profitability') return profitabilityPresentation(data, summary);
  if (key === 'products') return productsPresentation(data, summary);
  if (key === 'inventory') return inventoryPresentation(data, summary);
  if (key === 'payments') return paymentsPresentation(data, summary);
  if (key === 'returns') return returnsPresentation(data, summary);
  if (key === 'cashiers') return cashiersPresentation(data, summary);
  if (key === 'branches') return branchesPresentation(data);
  if (key === 'online') return onlinePresentation(data, summary);
  if (key === 'customers') return customersPresentation(data, summary);
  if (key === 'costs') return costsPresentation(data, summary);
  if (key === 'transfers') return transfersPresentation(data, summary);
  return insightsPresentation(data, summary);
}

function salesPresentation(data: ReportDocument, summary: Record<string, unknown>): Presentation {
  return {
    metrics: [metric('صافي المبيعات', money(n(summary.net_sales))), metric('الفواتير والطلبات', number(n(summary.transactions))), metric('متوسط الفاتورة', money(n(summary.average_ticket))), metric('المرتجعات', money(n(summary.refunds)))],
    tables: [
      table('آخر العمليات', 'الفواتير والطلبات', ['المرجع', 'القناة', 'المسؤول / العميل', 'وسيلة الدفع', 'الصافي', 'الوقت'], rows(data.rows).map((row) => [s(row.document_number), channel(row.channel), s(row.cashier_name ?? row.customer_name), s(row.payment_name), money(n(row.net_sale)), date(row.occurred_at)]), 'لا توجد فواتير أو طلبات في الفترة.'),
      table('تحليل التشغيل', 'أداء الكاشير', ['الكاشير', 'الفواتير', 'صافي المبيعات', 'متوسط الفاتورة'], rows(data.cashiers).map((row) => [s(row.cashier_name, 'كاشير'), number(n(row.transactions)), money(n(row.net_sales)), money(n(row.average_ticket))]), 'لا يوجد نشاط كاشير في الفترة.'),
    ],
  };
}

function profitabilityPresentation(data: ReportDocument, summary: Record<string, unknown>): Presentation {
  return {
    metrics: [metric('صافي مبيعات POS', money(n(summary.pos_net_sales))), metric('إجمالي ربح POS', money(nullable(summary.pos_gross_profit))), metric('رسوم الدفع', money(n(summary.merchant_payment_fees))), metric('النتيجة التشغيلية المعروفة', money(nullable(summary.known_operating_result)))],
    note: !Boolean(data.online_profit_complete) ? 'الربحية المعروضة تخص POS؛ تكلفة وربح الأونلاين غير مكتملين في مصدر البيانات الحالي.' : undefined,
    tables: [
      table('Profit Waterfall', 'تكوين الربح', ['البند', 'القيمة'], rows(data.waterfall).map((row) => [s(row.label ?? row.key), money(n(row.value))]), 'لا توجد مكونات ربح داخل الفترة.'),
      table('الاتجاه اليومي', 'الربحية حسب اليوم', ['اليوم', 'صافي المبيعات', 'التكلفة', 'إجمالي الربح', 'النتيجة المعروفة'], rows(data.daily).map((row) => [s(row.date), money(n(row.net_sales)), money(n(row.net_cogs)), money(n(row.gross_profit)), money(n(row.known_operating_result))]), 'لا توجد حركة يومية داخل الفترة.'),
    ],
  };
}

function productsPresentation(data: ReportDocument, summary: Record<string, unknown>): Presentation {
  const canProfit = Boolean(asRecord(data.permissions).can_view_profit);
  return {
    metrics: [metric('المنتجات المباعة', number(n(summary.products_sold))), metric('صافي الإيراد', money(n(summary.net_revenue))), metric('صافي الربح', canProfit ? money(nullable(summary.net_profit)) : 'محجوب'), metric('هامش الربح', canProfit && nullable(summary.margin_percent) != null ? percent(summary.margin_percent) : '—')],
    tables: [
      table('الأداء', 'المنتجات', ['المنتج', 'القسم', 'الفواتير', 'صافي الكمية', 'صافي الإيراد', 'الربح'], rows(data.products).map((row) => [s(row.product_name), s(row.category_name), number(n(row.invoices)), number(n(row.net_measure)), money(n(row.net_revenue)), canProfit ? money(nullable(row.net_profit)) : 'محجوب']), 'لا توجد مبيعات منتجات داخل الفترة.'),
      table('الأقسام', 'مساهمة الأقسام', ['القسم', 'المنتجات', 'صافي الإيراد', 'المساهمة', 'الهامش'], rows(data.categories).map((row) => [s(row.category_name), number(n(row.products)), money(n(row.net_revenue)), percent(row.contribution_percent), canProfit && nullable(row.margin_percent) != null ? percent(row.margin_percent) : '—']), 'لا توجد بيانات أقسام داخل الفترة.'),
    ],
  };
}

function inventoryPresentation(data: ReportDocument, summary: Record<string, unknown>): Presentation {
  return {
    metrics: [metric('قيمة الشراء الحالية', money(n(summary.purchase_value))), metric('قيمة البيع المتوقعة', money(n(summary.retail_value))), metric('منخفض المخزون', number(n(summary.low_stock_rows))), metric('نافد المخزون', number(n(summary.out_of_stock_rows)))],
    note: !Boolean(summary.stock_turnover_available) ? s(summary.stock_turnover_note, 'معدل دوران المخزون غير مكتمل في المصدر الحالي.') : undefined,
    tables: [
      table('تنبيهات المخزون', 'منخفض ونافد المخزون', ['المنتج', 'القسم', 'الكمية', 'الحد'], [...rows(data.out_of_stock), ...rows(data.low_stock)].map((row) => [s(row.product_name), s(row.category_name), number(n(row.quantity)), number(n(row.threshold))]), 'لا توجد منتجات منخفضة أو نافدة المخزون.'),
      table('قيمة المخزون', 'الأقسام', ['القسم', 'الأصناف', 'متوفر', 'نافد', 'قيمة الشراء', 'قيمة البيع'], rows(data.categories).map((row) => [s(row.category_name), number(n(row.sku_rows)), number(n(row.in_stock_rows)), number(n(row.out_of_stock_rows)), money(n(row.purchase_value)), money(n(row.retail_value))]), 'لا توجد بيانات مخزون مجمعة حسب الأقسام.'),
    ],
  };
}

function paymentsPresentation(data: ReportDocument, summary: Record<string, unknown>): Presentation {
  const canFinance = Boolean(asRecord(data.permissions).can_view_finance);
  return {
    metrics: [metric('إجمالي التحصيل', money(n(summary.gross_collected))), metric('المرتجعات', money(n(summary.refunds))), metric('رسوم على المتجر', money(n(summary.merchant_fees))), metric('صافي حركة الفترة', money(n(summary.net_period_movement)))],
    note: !canFinance ? 'تفاصيل التسويات والأرصدة الحية محجوبة حسب صلاحيات الحساب.' : undefined,
    tables: [
      table('Payment Ledger', 'وسائل الدفع', ['الوسيلة', 'العمليات', 'التحصيل', 'المرتجعات', 'الرسوم', 'صافي الحركة', 'غير مسوّى'], rows(data.methods).map((row) => [s(row.name), number(n(row.transactions)), money(n(row.gross_collected)), money(n(row.refunds)), money(n(row.merchant_fees)), money(n(row.net_period_movement)), canFinance ? money(nullable(row.unsettled_balance)) : 'محجوب']), 'لا توجد حركات دفع داخل الفترة.'),
      table('Settlements', 'آخر التسويات', ['الوسيلة', 'الإجمالي', 'الرسوم', 'الصافي', 'المرجع', 'التاريخ'], rows(data.recent_settlements).map((row) => [s(row.payment_method), money(n(row.gross_amount)), money(n(row.fee_amount)), money(n(row.net_amount)), s(row.provider_reference), date(row.settled_at)]), 'لا توجد تسويات مسجلة داخل الفترة.'),
    ],
  };
}

function returnsPresentation(data: ReportDocument, summary: Record<string, unknown>): Presentation {
  const canProfit = Boolean(asRecord(data.permissions).can_view_profit);
  return {
    metrics: [metric('قيمة المرتجعات المعتمدة', money(n(summary.approved_value))), metric('الطلبات المعتمدة', number(n(summary.approved_count))), metric('مهام رد معلقة', number(n(summary.pending_refund_tasks)), money(n(summary.pending_refund_amount))), metric('تأثير الربح', canProfit ? money(nullable(summary.profit_impact)) : 'محجوب')],
    tables: [
      table('Drill-down', 'آخر المرتجعات', ['المستند', 'النوع', 'السبب', 'وسيلة الدفع', 'القيمة', 'الحالة', 'الوقت'], rows(data.recent).map((row) => [s(row.document_number), returnType(row.return_type), s(row.reason), s(row.payment_name), money(n(row.total_amount)), status(row.status), date(row.event_at)]), 'لا توجد مرتجعات في الفترة.'),
      table('تحليل الأسباب', 'أسباب المرتجع', ['السبب', 'العدد', 'القيمة'], rows(data.reasons).map((row) => [s(row.reason), number(n(row.returns)), money(n(row.value))]), 'لا توجد أسباب مرتجعات مسجلة.'),
    ],
  };
}

function cashiersPresentation(data: ReportDocument, summary: Record<string, unknown>): Presentation {
  const canCash = Boolean(asRecord(data.permissions).can_view_cash_control);
  return {
    metrics: [metric('صافي المبيعات', money(n(summary.net_sales))), metric('الفواتير', number(n(summary.invoice_count))), metric('الكاشير', number(n(summary.cashiers))), metric('فرق الخزنة المطلق', canCash ? money(nullable(summary.cash_variance_absolute)) : 'محجوب')],
    note: !canCash ? 'فروق الخزن الفعلية محجوبة حسب صلاحيات التحكم النقدي.' : undefined,
    tables: [
      table('أداء الفريق', 'الكاشير', ['الكاشير', 'الورديات', 'الفواتير', 'صافي المبيعات', 'متوسط الفاتورة', 'مبيعات / ساعة', 'فرق الخزنة'], rows(data.cashiers).map((row) => [s(row.cashier_name), number(n(row.shift_count)), number(n(row.invoice_count)), money(n(row.net_sales)), money(n(row.average_ticket)), money(n(row.sales_per_hour)), canCash ? money(nullable(row.cash_variance_signed)) : 'محجوب']), 'لا توجد ورديات كاشير في الفترة.'),
      table('الورديات', 'تفاصيل الورديات', ['الكاشير', 'الجهاز', 'الحالة', 'الفواتير', 'صافي المبيعات', 'فتح', 'إغلاق'], rows(data.shifts).map((row) => [s(row.cashier_name), s(row.device_name), status(row.status), number(n(row.invoice_count)), money(n(row.net_sales)), date(row.opened_at), date(row.closed_at)]), 'لا توجد ورديات متقاطعة مع الفترة.'),
    ],
  };
}

function branchesPresentation(data: ReportDocument): Presentation {
  const branchRows = rows(data.branches);
  const totals = branchRows.reduce<{ sales: number; transactions: number; expenses: number }>((acc, row) => { const current = asRecord(row.current); acc.sales += n(current.net_sales); acc.transactions += n(current.transactions); acc.expenses += n(current.expenses); return acc; }, { sales: 0, transactions: 0, expenses: 0 });
  return {
    metrics: [metric('الفروع المتاحة', number(branchRows.length)), metric('صافي المبيعات', money(totals.sales)), metric('الفواتير والطلبات', number(totals.transactions)), metric('المصروفات', money(totals.expenses))],
    tables: [table('Branch Ranking', 'مقارنة الفروع', ['الفرع', 'صافي المبيعات', 'الفواتير', 'متوسط الفاتورة', 'إجمالي ربح POS', 'المصروفات', 'النتيجة المعروفة'], branchRows.sort((a, b) => n(asRecord(b.current).net_sales) - n(asRecord(a.current).net_sales)).map((row) => { const current = asRecord(row.current); return [s(row.branch_name), money(n(current.net_sales)), number(n(current.transactions)), money(n(current.average_ticket)), money(nullable(current.pos_gross_profit)), money(n(current.expenses)), money(nullable(current.known_operating_result))]; }), 'لا توجد فروع متاحة للمقارنة.')],
  };
}

function onlinePresentation(data: ReportDocument, summary: Record<string, unknown>): Presentation {
  return {
    metrics: [metric('الطلبات', number(n(summary.order_count))), metric('قيمة الطلبات المسلمة', money(n(summary.delivered_order_value))), metric('معدل التسليم', percent(summary.delivery_rate_percent)), metric('معدل الإلغاء', percent(summary.cancellation_rate_percent))],
    note: asRecord(data.data_quality).profit_available === false ? 'تكلفة وربح الأونلاين غير متاحين؛ التقرير لا يستنتج ربحًا من قيمة الطلبات.' : undefined,
    tables: [
      table('Orders', 'آخر الطلبات', ['العميل', 'الحالة', 'الدفع', 'الوسيلة', 'القيمة', 'الشحن', 'العناصر', 'الوقت'], rows(data.orders).map((row) => [s(row.customer_name, 'عميل غير مسجل'), status(row.status), status(row.payment_status), s(row.payment_method), money(n(row.total)), money(n(row.shipping_cost)), number(n(row.item_count)), date(row.created_at)]), 'لا توجد طلبات أونلاين في الفترة.'),
      table('التنفيذ', 'حالات الطلبات', ['الحالة', 'الطلبات', 'القيمة', 'الشحن'], rows(data.statuses).map((row) => [status(row.status), number(n(row.orders)), money(n(row.order_value)), money(n(row.shipping_charged))]), 'لا توجد حالات طلبات مسجلة.'),
    ],
  };
}

function customersPresentation(data: ReportDocument, summary: Record<string, unknown>): Presentation {
  return {
    metrics: [metric('عملاء اشتروا', number(n(summary.realized_customers_in_period))), metric('عملاء جدد', number(n(summary.new_realized_customers))), metric('عملاء عائدون', number(n(summary.returning_realized_customers))), metric('تغطية هوية المبيعات', percent(summary.overall_identity_coverage_percent))],
    tables: [
      table('Customer Value', 'العملاء', ['العميل', 'الهاتف', 'المرحلة', 'فواتير POS', 'طلبات أونلاين', 'قيمة الفترة', 'القيمة التاريخية', 'نقاط الولاء'], rows(data.customers).map((row) => [s(row.customer_name), s(row.phone), customerStage(row.customer_stage), number(n(row.pos_invoices)), number(n(row.online_orders)), money(n(row.period_realized_value)), money(n(row.lifetime_realized_value)), number(n(row.points_balance))]), 'لا توجد حركة عملاء معروفة داخل الفترة.'),
      table('مصدر الهوية', 'تغطية ربط العميل', ['القناة', 'الإجمالي', 'مرتبط بعميل', 'بدون هوية', 'نسبة التغطية'], [['POS', number(n(summary.pos_transactions)), number(n(summary.pos_linked_transactions)), number(n(summary.pos_anonymous_transactions)), percent(summary.pos_identity_coverage_percent)], ['أونلاين', number(n(summary.online_orders)), number(n(summary.online_linked_orders)), number(n(summary.online_anonymous_orders)), percent(summary.online_identity_coverage_percent)]], 'لا توجد بيانات تغطية.'),
    ],
  };
}

function costsPresentation(data: ReportDocument, summary: Record<string, unknown>): Presentation {
  const canCosts = Boolean(asRecord(data.permissions).can_view_costs);
  return {
    metrics: [metric('المصروفات المعتمدة', canCosts ? money(nullable(summary.active_expense_amount)) : 'محجوب'), metric('المشتريات', canCosts ? money(nullable(summary.purchase_total)) : 'محجوب'), metric('رواتب مدفوعة', canCosts ? money(nullable(summary.salary_paid_amount)) : 'محجوب'), metric('التزامات الموردين', canCosts ? money(nullable(summary.lifetime_supplier_outstanding)) : 'محجوب')],
    note: !canCosts ? 'قيم التكلفة والموردين محجوبة حسب صلاحيات الحساب.' : undefined,
    tables: [
      table('Expenses', 'أنواع المصروفات', ['النوع', 'العمليات', 'القيمة'], rows(data.expense_types).map((row) => [s(row.type, 'غير مصنف'), number(n(row.records)), canCosts ? money(nullable(row.amount)) : 'محجوب']), 'لا توجد مصروفات مسجلة في الفترة.'),
      table('Suppliers', 'الموردون', ['المورد', 'مشتريات الفترة', 'إجمالي الفترة', 'المدفوع', 'المستحق التاريخي', 'آخر شراء'], rows(data.suppliers).map((row) => [s(row.supplier_name), number(n(row.period_purchase_count)), canCosts ? money(nullable(row.period_purchase_total)) : 'محجوب', canCosts ? money(nullable(row.period_paid_total)) : 'محجوب', canCosts ? money(nullable(row.lifetime_outstanding)) : 'محجوب', date(row.last_purchase_at)]), 'لا توجد حركة موردين داخل الفترة.'),
    ],
  };
}

function transfersPresentation(data: ReportDocument, summary: Record<string, unknown>): Presentation {
  const canProfit = Boolean(asRecord(data.permissions).can_view_profit);
  return {
    metrics: [metric('صادر قيد النقل', number(n(summary.in_transit_outgoing))), metric('وارد قيد النقل', number(n(summary.in_transit_incoming))), metric('استلامات بفروق', number(n(summary.received_with_variance_in_period))), metric('نسبة الفروق', percent(summary.variance_rate_percent))],
    note: n(summary.overdue_transfer_tasks) > 0 ? `يوجد ${number(n(summary.overdue_transfer_tasks))} مهمة تحويل متأخرة تحتاج إجراء.` : undefined,
    tables: [table('Inventory Transfers', 'آخر التحويلات', ['التحويل', 'الاتجاه', 'من', 'إلى', 'الحالة', 'الأصناف', 'المشحون', 'المستلم', 'الفرق', 'التكلفة'], rows(data.recent_transfers).map((row) => [s(row.transfer_number), row.direction === 'incoming' ? 'وارد' : 'صادر', s(row.from_branch_name), s(row.to_branch_name), status(row.status), number(n(row.items_count)), number(n(row.shipped_measure)), number(n(row.received_measure)), number(n(row.variance_measure)), canProfit ? money(nullable(row.cost_value)) : 'محجوب']), 'لا توجد تحويلات مخزون داخل الفترة.')],
  };
}

function insightsPresentation(data: ReportDocument, summary: Record<string, unknown>): Presentation {
  return {
    metrics: [metric('إجمالي الإشارات', number(n(summary.total))), metric('عاجل', number(n(summary.critical))), metric('تحذيرات', number(n(summary.warning))), metric('فرص', number(n(summary.opportunity)))],
    note: asRecord(data.data_quality).generative_ai_used === false ? 'الإشارات مبنية على قواعد وبيانات فعلية، ولا تستخدم ذكاءً توليديًا لتخمين النتائج.' : undefined,
    tables: [table('Smart Insights', 'الإشارات حسب الأولوية', ['الإشارة', 'النوع', 'المؤشر', 'القيمة', 'الإجراء'], rows(data.insights).map((row) => [s(row.title), insightSeverity(row.severity), s(row.metric_label), `${number(n(row.metric_value))} ${s(row.metric_unit, '')}`.trim(), s(row.action)]), 'لا توجد إشارات تشغيلية للفترة المحددة.')],
  };
}

function metric(label: string, value: string, hint?: string): Metric { return { label, value, hint }; }
function table(eyebrow: string, title: string, columns: string[], body: string[][], empty: string): Table { return { eyebrow, title, columns, rows: body, empty }; }
function channel(value: unknown) { return value === 'online' ? 'أونلاين' : value === 'pos' ? 'POS' : s(value); }
function returnType(value: unknown) { return value === 'full' ? 'كامل' : value === 'partial' ? 'جزئي' : s(value); }
function customerStage(value: unknown) { const labels: Record<string, string> = { prospect: 'محتمل', new: 'جديد', returning: 'عائد', engaged: 'نشط' }; return labels[String(value || '')] || s(value); }
function insightSeverity(value: unknown) { const labels: Record<string, string> = { critical: 'عاجل', warning: 'تحذير', opportunity: 'فرصة', info: 'معلومة' }; return labels[String(value || '')] || s(value); }
function status(value: unknown) {
  const labels: Record<string, string> = { open: 'مفتوحة', closed: 'مغلقة', approved: 'معتمد', rejected: 'مرفوض', pending: 'معلق', delivered: 'تم التسليم', cancelled: 'ملغي', processing: 'قيد التنفيذ', paid: 'مدفوع', failed: 'فشل', refunded: 'مردود' };
  return labels[String(value || '')] || s(value);
}
