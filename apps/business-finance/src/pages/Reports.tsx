import { ArrowLeftRight, ArrowUpLeft, BarChart3, Boxes, Building2, CircleDollarSign, ClipboardList, Gauge, Lightbulb, PackageSearch, Receipt, RotateCcw, ShoppingCart, Truck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import '../components/reporting-metrics.css';
import './reports-hub.css';
import type { ReportKey } from '../services/reportingDetails';
import { coreReportingMetricKeys, getReportingMetric } from '../services/reportingMetrics';

export const reports: Array<{ key: ReportKey; title: string; desc: string; icon: typeof ShoppingCart }> = [
  { key: 'sales', title: 'المبيعات', desc: 'المبيعات، الفواتير، متوسط السلة وساعات الذروة.', icon: ShoppingCart },
  { key: 'profitability', title: 'الربحية', desc: 'Net Sales → COGS → Gross Profit → Operating Result.', icon: CircleDollarSign },
  { key: 'products', title: 'المنتجات والأقسام', desc: 'الأكثر مبيعًا وربحًا، الهامش ومساهمة الأقسام.', icon: PackageSearch },
  { key: 'inventory', title: 'المخزون', desc: 'قيمة المخزون، النواقص، النافد وصحة المخزون.', icon: Boxes },
  { key: 'payments', title: 'وسائل الدفع', desc: 'التحصيل، الرسوم، Refunds والتسويات لكل وسيلة.', icon: ClipboardList },
  { key: 'returns', title: 'المرتجعات', desc: 'Full / Partial، الأسباب وتأثير المرتجع على الربح.', icon: RotateCcw },
  { key: 'cashiers', title: 'الكاشير والورديات', desc: 'الأداء، Cash Variance والمبيعات لكل ساعة.', icon: Users },
  { key: 'branches', title: 'الفروع', desc: 'مقارنة الفروع في المبيعات والربحية والمصروفات.', icon: Building2 },
  { key: 'online', title: 'الأونلاين والتوصيل', desc: 'Orders، الإلغاء، التحصيل وأداء التنفيذ والتوصيل.', icon: Truck },
  { key: 'customers', title: 'العملاء والولاء', desc: 'الجدد والعائدون، قيمة العميل وتغطية الهوية.', icon: Users },
  { key: 'costs', title: 'التكاليف والموردون', desc: 'المصروفات، المشتريات، الرواتب والتزامات الموردين.', icon: Receipt },
  { key: 'transfers', title: 'تحويلات المخزون', desc: 'الصادر والوارد، فروق الاستلام والمهام المتأخرة.', icon: ArrowLeftRight },
  { key: 'insights', title: 'الإشارات الذكية', desc: 'مشكلات وفرص مرتبة حسب الأولوية من القواعد الفعلية.', icon: Lightbulb },
];

const groups: Array<{ title: string; eyebrow: string; desc: string; keys: ReportKey[] }> = [
  { title: 'الأداء التجاري', eyebrow: 'Business Performance', desc: 'المبيعات والربحية والمنتجات والمخزون من نفس تعريفات الأرقام.', keys: ['sales', 'profitability', 'products', 'inventory'] },
  { title: 'الرقابة المالية', eyebrow: 'Financial Control', desc: 'تحصيل الأموال، رسوم الدفع، المرتجعات، المصروفات والموردون.', keys: ['payments', 'returns', 'costs'] },
  { title: 'تشغيل الفروع', eyebrow: 'Operations', desc: 'أداء الفريق والفروع والأونلاين وتحويلات المخزون.', keys: ['cashiers', 'branches', 'online', 'transfers'] },
  { title: 'العملاء والذكاء', eyebrow: 'Customers & Intelligence', desc: 'قيمة العميل، التغطية، والإشارات التي تحتاج تدخل الإدارة.', keys: ['customers', 'insights'] },
];

export default function Reports() {
  const coreMetrics = coreReportingMetricKeys.map(getReportingMetric);

  return <div className="stack-lg reports-hub">
    <section className="reports-command-hero">
      <div><span className="eyebrow">Reporting V2</span><h2>التقارير والتحليلات</h2><p>كل تقرير مبني على نفس محرك البيانات والصلاحيات، مع رسوم تفاعلية، فترة مخصصة، تصدير CSV وطباعة/PDF بدون أرقام تجميلية.</p></div>
      <Link to="/" className="reports-command-hero__action"><Gauge size={20}/><span><small>Executive View</small><strong>فتح مركز القيادة</strong></span><ArrowUpLeft size={18}/></Link>
    </section>

    <section className="reports-capability-strip" aria-label="قدرات نظام التقارير">
      <span><BarChart3 size={16}/> رسوم وتحليلات متقدمة</span>
      <span><ClipboardList size={16}/> Drill-down للبيانات</span>
      <span><CircleDollarSign size={16}/> أرقام مالية من الـLedgers</span>
      <span><Building2 size={16}/> صلاحيات وفروع</span>
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
