import { AlertTriangle, ArrowLeftRight, ArrowUpLeft, BadgeDollarSign, BarChart3, Boxes, Building2, CircleDollarSign, ClipboardList, Clock3, Gauge, Lightbulb, PackageSearch, Receipt, RotateCcw, ShoppingCart, Truck, Users, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import '../components/reporting-metrics.css';
import './reports-hub.css';
import './reports-mobile.css';
import type { ReportKey } from '../services/reportingDetails';
import { coreReportingMetricKeys, getReportingMetric } from '../services/reportingMetrics';

type ExtendedReportKey = ReportKey | 'workforce-costs' | 'waste' | 'peak-hours' | 'debts';

type ReportMeta = { key: ExtendedReportKey; title: string; desc: string; icon: typeof ShoppingCart };
export const reports: ReportMeta[] = [
  { key: 'sales', title: 'المبيعات', desc: 'المبيعات، الفواتير، متوسط السلة وساعات الذروة.', icon: ShoppingCart },
  { key: 'profitability', title: 'الربحية', desc: 'Net Sales → COGS → Gross Profit → Operating Result.', icon: CircleDollarSign },
  { key: 'products', title: 'المنتجات والأقسام', desc: 'الأكثر مبيعًا وربحًا، الهامش ومساهمة الأقسام.', icon: PackageSearch },
  { key: 'inventory', title: 'المخزون', desc: 'قيمة المخزون، النواقص، النافد وصحة المخزون.', icon: Boxes },
  { key: 'waste', title: 'التالف والهالك', desc: 'التلف والكسر المعتمد، الكمية وتكلفة الخسارة وأعلى المنتجات المتضررة.', icon: AlertTriangle },
  { key: 'payments', title: 'وسائل الدفع', desc: 'التحصيل، الرسوم، Refunds والتسويات لكل وسيلة.', icon: ClipboardList },
  { key: 'returns', title: 'المرتجعات', desc: 'Full / Partial، الأسباب وتأثير المرتجع على الربح.', icon: RotateCcw },
  { key: 'workforce-costs', title: 'المرتبات والمصروفات', desc: 'Payroll V2، ساعات العمل، الإضافي والخصومات والمصروفات التشغيلية.', icon: UsersRound },
  { key: 'debts', title: 'المديونيات', desc: 'مديونيات العملاء والموظفين ومستحقات الموردين مع فصل الرصيد الحالي عن حركة الفترة.', icon: BadgeDollarSign },
  { key: 'cashiers', title: 'الكاشير والورديات', desc: 'الأداء، Cash Variance والمبيعات لكل ساعة.', icon: Users },
  { key: 'peak-hours', title: 'ساعات العمل والذروة', desc: 'مقارنة 24 ساعة بين حركة الفرع وطلبات الأونلاين مع Heatmap أسبوعي.', icon: Clock3 },
  { key: 'branches', title: 'الفروع', desc: 'مقارنة الفروع في المبيعات والربحية والمصروفات.', icon: Building2 },
  { key: 'online', title: 'الأونلاين والتوصيل', desc: 'Orders، الإلغاء، التحصيل وأداء التنفيذ والتوصيل.', icon: Truck },
  { key: 'customers', title: 'العملاء والولاء', desc: 'الجدد والعائدون، قيمة العميل وتغطية الهوية.', icon: Users },
  { key: 'costs', title: 'التكاليف والموردون', desc: 'المصروفات، المشتريات والالتزامات والموردون.', icon: Receipt },
  { key: 'transfers', title: 'تحويلات المخزون', desc: 'الصادر والوارد، فروق الاستلام والمهام المتأخرة.', icon: ArrowLeftRight },
  { key: 'insights', title: 'الإشارات الذكية', desc: 'مشكلات وفرص مرتبة حسب الأولوية من القواعد الفعلية.', icon: Lightbulb },
];

const groups: Array<{ title: string; eyebrow: string; desc: string; keys: ExtendedReportKey[] }> = [
  { title: 'الأداء التجاري', eyebrow: 'Business Performance', desc: 'المبيعات والربحية والمنتجات والمخزون من نفس تعريفات الأرقام.', keys: ['sales', 'profitability', 'products', 'inventory', 'waste'] },
  { title: 'الرقابة المالية والعمالة', eyebrow: 'Financial & People Cost', desc: 'التحصيل، المرتجعات، المرتبات، المديونيات والمصروفات والموردون من مصادر مالية موثوقة.', keys: ['payments', 'returns', 'workforce-costs', 'debts', 'costs'] },
  { title: 'تشغيل الفروع', eyebrow: 'Operations', desc: 'أداء الفريق والفروع والأونلاين وساعات الذروة وتحويلات المخزون.', keys: ['cashiers', 'peak-hours', 'branches', 'online', 'transfers'] },
  { title: 'العملاء والذكاء', eyebrow: 'Customers & Intelligence', desc: 'قيمة العميل، التغطية، والإشارات التي تحتاج تدخل الإدارة.', keys: ['customers', 'insights'] },
];

export default function Reports() {
  const coreMetrics = coreReportingMetricKeys.map(getReportingMetric);

  return <div className="stack-lg reports-hub">
    <section className="reports-command-hero">
      <div><span className="eyebrow">Reporting V2</span><h2>التقارير والتحليلات</h2><p>كل تقرير مبني على نفس محرك البيانات والصلاحيات، مع رسوم تفاعلية، فترة مخصصة، تصدير CSV وطباعة/PDF بدون أرقام تجميلية. مركز القرار يربط المبيعات والربح والعمالة والمصروفات والتالف والذروة في شاشة واحدة.</p></div>
      <Link to="/reports/decision-center" className="reports-command-hero__action"><Gauge size={20}/><span><small>Decision Center</small><strong>فتح مركز القرار</strong></span><ArrowUpLeft size={18}/></Link>
    </section>

    <section className="reports-capability-strip" aria-label="قدرات نظام التقارير">
      <span><BarChart3 size={16}/> رسوم وتحليلات متقدمة</span>
      <span><Clock3 size={16}/> ذروة POS وOnline</span>
      <span><CircleDollarSign size={16}/> أرقام مالية من الـLedgers</span>
      <span><Lightbulb size={16}/> إشارات قرار قابلة للتتبع</span>
    </section>

    {groups.map((group) => <section className="reports-domain" key={group.title}>
      <div className="reports-domain__head"><div><span className="eyebrow">{group.eyebrow}</span><h3>{group.title}</h3></div><p>{group.desc}</p></div>
      <div className="report-grid">{group.keys.map((key) => {
        const report = reports.find((item) => item.key === key)!;
        const Icon = report.icon;
        return <Link className="report-card report-card--advanced" to={`/reports/${report.key}`} key={report.key}>
          <span className="report-card__icon"><Icon size={22}/></span>
          <div><div className="report-card__title-row"><strong>{report.title}</strong><small>Advanced</small></div><p>{report.desc}</p><span className="report-card__features">Charts · Custom Range · Export</span></div>
          <ArrowUpLeft className="report-card__arrow" size={18}/>
        </Link>;
      })}</div>
    </section>)}

    <section className="metric-dictionary">
      <div className="metric-dictionary__head">
        <div><span className="eyebrow">Metric Dictionary</span><h3>قاموس المؤشرات الموحد</h3></div>
        <p>كل مؤشر أساسي له تعريف وصيغة ومصدر واحد. أي شاشة تستخدم المؤشر تعتمد على نفس التعريف بدل اختلاف الحساب بين الـDashboard والتقارير.</p>
      </div>
      <div className="metric-definition-grid">{coreMetrics.map((metric) => <article className="metric-definition-card" key={metric.key}>
        <div className="metric-definition-card__top"><strong>{metric.label}</strong><span className="metric-definition-card__key">{metric.key}</span></div>
        <p>{metric.definition}</p>
        <div className="metric-definition-card__formula">{metric.formula}</div>
        <div className="metric-definition-card__source"><b>المصدر</b><code>{metric.source}</code></div>
        {metric.caveat && <div className="metric-definition-card__caveat"><b>ملاحظة</b><span>{metric.caveat}</span></div>}
      </article>)}</div>
    </section>

    <section className="section-card roadmap-card"><div><span className="eyebrow">Data Integrity</span><h3>الأرقام قبل الرسومات</h3><p>أي مقياس لا يملك مصدرًا مكتملًا يظهر كغير متاح أو محدود النطاق؛ لا يتم تعويضه بنسبة ثابتة أو افتراض ربح غير موثق.</p></div></section>
  </div>;
}
