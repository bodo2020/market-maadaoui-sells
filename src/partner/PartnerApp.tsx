import React from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, ArrowUpLeft, Bell, Check, ChevronDown, CircleAlert, Clock3, LayoutDashboard, Monitor, ChartNoAxesCombined, LogOut, PackageCheck, RefreshCw, Search, ShoppingBag, Store, Truck, Wallet, Boxes, Users, Menu } from 'lucide-react';
import { PosDashboard, ReportsDashboard, type PartnerAnalytics } from './AnalyticsPages';
import { PartnerPOS } from './PartnerPOS';
import { DeliveryPage, FinancePage, ProductsPage, StorePage, TeamPage } from './PartnerPages';

type Merchant = { id: string; name: string; role: string; status: string };
type Branch = { id: string; name: string; address?: string | null; active: boolean };
type Product = { id: string; product_id: string; name: string; barcode?: string | null; status: string; sale_price?: number | null; offer_price?: number | null; quantity: number; min_stock_level?: number; alert_enabled?: boolean; image_urls?: string[] };
type Order = { id: string; tracking_number?: string; customer_name?: string; shipping_address?: string; status: string; total: number; payment_status?: string; payment_method?: string; items: unknown; created_at: string; updated_at: string };
type OrderDetails = Order & { customer?: { name?: string; phone?: string }; shipping?: { address?: string }; notes?: string; history?: { old_status: string; new_status: string; created_at: string }[]; can_cancel?: boolean };
type Settlement = { id: string; reference: string; status: string; net_payable: number; period_end: string; paid_at?: string | null };
type Workspace = { pos_enabled: boolean; can_use_pos: boolean; merchant_id: string; merchant_name: string; role: string; selected_branch_id: string; branches: Branch[]; products: Product[]; orders: Order[]; finance: { unsettled_balance: number; recent_settlements: Settlement[] } };
type Page = 'overview' | 'orders' | 'delivery' | 'pos' | 'products' | 'store' | 'team' | 'finance' | 'reports';

const db = supabase as unknown as SupabaseClient;
const currency = (n: number | null | undefined) => `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n || 0))} ج.م`;
const date = (s: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s));
const shortId = (s: string) => s.slice(0, 8).toUpperCase();
const statusLabel: Record<string, string> = { pending: 'جديد', confirmed: 'مؤكد', preparing: 'قيد التجهيز', ready: 'جاهز للاستلام', shipped: 'خرج للتوصيل', delivered: 'تم التسليم', cancelled: 'ملغي', draft: 'مسودة', active: 'نشط', paused: 'متوقف', rejected: 'مرفوض', approved: 'معتمد', paid: 'مدفوع' };
const nextStatus: Record<string, { status: string; label: string }> = { pending: { status: 'accept', label: 'تأكيد الطلب' }, confirmed: { status: 'start_preparing', label: 'بدء التجهيز' }, preparing: { status: 'mark_ready', label: 'جاهز للاستلام' } };
const nav: { id: Page; label: string; icon: typeof LayoutDashboard; group: string }[] = [{ id: 'overview', label: 'الرئيسية', icon: LayoutDashboard, group: 'البداية' }, { id: 'orders', label: 'الطلبات', icon: ShoppingBag, group: 'التشغيل' }, { id: 'delivery', label: 'التوصيل', icon: Truck, group: 'التشغيل' }, { id: 'pos', label: 'الكاشير', icon: Monitor, group: 'التشغيل' }, { id: 'products', label: 'المنتجات والمخزون', icon: Boxes, group: 'المتجر' }, { id: 'store', label: 'المتجر والفروع', icon: Store, group: 'المتجر' }, { id: 'team', label: 'الفريق والصلاحيات', icon: Users, group: 'المتجر' }, { id: 'finance', label: 'المالية', icon: Wallet, group: 'التحليل' }, { id: 'reports', label: 'التقارير', icon: ChartNoAxesCombined, group: 'التحليل' }];

