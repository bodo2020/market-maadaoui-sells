import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CreditCard, PackageX, ReceiptText, RotateCcw, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';

export type DailyPoint = { date: string; pos_sales: number; pos_transactions: number; marketplace_sales: number; marketplace_transactions: number; total_sales: number };
export type ProductRank = { product_id: string; product_name: string; quantity: number; revenue: number; profit?: number };
export type PartnerAnalytics = {
  period: { from: string; to: string };
  kpis: { total_sales: number; previous_total_sales: number; growth_percent: number | null; transactions: number; average_ticket: number; pos_sales: number; pos_transactions: number; pos_returns: number; pos_return_count: number; pos_gross_profit: number; pos_profit_after_payment_fees: number; marketplace_sales: number; marketplace_orders_received: number; marketplace_delivered_orders: number };
  channels: { pos_share_percent: number; marketplace_share_percent: number };
  marketplace_funnel: Record<'pending' | 'confirmed' | 'preparing' | 'ready' | 'shipped' | 'delivered' | 'cancelled', number>;
  inventory: { product_count: number; stock_units: number; low_stock_count: number; out_of_stock_count: number; retail_value: number; cost_value: number };
  daily: DailyPoint[];
  top_pos_products: ProductRank[];
  top_marketplace_products: ProductRank[];
  pos_payment_mix: { name: string; transactions: number; sales: number }[];
};

type Props = { data: PartnerAnalytics | null; loading: boolean; error: string; range: number; onRange: (days: number) => void; onRetry: () => void; branchName: string; posEnabled: boolean; canUsePos: boolean };
const cash = (v: number | undefined | null) => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(v || 0))} ج.م`;
const number = (v: number | undefined | null) => new Intl.NumberFormat('ar-EG').format(Number(v || 0));
const percent = (v: number | undefined | null) => `${number(v)}٪`;
const dayLabel = (v: string) => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', timeZone: 'Africa/Cairo' }).format(new Date(`${v}T12:00:00Z`));

function RangePicker({ range, onRange }: Pick<Props, 'range' | 'onRange'>) {
  return <div className="range-picker" role="group" aria-label="الفترة الزمنية">{[7, 30, 90].map(days => <button key={days} className={range === days ? 'active' : ''} onClick={() => onRange(days)}>{days === 7 ? '٧ أيام' : days === 30 ? '٣٠ يوم' : '٩٠ يوم'}</button>)}</div>;
}
function Metric({ title, value, icon: Icon, detail, theme = 'green' }: { title: string; value: string; icon: typeof BarChart3; detail?: string; theme?: string }) { return <div className="metric"><span className={`metric-icon ${theme}`}><Icon size={19}/></span><span>{title}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>; }
function Chart({ rows, field, color }: { rows: DailyPoint[]; field: 'pos_sales' | 'total_sales'; color: string }) {
  const max = Math.max(1, ...rows.map(r => Number(r[field] || 0)));
  if (!rows.length) return <div className="no-chart">لا توجد بيانات في الفترة دي.</div>;
  return <div className="bars-scroll"><div className="bars" style={{ minWidth: Math.max(0, rows.length * 18) }} role="img" aria-label={`مخطط المبيعات اليومية خلال ${rows.length} يوم`}>
    {rows.map((r, i) => <div className="bar-col" key={r.date} title={`${dayLabel(r.date)}: ${cash(r[field])}`}><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(r[field] > 0 ? 5 : 0, Number(r[field]) / max * 100)}%`, background: color }}/></div>{(rows.length <= 14 || i % Math.ceil(rows.length / 9) === 0) && <span>{dayLabel(r.date)}</span>}</div>)}
  </div></div>;
}
function TopProducts({ products, showProfit = false }: { products: ProductRank[]; showProfit?: boolean }) {
  return products.length ? <div className="rank-list">{products.map((p, i) => <div key={`${p.product_id}-${i}`} className="rank-row"><span className="rank-index">{number(i + 1)}</span><div><strong>{p.product_name}</strong><small>{number(p.quantity)} وحدة مباعة</small></div><div className="rank-amount"><strong>{cash(p.revenue)}</strong>{showProfit && <small>ربح {cash(p.profit)}</small>}</div></div>)}</div> : <p className="report-empty">لا توجد منتجات مباعة خلال الفترة المحددة.</p>;
}
function State({ data, loading, error, onRetry }: Pick<Props, 'data' | 'loading' | 'error' | 'onRetry'>) {
  if (loading && !data) return <div className="report-state">جاري تحميل أرقام الفرع...</div>;
  if (error) return <div className="report-state"><p>{error}</p><button onClick={onRetry}>إعادة المحاولة</button></div>;
  if (!data) return <div className="report-state">اختر فرعًا لعرض بياناته.</div>;
  return null;
}

