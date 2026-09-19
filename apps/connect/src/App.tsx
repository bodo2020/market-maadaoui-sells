import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BellRing,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Facebook,
  Headphones,
  Instagram,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MessageCircle,
  MessageSquareText,
  Radio,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';
import { supabase } from './lib/supabase';

type Identity = {
  user_id: string;
  name?: string | null;
  username?: string | null;
  is_super_admin?: boolean | null;
};

type BranchAccess = {
  branch_id: string;
  branch_name: string;
  role_name_ar?: string | null;
  permissions?: string[] | null;
};

type SessionState = {
  identity: Identity;
  branches: BranchAccess[];
  selectedBranch: BranchAccess;
};

type ViewKey = 'overview' | 'inbox' | 'media' | 'analytics' | 'settings';

const channels = [
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, tone: 'green', status: 'بانتظار الربط' },
  { key: 'messenger', label: 'Messenger', icon: Facebook, tone: 'blue', status: 'بانتظار الربط' },
  { key: 'instagram', label: 'Instagram', icon: Instagram, tone: 'pink', status: 'بانتظار الربط' },
  { key: 'tiktok', label: 'TikTok', icon: Video, tone: 'dark', status: 'بانتظار الربط' },
];

const navItems: Array<{ key: ViewKey; label: string; icon: typeof LayoutDashboard; permission?: string }> = [
  { key: 'overview', label: 'الرئيسية', icon: LayoutDashboard },
  { key: 'inbox', label: 'صندوق الرسائل', icon: Headphones, permission: 'social.inbox.view' },
  { key: 'media', label: 'الميديا والمحتوى', icon: Radio, permission: 'social.media.view' },
  { key: 'analytics', label: 'التحليلات', icon: BarChart3, permission: 'social.analytics.view' },
  { key: 'settings', label: 'القنوات والإعدادات', icon: Settings, permission: 'social.accounts.manage' },
];

async function invokeError(error: unknown, fallback: string) {
  try {
    const candidate = error as { context?: { json?: () => Promise<{ error?: string; message?: string }> } };
    if (candidate?.context && typeof candidate.context.json === 'function') {
      const payload = await candidate.context.json();
      return payload?.error || payload?.message || fallback;
    }
  } catch {
    // Keep the safe fallback.
  }
  return fallback;
}

