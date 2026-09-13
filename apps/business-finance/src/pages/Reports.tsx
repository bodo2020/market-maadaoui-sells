import { ArrowUpLeft, Boxes, Building2, CircleDollarSign, ClipboardList, PackageSearch, RotateCcw, ShoppingCart, Truck, Users } from 'lucide-react';
const reports = [
  { title: 'المبيعات', desc: 'المبيعات، الفواتير، متوسط السلة وساعات الذروة.', icon: ShoppingCart },
  { title: 'الربحية', desc: 'Net Sales → COGS → Gross Profit → Net Profit.', icon: CircleDollarSign },
  { title: 'المنتجات والأقسام', desc: 'الأكثر مبيعًا وربحًا، الهامش والمنتجات بطيئة الحركة.', icon: PackageSearch },
  { title: 'المخزون', desc: 'قيمة المخزون، الدوران، Days of Stock والفاقد.', icon: Boxes },
  { title: 'وسائل الدفع', desc: 'التحصيل، الرسوم، Refunds والتسويات لكل وسيلة.', icon: ClipboardList },
  { title: 'المرتجعات', desc: 'Full / Partial، الأسباب وتأثير المرتجع على الربح.', icon: RotateCcw },
  { title: 'الكاشير والورديات', desc: 'الأداء، Cash Variance والتسليم حسب وسيلة الدفع.', icon: Users },
  { title: 'الفروع', desc: 'مقارنة الفروع في المبيعات والربحية والمصروفات.', icon: Building2 },
  { title: 'الأونلاين والتوصيل', desc: 'Orders، الإلغاء، المناطق وأداء التنفيذ والتوصيل.', icon: Truck },
];
export default function Reports() { return <div className="stack-lg"><section className="page-intro"><span className="eyebrow">Reporting V2</span><h2>التقارير والتحليلات</h2><p>كل تقرير يعتمد على نفس Metric Dictionary، مع Drill-down حتى مستوى الفاتورة والحركة الأصلية.</p></section><section className="report-grid">{reports.map(({title,desc,icon:Icon}) => <button className="report-card" key={title}><span className="report-card__icon"><Icon size={22}/></span><div><strong>{title}</strong><p>{desc}</p></div><ArrowUpLeft className="report-card__arrow" size={18}/></button>)}</section><section className="section-card roadmap-card"><div><span className="eyebrow">قاعدة مهمة</span><h3>لا توجد أرقام تجميلية</h3><p>أي تقرير لم يتصل بعد بالـInvoice V2 والـLedgers سيظهر كغير متاح بدل استخدام الحسابات القديمة أو نسب ثابتة.</p></div></section></div>; }
