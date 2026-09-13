import { ArrowUpLeft, Boxes, Building2, CircleDollarSign, ClipboardList, PackageSearch, RotateCcw, ShoppingCart, Truck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReportKey } from '../services/reportingDetails';

export const reports: Array<{ key: ReportKey; title: string; desc: string; icon: typeof ShoppingCart }> = [
  { key: 'sales', title: 'المبيعات', desc: 'المبيعات، الفواتير، متوسط السلة وساعات الذروة.', icon: ShoppingCart },
  { key: 'profitability', title: 'الربحية', desc: 'Net Sales → COGS → Gross Profit → Operating Result.', icon: CircleDollarSign },
  { key: 'products', title: 'المنتجات والأقسام', desc: 'الأكثر مبيعًا وربحًا، الهامش والمنتجات بطيئة الحركة.', icon: PackageSearch },
  { key: 'inventory', title: 'المخزون', desc: 'قيمة المخزون، التغطية، النواقص والمنتجات بلا حركة.', icon: Boxes },
  { key: 'payments', title: 'وسائل الدفع', desc: 'التحصيل، الرسوم، Refunds والتسويات لكل وسيلة.', icon: ClipboardList },
  { key: 'returns', title: 'المرتجعات', desc: 'Full / Partial، الأسباب وتأثير المرتجع على الربح.', icon: RotateCcw },
  { key: 'cashiers', title: 'الكاشير والورديات', desc: 'الأداء، Cash Variance والتسليم حسب وسيلة الدفع.', icon: Users },
  { key: 'branches', title: 'الفروع', desc: 'مقارنة الفروع المتاحة في المبيعات والربحية والمصروفات.', icon: Building2 },
  { key: 'online', title: 'الأونلاين والتوصيل', desc: 'Orders، الإلغاء، التحصيل وأداء التنفيذ والتوصيل.', icon: Truck },
];

export default function Reports() {
  return <div className="stack-lg">
    <section className="page-intro"><span className="eyebrow">Reporting V2</span><h2>التقارير والتحليلات</h2><p>تقارير فعلية من نفس محرك البيانات، مع تطبيق صلاحيات الفرع على الخادم وإظهار حدود اكتمال كل رقم.</p></section>
    <section className="report-grid">{reports.map(({ key, title, desc, icon: Icon }) => <Link className="report-card" to={`/reports/${key}`} key={key}>
      <span className="report-card__icon"><Icon size={22}/></span><div><strong>{title}</strong><p>{desc}</p></div><ArrowUpLeft className="report-card__arrow" size={18}/>
    </Link>)}</section>
    <section className="section-card roadmap-card"><div><span className="eyebrow">قاعدة مهمة</span><h3>لا توجد أرقام تجميلية</h3><p>أي مقياس لا يملك مصدرًا مكتملًا يظهر كغير متاح، ولا يتم استبداله بحسابات قديمة أو نسب ثابتة.</p></div></section>
  </div>;
}