export function PosDashboard(props: Props) {
  const { data, loading, error, range, onRange, onRetry, branchName, posEnabled, canUsePos } = props;
  const state = State({ data, loading, error, onRetry });
  return <section className="analytics-page"><div className="report-header"><div><span className="report-kicker">نقطة البيع · {branchName}</span><h2>نشاط الـPOS</h2><p>متابعة المبيعات والوردية والمخزون من بيانات الفواتير المعتمدة.</p></div><RangePicker range={range} onRange={onRange}/></div>
    <div className={`channel-banner ${posEnabled ? 'is-on' : ''}`}><span className="channel-dot"/><div><strong>{posEnabled ? 'قناة نقطة البيع مفعّلة' : 'قناة نقطة البيع غير مفعّلة'}</strong><small>{posEnabled && canUsePos ? 'يمكنك تسجيل جهازك وفتح ورديتك من صفحة الكاشير مباشرة، من غير انتظار اعتماد.' : posEnabled ? 'تشغيل الكاشير متاح لمالك الشريك والإداري والمدير المصرّح لهم على الفرع.' : 'فعّل القناة من إدارة الفرع قبل تشغيل كاشير جديد.'}</small></div></div>
    {state || <><div className="metrics-grid"><Metric title="صافي مبيعات POS" value={cash(data!.kpis.pos_sales)} icon={Wallet} detail="بعد المرتجعات"/><Metric title="عدد الفواتير" value={number(data!.kpis.pos_transactions)} icon={ReceiptText} theme="blue"/><Metric title="الربح بعد رسوم الدفع" value={cash(data!.kpis.pos_profit_after_payment_fees)} icon={TrendingUp} theme="purple" detail="للـPOS فقط"/><Metric title="المرتجعات" value={cash(data!.kpis.pos_returns)} icon={RotateCcw} theme="orange" detail={`${number(data!.kpis.pos_return_count)} عملية`}/></div>
      <div className="report-grid"><div className="report-card wide-card"><div className="report-card-head"><div><span>اتجاه المبيعات</span><h3>مبيعات POS يوميًا</h3></div><strong>{cash(data!.kpis.pos_sales)}</strong></div><Chart rows={data!.daily} field="pos_sales" color="#28764b"/></div><div className="report-card"><div className="report-card-head"><div><span>وسائل الدفع</span><h3>توزيع المدفوعات</h3></div><CreditCard size={19}/></div>{data!.pos_payment_mix.length ? data!.pos_payment_mix.map((m, i) => <div className="payment-row" key={`${m.name}-${i}`}><div><strong>{m.name}</strong><span>{number(m.transactions)} فاتورة</span></div><b>{cash(m.sales)}</b></div>) : <p className="report-empty">لا توجد مدفوعات خلال الفترة.</p>}</div></div>
      <div className="report-grid"><div className="report-card"><div className="report-card-head"><div><span>الأكثر بيعًا</span><h3>منتجات الـPOS</h3></div></div><TopProducts products={data!.top_pos_products} showProfit/></div><div className="report-card"><div className="report-card-head"><div><span>حالة المخزون</span><h3>جاهزية الفرع</h3></div><ShoppingBag size={19}/></div><div className="inventory-numbers"><div><b>{number(data!.inventory.product_count)}</b><span>منتج</span></div><div><b>{number(data!.inventory.stock_units)}</b><span>وحدة متاحة</span></div><div><b>{number(data!.inventory.low_stock_count)}</b><span>مخزون منخفض</span></div><div><b>{number(data!.inventory.out_of_stock_count)}</b><span>نافد</span></div></div><p className="report-note">قيمة المخزون بسعر البيع {cash(data!.inventory.retail_value)} · بالتكلفة {cash(data!.inventory.cost_value)}</p></div></div>
    </>}
  </section>;
}