function App() {
  const [session, setSession] = React.useState<Session | null>(null);
  const [authReady, setAuthReady] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [merchants, setMerchants] = React.useState<Merchant[]>([]);
  const [merchantId, setMerchantId] = React.useState('');
  const [branchId, setBranchId] = React.useState('');
  const [workspace, setWorkspace] = React.useState<Workspace | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState<Page>('overview');
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [activeOrder, setActiveOrder] = React.useState<Order | null>(null);
  const [orderDetails, setOrderDetails] = React.useState<OrderDetails | null>(null);
  const [orderDetailsError, setOrderDetailsError] = React.useState('');
  const [orderDetailsLoading, setOrderDetailsLoading] = React.useState(false);
  const orderRequest = React.useRef(0);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [advancing, setAdvancing] = React.useState(false);
  const [analytics, setAnalytics] = React.useState<PartnerAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = React.useState(false);
  const [analyticsError, setAnalyticsError] = React.useState('');
  const [reportRange, setReportRange] = React.useState(30);
  const [analyticsVersion, setAnalyticsVersion] = React.useState(0);
  React.useEffect(() => { orderRequest.current += 1; setActiveOrder(null); setOrderDetails(null); setMoreOpen(false); }, [merchantId, branchId]);

  React.useEffect(() => {
    if (!db) { setAuthReady(true); return; }
    db.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!db || !session) { setMerchants([]); setMerchantId(''); setWorkspace(null); return; }
    let live = true;
    setLoading(true);
    db.rpc('get_my_partner_portal_identity_v2').then(({ data, error: failure }) => {
      if (!live) return;
      if (failure) setError(failure.message);
      else { const list = ((data?.memberships || []) as Array<{ merchant_id: string; merchant_name: string; merchant_status: string; role: string }>).map(m => ({ id: m.merchant_id, name: m.merchant_name, status: m.merchant_status, role: m.role })); setMerchants(list); setMerchantId(prev => list.some(m => m.id === prev) ? prev : (list[0]?.id || '')); }
      setLoading(false);
    });
    return () => { live = false; };
  }, [session?.user.id]);

  const refresh = React.useCallback(async (merchant: string, branch: string) => {
    if (!db || !merchant) return;
    setLoading(true); setError('');
    const { data, error: failure } = await db.rpc('get_partner_portal_workspace_v2', { p_merchant_id: merchant, p_branch_id: branch || null });
    if (failure) setError(failure.message);
    else {
      const raw = data as { identity: { role: string; branch_id: string; capabilities?: { can_use_pos?: boolean } }; merchant: { name: string }; branch: { pos_enabled?: boolean }; branches: Branch[]; products: Array<Product & { listing_id: string }>; orders: Order[]; summary: { finance?: { unsettled_balance: number } | null }; settlements?: Settlement[] | null };
      const branchIdFromServer = raw.identity.branch_id;
      const queue = await db.rpc('get_my_partner_order_queue_v1', { p_merchant_id: merchant, p_branch_id: branchIdFromServer, p_limit: 60 });
      if (queue.error) setError(queue.error.message);
      else {
        const fromWorkspace = new Map(raw.orders.map(o => [o.id, o]));
        const orders = ((queue.data || []) as Order[]).map(o => ({ ...o, items: fromWorkspace.get(o.id)?.items || [] }));
        const result: Workspace = { pos_enabled: !!raw.branch.pos_enabled, can_use_pos: !!raw.identity.capabilities?.can_use_pos, merchant_id: merchant, merchant_name: raw.merchant.name, role: raw.identity.role, selected_branch_id: branchIdFromServer, branches: raw.branches, products: raw.products.map(p => ({ ...p, id: p.listing_id })), orders, finance: { unsettled_balance: raw.summary.finance?.unsettled_balance || 0, recent_settlements: raw.settlements || [] } };
        setWorkspace(result); setBranchId(result.selected_branch_id); setAnalytics(null); setAnalyticsVersion(v => v + 1); if (!['owner','admin','manager'].includes(result.role)) setPage('overview');
      }
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { if (merchantId) { setWorkspace(null); setBranchId(''); void refresh(merchantId, ''); } }, [merchantId, refresh]);
  const selectBranch = (id: string) => { setBranchId(id); void refresh(merchantId, id); };
  const analyticsNeeded = page === 'pos' || page === 'reports';
  React.useEffect(() => {
    if (!db || !analyticsNeeded || !workspace || !['owner','admin','manager'].includes(workspace.role)) return;
    let live = true;
    setAnalyticsLoading(true); setAnalyticsError('');
    const to = new Date();
    const from = new Date(to.getTime() - reportRange * 86400000);
    db.rpc('get_my_partner_analytics_v1', { p_merchant_id: workspace.merchant_id, p_branch_id: workspace.selected_branch_id, p_from: from.toISOString(), p_to: to.toISOString() }).then(({ data, error: failure }) => {
      if (!live) return;
      if (failure) setAnalyticsError(failure.message);
      else setAnalytics(data as PartnerAnalytics);
      setAnalyticsLoading(false);
    });
    return () => { live = false; };
  }, [analyticsNeeded, workspace?.merchant_id, workspace?.selected_branch_id, reportRange, analyticsVersion]);
  const reportProps = { data: analytics, loading: analyticsLoading, error: analyticsError, range: reportRange, onRange: (days: number) => { setReportRange(days); setAnalytics(null); }, onRetry: () => setAnalyticsVersion(v => v + 1), branchName: workspace?.branches.find(b => b.id === branchId)?.name || '', posEnabled: !!workspace?.pos_enabled, canUsePos: !!workspace?.can_use_pos };


  async function signIn(e: React.FormEvent) {
    e.preventDefault(); if (!db) return;
    setBusy(true); setError('');
    const { error: failure } = await db.auth.signInWithPassword({ email, password });
    if (failure) setError('تعذر تسجيل الدخول. تأكد من البريد الإلكتروني وكلمة المرور.');
    setBusy(false);
  }

  async function advance(order: Order) {
    const next = nextStatus[order.status]; if (!db || !next || advancing) return;
    setAdvancing(true); setError(''); setNotice('');
    const { error: failure } = await db.rpc('transition_my_partner_order_v1', { p_merchant_id: merchantId, p_branch_id: branchId, p_order_id: order.id, p_action: next.status });
    if (failure) { setError(failure.message === 'PARTNER_ORDER_STATUS_CHANGED' ? 'حالة الطلب اتغيرت. حدّث الصفحة وحاول مرة تانية.' : failure.message); await refresh(merchantId, branchId); }
    else { setNotice('تم تحديث حالة الطلب بنجاح'); setActiveOrder(null); await refresh(merchantId, branchId); }
    setAdvancing(false);
  }

  if (!authReady) return <div className="splash"><div className="spinner"/> جاري التحميل...</div>;
  if (!db) return <div className="setup"><CircleAlert size={32}/><h2>الربط غير مضبوط</h2><p>أضف عنوان Supabase والمفتاح العام إلى ملف .env.local ثم أعد تشغيل التطبيق.</p></div>;
  if (!session) return <main className="login-screen"><div className="login-art"><img className="login-logo" src="/elmadawy-logo.png" alt="المعداوي ماركت"/><span className="eyebrow">منظومة شركاء المعداوي</span><h1>كل شغلك،<br/>في مكان واحد.</h1><p>تابع طلباتك، جهز المنتجات، واطّلع على مستحقاتك بوضوح.</p><div className="art-chips"><span><PackageCheck size={17}/> إدارة الطلبات</span><span><Wallet size={17}/> متابعة المستحقات</span></div><div className="art-circle circle-one"/><div className="art-circle circle-two"/></div><div className="login-panel"><div className="login-card"><span className="mobile-brand">شركاء المعداوي</span><span className="eyebrow green">أهلًا بيك من جديد</span><h2>تسجيل الدخول</h2><p className="muted">ادخل بيانات حساب الشريك عشان تبدأ يومك.</p><form onSubmit={signIn}><label>البريد الإلكتروني<input dir="ltr" type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required/></label><label>كلمة المرور<input dir="ltr" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required/></label>{error && <div className="alert">{error}</div>}<button className="primary full" disabled={busy}>{busy ? 'جاري الدخول...' : 'دخول إلى لوحة الشريك'} <ArrowLeft size={18}/></button></form><p className="login-help">للحصول على حساب أو استعادة الوصول، تواصل مع إدارة المعداوي.</p></div></div></main>;

  const orders = workspace?.orders || [];
  const products = workspace?.products || [];
  const pending = orders.filter(o => o.status === 'pending').length;
  const inProgress = orders.filter(o => ['confirmed', 'preparing'].includes(o.status)).length;
  const ready = orders.filter(o => o.status === 'ready').length;
  const filteredOrders = orders.filter(o => (statusFilter === 'all' || o.status === statusFilter) && (!query || `${o.id} ${o.tracking_number||''} ${o.customer_name||''}`.toLocaleLowerCase('ar').includes(query.toLocaleLowerCase('ar'))));
  const pageTitle = nav.find(n => n.id === page)?.label || 'نظرة عامة';
  const visibleNav = nav.filter(n => (n.id !== 'finance' || ['owner','admin'].includes(workspace?.role || '')) && (!['pos','reports','products','store'].includes(n.id) || ['owner','admin','manager'].includes(workspace?.role || '')) && (n.id !== 'team' || ['owner','admin','manager'].includes(workspace?.role || '')));
  const changePage = (id: Page) => { setPage(id); setMoreOpen(false); setQuery(''); setStatusFilter('all'); };
  async function openOrder(order: Order) { const request=++orderRequest.current; setActiveOrder(order); setOrderDetails(null); setOrderDetailsError(''); setOrderDetailsLoading(true); const { data, error: failure } = await db!.rpc('get_my_partner_order_details_v1', { p_merchant_id: merchantId, p_branch_id: branchId, p_order_id: order.id }); if (request===orderRequest.current) { if (failure) setOrderDetailsError(failure.message); else setOrderDetails(data as OrderDetails); setOrderDetailsLoading(false); } }

  return <div className="app-shell"><aside className="sidebar"><div className="sidebar-brand"><img className="sidebar-logo" src="/elmadawy-logo.png" alt="شعار المعداوي"/><div><strong>شركاء المعداوي</strong><span>لوحة إدارة الشريك</span></div></div><nav className="desktop-nav">{['البداية','التشغيل','المتجر','التحليل'].map(group => <div className="nav-group" key={group}><div className="sidebar-caption">{group}</div>{visibleNav.filter(n => n.group === group).map(n => <button key={n.id} className={`nav-item ${page === n.id ? 'selected' : ''}`} onClick={() => changePage(n.id)}><n.icon size={20}/>{n.label}{n.id === 'orders' && pending > 0 && <em>{pending}</em>}</button>)}</div>)}</nav><nav className="mobile-nav">{visibleNav.filter(n => ['overview','orders','pos','products'].includes(n.id)).map(n => <button key={n.id} className={`nav-item ${page === n.id ? 'selected' : ''}`} onClick={() => changePage(n.id)}><n.icon size={20}/><span>{n.id === 'products' ? 'المنتجات' : n.label}</span></button>)}<button className={`nav-item ${moreOpen || !['overview','orders','pos','products'].includes(page) ? 'selected' : ''}`} onClick={() => setMoreOpen(v => !v)}><Menu size={20}/><span>المزيد</span></button></nav><div className="sidebar-bottom"><button className="logout" onClick={() => void db.auth.signOut()}><LogOut size={18}/> تسجيل الخروج</button></div></aside>{moreOpen&&<div className="mobile-more" role="dialog" aria-label="بقية الصفحات"><div className="mobile-more-head"><strong>صفحات الشريك</strong><button onClick={() => setMoreOpen(false)}>إغلاق</button></div>{visibleNav.filter(n => !['overview','orders','pos','products'].includes(n.id)).map(n => <button key={n.id} onClick={() => changePage(n.id)}><n.icon size={18}/>{n.label}</button>)}<button onClick={() => void db.auth.signOut()}><LogOut size={18}/> تسجيل الخروج</button></div>}
    <div className="main-area"><header className="topbar"><div className="crumb">شركاء المعداوي <span>/</span> <b>{pageTitle}</b></div><div className="top-actions"><button className="icon-button" title="تحديث البيانات" onClick={() => void refresh(merchantId, branchId)} disabled={loading}><RefreshCw size={19} className={loading ? 'spin' : ''}/></button><div className="top-divider"/><Bell size={20} color="#6d8276"/><div className="avatar">{(session.user.email || 'ش').slice(0, 1).toUpperCase()}</div></div></header>
    <main className="content"><div className="heading-row"><div><span className="eyebrow green">مساحة الشريك</span><h1>{page === 'overview' ? `أهلًا، ${workspace?.merchant_name || merchants.find(m => m.id === merchantId)?.name || 'شريكنا'} 👋` : pageTitle}</h1><p className="muted">{page === 'overview' ? 'دي آخر المستجدات في متجرك النهارده.' : page === 'orders' ? 'تابع طلباتك وحدّث مراحل تجهيزها.' : page === 'delivery' ? 'حالة الطلبات الجاهزة والخارجة للتوصيل.' : page === 'products' ? 'المنتجات والأسعار ومخزون الفرع.' : page === 'pos' ? 'إدارة جهاز الكاشير والوردية والبيع.' : page === 'reports' ? 'تحليل مبيعات الفرع والمنتجات والمخزون.' : page === 'team' ? 'أعضاء متجرك ودعواتهم.' : page === 'store' ? 'بيانات المتجر وإعدادات الفرع.' : 'متابعة المستحقات والتسويات المالية.'}</p></div><div className="selectors"><label className="select-wrap"><Store size={17}/><select aria-label="الشريك" value={merchantId} onChange={e => setMerchantId(e.target.value)}>{merchants.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><ChevronDown size={15}/></label>{workspace && <label className="select-wrap"><select aria-label="الفرع" value={branchId} onChange={e => selectBranch(e.target.value)}>{workspace.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><ChevronDown size={15}/></label>}</div></div>
    {error && <div className="alert wide"><CircleAlert size={18}/>{error}<button onClick={() => setError('')}>إغلاق</button></div>}{notice && <div className="notice"><Check size={18}/>{notice}<button onClick={() => setNotice('')}>إغلاق</button></div>}
    {loading && !workspace ? <div className="empty"><div className="spinner"/> جاري تحميل بيانات الشريك...</div> : !merchants.length ? <div className="empty"><Store size={40}/><h3>لا يوجد متجر متاح لهذا الحساب</h3><p>اطلب من إدارة المعداوي تفعيل حساب الشريك وربطه بمتجر وفرع نشط.</p></div> : !workspace ? <div className="empty"><button className="primary" onClick={() => void refresh(merchantId, branchId)}>إعادة المحاولة</button></div> : <>
      {page === 'overview' && <><div className="hero"><div><span className="hero-kicker"><span className="live-dot"/> متجرك شغّال</span><h2>طلباتك تحت السيطرة</h2><p>تابع كل طلب أول بأول، وجهّزه عشان يوصل للعميل في أسرع وقت.</p><button onClick={() => changePage('orders')}>عرض الطلبات <ArrowLeft size={17}/></button></div><div className="hero-illustration"><span className="orbit orbit-one"/><span className="orbit orbit-two"/><div className="hero-icon"><ShoppingBag size={66} strokeWidth={1.5}/></div><div className="floating-tag"><Check size={15}/> إدارة أسهل، إنجاز أسرع</div></div></div>
      <div className="stats"><Stat icon={ShoppingBag} color="orange" label="طلبات جديدة" value={pending} detail="بانتظار تأكيدك"/><Stat icon={Clock3} color="blue" label="قيد التجهيز" value={inProgress} detail="طلبات شغالة دلوقتي"/><Stat icon={PackageCheck} color="green" label="جاهزة للاستلام" value={ready} detail="بانتظار التوصيل"/>{['owner','admin'].includes(workspace.role) && <Stat icon={Wallet} color="purple" label="الرصيد غير المسوّى" value={currency(workspace.finance.unsettled_balance)} detail="وفق السجل المالي"/>}</div>
      <div className="section-head"><div><span className="eyebrow green">متابعة يومية</span><h2>أحدث الطلبات</h2></div><button className="text-link" onClick={() => changePage('orders')}>كل الطلبات <ArrowLeft size={17}/></button></div><OrdersTable orders={orders.slice(0, 6)} open={o => void openOrder(o)}/></>}
      {page === 'orders' && <><div className="stat-strip"><span><b>{orders.length}</b> إجمالي الطلبات المعروضة</span><span><b>{pending}</b> جديدة</span><span><b>{inProgress}</b> قيد التجهيز</span><span><b>{ready}</b> جاهزة</span></div><div className="table-toolbar"><div className="search"><Search size={19}/><input placeholder="ابحث برقم الطلب أو اسم العميل..." value={query} onChange={e => setQuery(e.target.value)}/></div><select className="filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">كل الحالات</option>{Object.entries(statusLabel).filter(([k]) => ['pending','confirmed','preparing','ready','shipped','delivered','cancelled'].includes(k)).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div><OrdersTable orders={filteredOrders} open={o => void openOrder(o)}/><p className="footnote">يظهر آخر ٦٠ طلبًا من الفرع. تحديثات التوصيل تتم من نظام المعداوي الأساسي.</p></>}
      {page === 'delivery' && <DeliveryPage orders={orders} onOpen={id => { const o=orders.find(o=>o.id===id); if(o)void openOrder(o); }}/>}
      {page === 'pos' && <PartnerPOS key={`${branchId}:${session.user.id}`} db={db} userId={session.user.id} branchId={branchId} branchName={reportProps.branchName} enabled={!!workspace.pos_enabled} role={workspace.role} onSale={() => { setAnalyticsVersion(v => v + 1); void refresh(merchantId, branchId); }}/>}
      {page === 'reports' && <><ReportsDashboard {...reportProps}/><div className="section-head report-pos-head"><div><span className="eyebrow green">داخل الفرع</span><h2>تفصيل نقطة البيع</h2></div></div><PosDashboard {...reportProps}/></>}
      {page === 'products' && <ProductsPage key={`${merchantId}:${branchId}`} db={db} merchantId={merchantId} branchId={branchId} products={products} onSaved={() => void refresh(merchantId,branchId)}/>}
      {page === 'store' && <StorePage key={`${merchantId}:${branchId}`} db={db} merchantId={merchantId} branchId={branchId}/>}
      {page === 'team' && <TeamPage key={merchantId} db={db} merchantId={merchantId} branchId={branchId}/>}
      {page === 'finance' && <FinancePage key={merchantId} db={db} merchantId={merchantId} branchId={branchId} settlements={workspace.finance.recent_settlements}/>}
    </>}</main></div>
    {activeOrder && <div className="modal-backdrop" onMouseDown={() => setActiveOrder(null)}><section className="modal" role="dialog" aria-modal="true" aria-label="تفاصيل الطلب" onMouseDown={e => e.stopPropagation()}><div className="modal-top"><div><span className="eyebrow green">تفاصيل الطلب</span><h2>طلب #{orderDetails?.tracking_number||activeOrder.tracking_number||shortId(activeOrder.id)}</h2></div><button className="icon-button" onClick={() => setActiveOrder(null)} aria-label="إغلاق">✕</button></div>{orderDetailsLoading&&<div className="partner-state"><RefreshCw size={17} className="spin"/>جاري تحميل التفاصيل...</div>}{orderDetailsError&&<div className="partner-error">{orderDetailsError}</div>}<div className="modal-meta"><span className={`badge ${orderDetails?.status||activeOrder.status}`}>{statusLabel[orderDetails?.status||activeOrder.status] || orderDetails?.status||activeOrder.status}</span><span>{date(activeOrder.created_at)}</span></div>{(orderDetails?.customer?.name||activeOrder.customer_name)&&<div className="modal-line"><span>العميل</span><strong>{orderDetails?.customer?.name||activeOrder.customer_name} {orderDetails?.customer?.phone ? `· ${orderDetails.customer.phone}` : ''}</strong></div>}{(orderDetails?.shipping?.address||activeOrder.shipping_address)&&<div className="modal-line"><span>عنوان التوصيل</span><strong>{orderDetails?.shipping?.address||activeOrder.shipping_address}</strong></div>}<div className="modal-line"><span>الإجمالي</span><strong>{currency(orderDetails?.total??activeOrder.total)}</strong></div><div className="modal-line"><span>طريقة الدفع</span><strong>{orderDetails?.payment_method || activeOrder.payment_method || '—'}</strong></div><div className="modal-line"><span>حالة الدفع</span><strong>{orderDetails?.payment_status || activeOrder.payment_status || '—'}</strong></div>{orderDetails?.notes&&<p className="partner-hint">ملاحظات: {orderDetails.notes}</p>}<h3>المنتجات</h3><div className="items-list">{Array.isArray(orderDetails?.items||activeOrder.items) ? ((orderDetails?.items||activeOrder.items) as Record<string, unknown>[]).map((item, i) => <div key={i}><span>{String(item.name || item.product_name || 'منتج')} <small>× {String(item.quantity || 1)}</small></span><strong>{item.price != null ? currency(Number(item.price) * Number(item.quantity || 1)) : '—'}</strong></div>) : <p className="muted">تفاصيل المنتجات غير متاحة.</p>}</div>{orderDetails?.history?.length ? <><h3>سجل الحالة</h3><div className="order-timeline">{orderDetails.history.map((h,i)=><div key={i}><span>{statusLabel[h.new_status]||h.new_status}</span><small>{date(h.created_at)}</small></div>)}</div></> : null}{nextStatus[orderDetails?.status||activeOrder.status] && <button className="primary full" disabled={advancing} onClick={() => void advance(orderDetails||activeOrder)}>{advancing ? 'جاري التحديث...' : nextStatus[orderDetails?.status||activeOrder.status].label} <ArrowLeft size={18}/></button>}<p className="modal-note">متابعة التوصيل تظهر في صفحة التوصيل بعد التجهيز.</p></section></div>}
  </div>;
}

function Stat({ icon: Icon, color, label, value, detail }: { icon: typeof ShoppingBag; color: string; label: string; value: number | string; detail: string }) { return <div className="stat-card"><span className={`stat-icon ${color}`}><Icon size={22}/></span><span className="stat-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function EmptyRow({ text }: { text: string }) { return <div className="empty-row"><ShoppingBag size={30}/><span>{text}</span></div>; }
function OrdersTable({ orders, open }: { orders: Order[]; open: (order: Order) => void }) { return <div className="table-card"><div className="table-scroll"><table><thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{orders.map(o => <tr key={o.id}><td className="order-id">#{shortId(o.id)}</td><td>{date(o.created_at)}</td><td><strong>{currency(o.total)}</strong></td><td><span className={`badge ${o.status}`}>{statusLabel[o.status] || o.status}</span></td><td><button className="row-action" onClick={() => open(o)} aria-label={`عرض الطلب ${shortId(o.id)}`}><ArrowUpLeft size={18}/></button></td></tr>)}</tbody></table></div>{!orders.length && <EmptyRow text="مافيش طلبات هنا لسه"/>}</div>; }

export default App;