function Login({ onReady }: { onReady: (state: SessionState) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!identifier.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('growth-login', {
        body: { identifier: identifier.trim(), password },
      });
      if (invokeErr) throw new Error(await invokeError(invokeErr, 'تعذر تسجيل الدخول.'));
      if (!data?.session?.access_token || !data?.session?.refresh_token) throw new Error(data?.error || 'تعذر تسجيل الدخول.');
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (setSessionError) throw setSessionError;
      const state = await loadStaffState();
      onReady(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page" dir="rtl">
      <section className="login-card">
        <div className="brand-mark">م</div>
        <div className="brand-copy">
          <strong>المعداوي Connect</strong>
          <span>خدمة العملاء والسوشيال ميديا</span>
        </div>
        <div className="login-title">
          <h1>أهلًا بفريق المعداوي</h1>
          <p>نفس حساب الموظف الحالي. الوصول حسب الفرع والصلاحيات.</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <label>
            اسم المستخدم أو البريد
            <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" />
          </label>
          <label>
            كلمة المرور
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-btn" type="submit" disabled={busy || !identifier.trim() || !password}>
            {busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}
            دخول التطبيق
          </button>
        </form>
        <div className="security-note"><ShieldCheck size={16} /> البيانات والصلاحيات تُراجع من السيرفر لكل فرع.</div>
      </section>
    </main>
  );
}

async function loadStaffState(): Promise<SessionState> {
  const [{ data: identity, error: identityError }, { data: branches, error: branchError }] = await Promise.all([
    supabase.rpc('get_my_staff_identity'),
    supabase.rpc('get_my_staff_branches'),
  ]);
  if (identityError || !identity?.user_id) throw new Error(identityError?.message || 'تعذر تحميل هوية الموظف.');
  if (branchError || !Array.isArray(branches) || !branches.length) throw new Error(branchError?.message || 'لا يوجد فرع متاح لهذا الحساب.');

  const stored = localStorage.getItem('elmadawyConnectBranchId');
  const selected = branches.find((branch: BranchAccess) => branch.branch_id === stored) || branches[0];
  localStorage.setItem('elmadawyConnectBranchId', selected.branch_id);
  return { identity, branches, selectedBranch: selected } as SessionState;
}

function hasPermission(session: SessionState, code?: string) {
  if (!code) return true;
  if (session.identity.is_super_admin) return true;
  return (session.selectedBranch.permissions || []).includes(code);
}

function hasConnectAccess(session: SessionState) {
  if (session.identity.is_super_admin) return true;
  const permissions = session.selectedBranch.permissions || [];
  return permissions.includes('social.access') || permissions.some((permission) => permission.startsWith('social.'));
}

function AppShell({ session, setSession }: { session: SessionState; setSession: (state: SessionState | null) => void }) {
  const [view, setView] = useState<ViewKey>('overview');
  const [search, setSearch] = useState('');
  const visibleNav = useMemo(() => navItems.filter((item) => hasPermission(session, item.permission)), [session]);

  const chooseBranch = (branchId: string) => {
    const selected = session.branches.find((branch) => branch.branch_id === branchId);
    if (!selected) return;
    localStorage.setItem('elmadawyConnectBranchId', selected.branch_id);
    setSession({ ...session, selectedBranch: selected });
    setView('overview');
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (!hasConnectAccess(session)) {
    return (
      <main className="denied-page" dir="rtl">
        <div className="denied-card">
          <ShieldCheck size={42} />
          <h2>الحساب غير مضاف إلى المعداوي Connect</h2>
          <p>اطلب من مدير النظام إضافة صلاحية <b>social.access</b> أو صلاحية مناسبة لخدمة العملاء أو الميديا.</p>
          <button className="secondary-btn" onClick={logout}><LogOut size={17} />تسجيل الخروج</button>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell" dir="rtl">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small">م</div>
          <div><strong>المعداوي Connect</strong><span>Customer & Social</span></div>
        </div>
        <nav>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={view === item.key ? 'nav-item active' : 'nav-item'} onClick={() => setView(item.key)}>
                <Icon size={19} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="agent-chip">
            <div className="avatar">{(session.identity.name || 'م').slice(0, 1)}</div>
            <div><b>{session.identity.name || session.identity.username || 'موظف'}</b><span>{session.selectedBranch.role_name_ar || 'فريق Connect'}</span></div>
          </div>
          <button className="icon-btn" onClick={logout} title="تسجيل الخروج"><LogOut size={18} /></button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="branch-select-wrap">
            <span>الفرع</span>
            <div className="select-shell"><select value={session.selectedBranch.branch_id} onChange={(event) => chooseBranch(event.target.value)}>{session.branches.map((branch) => <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>)}</select><ChevronDown size={16} /></div>
          </div>
          <div className="topbar-search"><Search size={17} /><input placeholder="ابحث عن عميل، محادثة، حملة..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <div className="topbar-actions"><span className="live-pill"><span />Connect M1</span><button className="icon-btn"><BellRing size={19} /></button></div>
        </header>

        <main className="content">
          {view === 'overview' && <Overview session={session} />}
          {view === 'inbox' && <Inbox />}
          {view === 'media' && <MediaStudio />}
          {view === 'analytics' && <Analytics />}
          {view === 'settings' && <ChannelSettings />}
        </main>
      </section>
    </div>
  );
}

function Overview({ session }: { session: SessionState }) {
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">ELMADAWY CONNECT</span><h1>مركز خدمة العملاء والسوشيال</h1><p>الأساس جاهز. القنوات هتبدأ تستقبل المحادثات أول ما نوصل Chatwoot على السيرفر.</p></div><button className="primary-btn"><Sparkles size={17} />AI Copilot قريبًا</button></div>
      <div className="stats-grid">
        <Stat label="محادثات مفتوحة" value="0" icon={MessageSquareText} hint="سيظهر بعد الربط" />
        <Stat label="بانتظار الرد" value="0" icon={Headphones} hint="SLA سيُفعل مع Chatwoot" />
        <Stat label="قنوات متصلة" value="0 / 4" icon={Radio} hint="WhatsApp أول قناة" />
        <Stat label="الفريق المتاح" value="—" icon={Users} hint={session.selectedBranch.branch_name} />
      </div>
      <section className="panel">
        <div className="panel-title"><div><h2>حالة القنوات</h2><p>كل قناة هتدخل نفس صندوق الرسائل الموحد.</p></div><span className="badge muted">Foundation</span></div>
        <div className="channel-grid">{channels.map(({ key, label, icon: Icon, tone, status }) => <div className="channel-card" key={key}><div className={`channel-icon ${tone}`}><Icon size={22} /></div><div><b>{label}</b><span>{status}</span></div><div className="status-dot pending" /></div>)}</div>
      </section>
      <div className="two-col">
        <section className="panel roadmap-panel"><div className="panel-title"><div><h2>رحلة التنفيذ</h2><p>بنجهز التطبيق قبل توصيل السيرفر.</p></div></div>{['Staff Auth + Branch Permissions','Unified Inbox UI','Chatwoot Self-hosted','WhatsApp','Messenger + Instagram','TikTok','CRM + Orders','AI Suggested Replies'].map((item, index) => <div className="roadmap-row" key={item}><span className={index < 2 ? 'step done' : 'step'}>{index < 2 ? <CheckCircle2 size={15} /> : index + 1}</span><b>{item}</b><span>{index < 2 ? 'جاهز/قيد التنفيذ' : 'التالي'}</span></div>)}</section>
        <section className="panel"><div className="panel-title"><div><h2>قواعد التشغيل</h2><p>النسخة الأولى آمنة ومتحكم فيها.</p></div></div><ul className="rules"><li><ShieldCheck />لا يوجد Auto Reply في M1.</li><li><ShieldCheck />لا نشر محتوى تلقائي.</li><li><ShieldCheck />كل الصلاحيات على مستوى الفرع.</li><li><ShieldCheck />مفاتيح Meta/TikTok/Chatwoot لن تدخل التطبيق.</li><li><ShieldCheck />أي إجراء حساس لاحقًا يمر عبر تأكيد بشري.</li></ul></section>
      </div>
    </>
  );
}

function Stat({ label, value, icon: Icon, hint }: { label: string; value: string; icon: typeof MessageCircle; hint: string }) {
  return <div className="stat-card"><div className="stat-icon"><Icon size={21} /></div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></div>;
}

function Inbox() {
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">UNIFIED INBOX</span><h1>صندوق الرسائل</h1><p>WhatsApp وMessenger وInstagram وTikTok في شاشة واحدة.</p></div><button className="secondary-btn"><CircleHelp size={17} />طريقة العمل</button></div>
      <section className="inbox-shell">
        <aside className="conversation-list"><div className="inbox-filter"><Search size={16} /><input placeholder="بحث في المحادثات" /></div><div className="empty-mini"><MessageSquareText size={31} /><b>مفيش محادثات لسه</b><span>هتظهر هنا أول رسالة بعد ربط Chatwoot.</span></div></aside>
        <div className="conversation-view"><div className="empty-chat"><div className="empty-chat-icon"><Headphones size={34} /></div><h2>Unified Inbox جاهز للاستقبال</h2><p>المرحلة الجاية هتربط Chatwoot، وبعدها الرسائل هتدخل هنا مباشرة مع بيانات العميل والطلبات.</p><div className="mini-flow"><span>Social Channel</span><b>→</b><span>Chatwoot</span><b>→</b><span>Elmadawy Connect</span></div></div></div>
        <aside className="customer-pane"><h3>Customer 360</h3><div className="placeholder-card"><Users size={25} /><b>اختار محادثة</b><span>هنعرض العميل، آخر الطلبات، الشكاوى والـCRM هنا.</span></div></aside>
      </section>
    </>
  );
}

function MediaStudio() {
  return (
    <><div className="page-heading"><div><span className="eyebrow">MEDIA STUDIO</span><h1>الميديا والمحتوى</h1><p>تقويم المحتوى، المسودات، الموافقات والحملات في مكان واحد.</p></div><button className="primary-btn"><Sparkles size={17} />إنشاء مسودة</button></div><div className="media-grid"><section className="panel large"><div className="panel-title"><div><h2>Content Calendar</h2><p>هيظهر هنا المحتوى المجدول لكل منصة.</p></div><span className="badge muted">قريبًا M6</span></div><div className="calendar-placeholder">السبت<div>Facebook / Instagram</div>الأحد<div>TikTok / Reels</div>الاثنين<div>WhatsApp Campaign</div></div></section><section className="panel"><div className="panel-title"><div><h2>Workflow</h2><p>مفيش نشر مباشر بدون صلاحية.</p></div></div><div className="workflow"><span>Idea</span><b>→</b><span>Draft</span><b>→</b><span>Review</span><b>→</b><span>Approved</span><b>→</b><span>Publish</span></div></section></div></>
  );
}

function Analytics() {
  return (
    <><div className="page-heading"><div><span className="eyebrow">SOCIAL ANALYTICS</span><h1>تحليلات السوشيال</h1><p>مش Views بس؛ الهدف النهائي Social → Orders → Revenue.</p></div></div><div className="stats-grid"><Stat label="Reach" value="—" icon={Radio} hint="بعد ربط القنوات"/><Stat label="Conversations" value="—" icon={MessageCircle} hint="من كل المنصات"/><Stat label="Orders from Social" value="—" icon={Send} hint="بعد CRM attribution"/><Stat label="Revenue" value="—" icon={BarChart3} hint="بعد M9"/></div><section className="panel chart-placeholder"><BarChart3 size={44}/><h2>لوحة التحليلات جاهزة هيكليًا</h2><p>هتبدأ تتعبى بعد ما APIs القنوات تبعت الـmetrics والـevents.</p></section></>
  );
}

function ChannelSettings() {
  return (
    <><div className="page-heading"><div><span className="eyebrow">CONNECTIONS</span><h1>القنوات والإعدادات</h1><p>إدارة حالة الربط فقط. الـTokens والـSecrets ستبقى على السيرفر/Vault.</p></div></div><section className="panel"><div className="panel-title"><div><h2>Chatwoot Engine</h2><p>Self-hosted Community Edition</p></div><span className="badge warning">غير متصل</span></div><div className="settings-row"><div><b>Server URL</b><span>سيتم تحديده بعد إنشاء الـVPS</span></div><code>Not configured</code></div><div className="settings-row"><div><b>Webhook Gateway</b><span>Supabase Edge Function في المرحلة التالية</span></div><span className="badge muted">Pending</span></div></section><section className="panel" style={{marginTop:12}}><div className="panel-title"><div><h2>Social Channels</h2><p>مش هيتحفظ أي Secret داخل الـAPK.</p></div></div><div className="channel-grid">{channels.map(({key,label,icon:Icon,tone})=><div className="channel-card" key={key}><div className={`channel-icon ${tone}`}><Icon size={22}/></div><div><b>{label}</b><span>غير متصل</span></div><span className="badge muted">Pending</span></div>)}</div></section></>
  );
}

export default function App() {
  const [session, setSession] = useState<SessionState | null | undefined>(undefined);
  const [startupError, setStartupError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) { if (active) setSession(null); return; }
        const state = await loadStaffState();
        if (active) setSession(state);
      } catch (error) {
        if (active) { setStartupError(error instanceof Error ? error.message : 'تعذر تحميل التطبيق.'); setSession(null); }
      }
    })();
    return () => { active = false; };
  }, []);

  if (session === undefined) return <main className="loading-page"><LoaderCircle className="spin" size={32}/><span>جاري تجهيز المعداوي Connect...</span></main>;
  if (!session) return <><Login onReady={setSession}/>{startupError && <div className="global-error">{startupError}</div>}</>;
  return <AppShell session={session} setSession={setSession} />;
}