export function ReportsDashboard(props: Props) {
  const { data, loading, error, range, onRange, onRetry, branchName } = props;
  const state = State({ data, loading, error, onRetry });
  const growth = data?.kpis.growth_percent;
  return <section className="analytics-page"><div className="report-header"><div><span className="report-kicker">تحليل الأداء · {branchName}</span><h2>التقارير</h2><p>مبيعات الفرع في نقطة البيع والطلبات المسلّمة والمدفوعة أونلاين.</p></div><RangePicker range={range} onRange={onRange}/></div>
    {state || <><div className="metrics-grid"><Metric title="إجمالي المبيعات" value={cash(data!.kpis.total_sales)} icon={Wallet} detail="POS + أونلاين مسلّم ومدفوع"/><Metric title="المعاملات" value={number(data!.kpis.transactions)} icon={ReceiptText} theme="blue"/><Metric title="متوسط الفاتورة" value={cash(data!.kpis.average_ticket)} icon={BarChart3} theme="purple"/><div className="metric"><span className="metric-icon orange">{growth !== null && growth !== undefined && growth < 0 ? <ArrowDownRight size={19}/> : <ArrowUpRight size={19}/>}</span><span>التغير عن الفترة السابقة</span><strong>{growth === null || growth === undefined ? '—' : percent(growth)}</strong><small>السابق {cash(data!.kpis.previous_total_sales)}</small></div></div>
      <div className="report-card full-card"><div className="report-card-head"><div><span>اتجاه النشاط</span><h3>المبيعات اليومية</h3></div><strong>{cash(data!.kpis.total_sales)}</strong></div><Chart rows={data!.daily} field="total_sales" color="#0b5936"/></div>
      <div className="report-grid"><div className="report-card"><div className="report-card-head"><div><span>القنوات</span><h3>مصادر المبيعات</h3></div><Activity size={19}/></div><div className="channel-line"><span>نقطة البيع</span><strong>{cash(data!.kpis.pos_sales)}</strong><b>{percent(data!.channels.pos_share_percent)}</b></div><div className="progress"><span style={{ width: `${Math.max(0,Math.min(100,data!.channels.pos_share_percent))}%` }}/></div><div className="channel-line"><span>الطلبات أونلاين</span><strong>{cash(data!.kpis.marketplace_sales)}</strong><b>{percent(data!.channels.marketplace_share_percent)}</b></div><div className="progress alt"><span style={{ width: `${Math.max(0,Math.min(100,data!.channels.marketplace_share_percent))}%` }}/></div><p className="report-note">عدد الطلبات الواردة {number(data!.kpis.marketplace_orders_received)} · المسلّمة {number(data!.kpis.marketplace_delivered_orders)}</p></div>
      <div className="report-card"><div className="report-card-head"><div><span>تشغيل الطلبات</span><h3>حالات الأونلاين</h3></div><PackageX size={19}/></div><div className="funnel">{([['pending','جديد'],['confirmed','مؤكد'],['preparing','قيد التجهيز'],['ready','جاهز'],['shipped','في التوصيل'],['delivered','تم التسليم'],['cancelled','ملغي']] as const).map(([key,label]) => <div key={key}><span>{label}</span><b>{number(data!.marketplace_funnel[key])}</b></div>)}</div></div></div>
      <div className="report-grid"><div className="report-card"><div className="report-card-head"><div><span>الأكثر مبيعًا</span><h3>منتجات الـPOS</h3></div></div><TopProducts products={data!.top_pos_products} showProfit/></div><div className="report-card"><div className="report-card-head"><div><span>الأكثر طلبًا</span><h3>منتجات الأونلاين</h3></div></div><TopProducts products={data!.top_marketplace_products}/></div></div>
      <p className="report-note external">الربح المعروض خاص بالـPOS فقط. أرباح طلبات الأونلاين غير مكتملة في مصدر البيانات الحالي، لذلك لا نعرضها كإجمالي.</p>
    </>}
  </section>;
}
