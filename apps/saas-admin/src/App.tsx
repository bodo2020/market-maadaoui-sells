import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchIdentity, signInStaff, signOut, StaffIdentity, supabase } from './supabase';

type Dashboard = {
  summary: Record<string, number>;
  plans: any[];
  feature_catalog: any[];
  limit_catalog: any[];
  tenants: any[];
  generated_at: string;
};

type PlanDraft = {
  id?: string | null;
  code: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  is_active: boolean;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
};

const controls = [
  ['app_access_enabled', 'p_app_access_enabled', 'النظام بالكامل', 'Kill Switch'],
  ['online_sales_enabled', 'p_online_sales_enabled', 'البيع أونلاين', 'Online + Marketplace'],
  ['pos_enabled', 'p_pos_enabled', 'نقطة البيع POS', 'Sales + Shifts'],
  ['admin_enabled', 'p_admin_enabled', 'لوحة الإدارة', 'Admin workspace'],
  ['customer_app_enabled', 'p_customer_app_enabled', 'تطبيق العميل', 'Customer App'],
  ['delivery_enabled', 'p_delivery_enabled', 'التوصيل', 'Delivery App'],
] as const;

const statusLabels: Record<string, string> = {
  legacy_unmanaged: 'غير مُدار', trial: 'تجريبي', active: 'نشط', past_due: 'متأخر دفع',
  suspended: 'موقوف', cancelled: 'ملغي', expired: 'منتهي',
};

async function rpc(name: string, args?: Record<string, unknown>) {
  const { data, error } = await (supabase.rpc as any)(name, args || {});
  if (error) throw new Error(error.message || 'تعذر تنفيذ العملية.');
  return data;
}

function money(value: number, currency = 'EGP') {
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value || 0));
}

function date(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(value));
}

function StatusBadge({ value }: { value?: string | null }) {
  const v = value || 'legacy_unmanaged';
  return <span className={`badge badge-${v}`}>{statusLabels[v] || v}</span>;
}

function Usage({ label, metric }: { label: string; metric?: { used?: number; limit?: number | null } }) {
  const used = Number(metric?.used || 0);
  const limit = metric?.limit == null ? null : Number(metric.limit);
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return <div className="usage-item"><div className="usage-row"><span>{label}</span><b>{used.toLocaleString('ar-EG')} / {limit == null ? '∞' : limit.toLocaleString('ar-EG')}</b></div>{limit != null && <div className="progress"><i style={{ width: `${pct}%` }} /></div>}</div>;
}

function PlanEditor({ initial, dashboard, onClose, onSave }: { initial?: any; dashboard: Dashboard; onClose: () => void; onSave: (draft: PlanDraft) => Promise<void> }) {
  const makeFeatures = () => Object.fromEntries(dashboard.feature_catalog.map((f) => [f.feature_key, initial?.features?.[f.feature_key] ?? false]));
  const makeLimits = () => Object.fromEntries(dashboard.limit_catalog.map((l) => [l.limit_key, initial?.limits?.[l.limit_key] ?? null]));
  const [draft, setDraft] = useState<PlanDraft>({
    id: initial?.id || null, code: initial?.code || '', name_ar: initial?.name_ar || '', name_en: initial?.name_en || '',
    description_ar: initial?.description_ar || '', monthly_price: Number(initial?.monthly_price || 0), yearly_price: Number(initial?.yearly_price || 0),
    currency: initial?.currency || 'EGP', is_active: initial?.is_active ?? true, features: makeFeatures(), limits: makeLimits(),
  });
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setSaving(true); try { await onSave(draft); onClose(); } finally { setSaving(false); } };
  return <div className="overlay"><form className="modal" onSubmit={submit}>
    <div className="modal-head"><div><small>SAAS PLAN</small><h2>{initial ? 'تعديل الباقة' : 'إنشاء باقة جديدة'}</h2></div><button type="button" className="icon-btn" onClick={onClose}>×</button></div>
    <div className="form-grid"><label>كود الباقة<input required disabled={!!initial} value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></label><label>الاسم العربي<input required value={draft.name_ar} onChange={e => setDraft({ ...draft, name_ar: e.target.value })} /></label><label>السعر الشهري<input type="number" min="0" value={draft.monthly_price} onChange={e => setDraft({ ...draft, monthly_price: Number(e.target.value) })} /></label><label>السعر السنوي<input type="number" min="0" value={draft.yearly_price} onChange={e => setDraft({ ...draft, yearly_price: Number(e.target.value) })} /></label></div>
    <label>الوصف<textarea value={draft.description_ar} onChange={e => setDraft({ ...draft, description_ar: e.target.value })} /></label>
    <h3>المميزات</h3><div className="feature-grid">{dashboard.feature_catalog.map(f => <label className="check" key={f.feature_key}><input type="checkbox" checked={!!draft.features[f.feature_key]} onChange={e => setDraft({ ...draft, features: { ...draft.features, [f.feature_key]: e.target.checked } })} /><span><b>{f.name_ar}</b><small>{f.description_ar}</small></span></label>)}</div>
    <h3>الحدود</h3><div className="form-grid">{dashboard.limit_catalog.map(l => <label key={l.limit_key}>{l.name_ar}<input type="number" min="0" placeholder="فارغ = غير محدود" value={draft.limits[l.limit_key] ?? ''} onChange={e => setDraft({ ...draft, limits: { ...draft.limits, [l.limit_key]: e.target.value === '' ? null : Number(e.target.value) } })} /></label>)}</div>
    <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>إلغاء</button><button className="btn primary" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ الباقة'}</button></div>
  </form></div>;
}

export default function App() {
  const [identity, setIdentity] = useState<StaffIdentity | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [planEditor, setPlanEditor] = useState<any | 'new' | null>(null);
  const [planChoice, setPlanChoice] = useState<Record<string, string>>({});
  const [cycleChoice, setCycleChoice] = useState<Record<string, 'monthly' | 'yearly'>>({});

  const load = useCallback(async () => {
    const data = await rpc('get_saas_control_center_v2') as Dashboard;
    setDashboard(data);
    setPlanChoice(prev => ({ ...Object.fromEntries(data.tenants.map(t => [t.tenant_id, t.subscription?.plan_id || ''])), ...prev }));
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const me = await fetchIdentity();
        if (!mounted) return;
        setIdentity(me);
        await load();
      } catch (e) {
        await supabase.auth.signOut();
        if (mounted) setError(e instanceof Error ? e.message : 'تعذر استرجاع الجلسة.');
      } finally { if (mounted) setLoading(false); }
    })();
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') { setIdentity(null); setDashboard(null); } });
    return () => { mounted = false; authListener.subscription.unsubscribe(); };
  }, [load]);

  const login = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const me = await signInStaff(username, password); setIdentity(me); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تسجيل الدخول.'); }
    finally { setBusy(false); setLoading(false); }
  };

  const refresh = async () => { setBusy(true); setError(''); try { await load(); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر التحديث.'); } finally { setBusy(false); } };

  const toggle = async (tenant: any, control: typeof controls[number]) => {
    const [key, rpcKey, label] = control;
    const next = !tenant[key];
    let reason = null; let message = null;
    if (!next) {
      reason = window.prompt(`سبب إيقاف ${label} لـ ${tenant.tenant_name}:`, `إيقاف ${label} من منصة SaaS`);
      if (reason === null) return;
      if (!reason.trim()) return alert('سبب الإيقاف مطلوب.');
      message = window.prompt('الرسالة التي ستظهر للمستخدم:', 'الخدمة متوقفة مؤقتًا بواسطة إدارة المنصة.') || reason;
    }
    setBusy(true);
    try {
      await rpc('set_tenant_platform_controls_v1', {
        p_tenant_id: tenant.tenant_id,
        p_app_access_enabled: null, p_online_sales_enabled: null, p_pos_enabled: null,
        p_admin_enabled: null, p_customer_app_enabled: null, p_delivery_enabled: null,
        [rpcKey]: next,
        p_block_reason_code: next ? null : 'manual', p_block_reason: reason, p_block_message_ar: message,
      });
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : 'تعذر تحديث الخدمة.'); } finally { setBusy(false); }
  };

  const setSubStatus = async (tenant: any, status: string) => {
    const reason = status === 'suspended' ? (window.prompt('سبب إيقاف الاشتراك:', 'إيقاف يدوي من منصة SaaS') || '') : 'استرجاع يدوي من منصة SaaS';
    if (status === 'suspended' && !reason.trim()) return;
    if (!window.confirm(`${status === 'suspended' ? 'إيقاف' : 'استرجاع'} اشتراك ${tenant.tenant_name}؟`)) return;
    setBusy(true); try { await rpc('set_tenant_subscription_status_v1', { p_tenant_id: tenant.tenant_id, p_status: status, p_reason: reason, p_grace_ends_at: null }); await load(); } catch (e) { alert(e instanceof Error ? e.message : 'تعذر تغيير الاشتراك.'); } finally { setBusy(false); }
  };

  const assignPlan = async (tenant: any) => {
    const planId = planChoice[tenant.tenant_id]; if (!planId) return alert('اختر الباقة أولًا.');
    const cycle = cycleChoice[tenant.tenant_id] || 'monthly';
    if (!window.confirm(`تعيين الباقة المختارة لـ ${tenant.tenant_name}؟`)) return;
    setBusy(true); try { await rpc('assign_tenant_subscription_v1', { p_tenant_id: tenant.tenant_id, p_plan_id: planId, p_billing_cycle: cycle, p_status: 'active', p_starts_at: null, p_ends_at: null, p_grace_days: 3, p_auto_suspend: true }); await load(); } catch (e) { alert(e instanceof Error ? e.message : 'تعذر تعيين الباقة.'); } finally { setBusy(false); }
  };

  const savePlan = async (draft: PlanDraft) => {
    await rpc('upsert_saas_plan_v1', {
      p_plan_id: draft.id || null, p_code: draft.code.trim().toLowerCase(), p_name_ar: draft.name_ar.trim(),
      p_name_en: draft.name_en.trim() || null, p_description_ar: draft.description_ar.trim() || null,
      p_monthly_price: draft.monthly_price, p_yearly_price: draft.yearly_price, p_currency: draft.currency,
      p_is_active: draft.is_active, p_features: draft.features, p_limits: draft.limits,
    });
    await load();
  };

  const summary = dashboard?.summary || {};
  const activePlans = useMemo(() => dashboard?.plans.filter(p => p.is_active) || [], [dashboard]);

  if (loading) return <div className="center-screen"><div className="spinner" /><p>جارٍ تحميل منصة SaaS…</p></div>;

  if (!identity) return <div className="login-page"><section className="login-brand"><div className="mark">م</div><div><small>ELMADAWY PLATFORM</small><h1>إدارة SaaS مستقلة</h1><p>منصة منفصلة للتحكم في العملاء والباقات والاشتراكات وإيقاف الخدمات.</p></div></section><form className="login-card" onSubmit={login}><div className="mark small">م</div><h2>دخول Super Admin</h2><p>استخدم حساب الإدارة العليا للمنصة.</p>{error && <div className="error">{error}</div>}<label>اسم المستخدم<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /></label><label>كلمة المرور<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button className="btn primary wide" disabled={busy}>{busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}</button></form></div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="mark small">م</div><div><b>Elmadawy SaaS</b><small>Control Platform</small></div></div><nav><a className="active">العملاء والاشتراكات</a><a href="#plans">الباقات</a></nav><div className="side-user"><small>Super Admin</small><b>{identity.name}</b><button onClick={() => signOut()}>تسجيل الخروج</button></div></aside>
    <main className="main">
      <header><div><small className="eyebrow">SAAS CONTROL PLANE • مستقل عن POS</small><h1>مركز التحكم في منصة SaaS</h1><p>إدارة العملاء والباقات والحدود وحالة تشغيل كل تطبيق من مكان واحد.</p></div><div className="header-actions"><button className="btn secondary" onClick={refresh} disabled={busy}>تحديث</button><button className="btn primary" onClick={() => setPlanEditor('new')}>+ باقة جديدة</button></div></header>
      {error && <div className="error">{error}</div>}
      <section className="stats"><div className="stat"><small>إجمالي العملاء</small><strong>{summary.tenant_count || 0}</strong></div><div className="stat"><small>عملاء نشطون</small><strong>{summary.active_tenant_count || 0}</strong></div><div className="stat"><small>موقوفون</small><strong>{summary.suspended_tenant_count || 0}</strong></div><div className="stat"><small>متأخرون في الدفع</small><strong>{summary.past_due_count || 0}</strong></div></section>

      <section id="plans" className="section"><div className="section-title"><div><small>PLANS</small><h2>الباقات</h2></div></div><div className="plans">{dashboard?.plans.map(plan => <article className={`plan ${plan.is_internal ? 'internal' : ''}`} key={plan.id}><div className="plan-top"><span className="badge badge-active">{plan.is_internal ? 'داخلي' : plan.code}</span>{!plan.is_internal && <button className="link-btn" onClick={() => setPlanEditor(plan)}>تعديل</button>}</div><h3>{plan.name_ar}</h3><p>{plan.description_ar || 'بدون وصف'}</p><div className="price">{money(plan.monthly_price, plan.currency)} <small>/ شهر</small></div><div className="chips">{Object.entries(plan.features || {}).filter(([, enabled]) => enabled).slice(0, 6).map(([key]) => <span key={key}>{dashboard.feature_catalog.find(f => f.feature_key === key)?.name_ar || key}</span>)}</div></article>)}</div></section>

      <section className="section"><div className="section-title"><div><small>TENANTS</small><h2>عملاء المنصة</h2></div><span>{dashboard?.tenants.length || 0} عميل</span></div><div className="tenants">{dashboard?.tenants.map(tenant => <article className="tenant" key={tenant.tenant_id}><div className="tenant-head"><div><h3>{tenant.tenant_name}</h3><p>{tenant.subdomain} • {tenant.subscription?.plan_name || 'بدون باقة'}</p></div><StatusBadge value={tenant.subscription?.effective_status} /></div>
        <div className="subscription-grid"><div><small>انتهاء الاشتراك</small><b>{date(tenant.subscription?.ends_at)}</b></div><div><small>الأيام المتبقية</small><b>{tenant.subscription?.days_remaining ?? '—'}</b></div><div><small>Auto Suspend</small><b>{tenant.subscription?.auto_suspend ? 'مفعل' : 'متوقف'}</b></div></div>
        <div className="usage-grid"><Usage label="الفروع" metric={tenant.usage?.branches} /><Usage label="المستخدمون" metric={tenant.usage?.users} /><Usage label="المنتجات" metric={tenant.usage?.products} /></div>
        <div className="control-grid">{controls.map(c => <button key={c[0]} className={`control ${tenant[c[0]] ? 'on' : 'off'}`} onClick={() => toggle(tenant, c)} disabled={busy}><span><b>{c[2]}</b><small>{c[3]}</small></span><i /></button>)}</div>
        <div className="tenant-actions"><select value={planChoice[tenant.tenant_id] || ''} onChange={e => setPlanChoice({ ...planChoice, [tenant.tenant_id]: e.target.value })}><option value="">اختر باقة</option>{activePlans.map(p => <option key={p.id} value={p.id}>{p.name_ar}</option>)}</select><select value={cycleChoice[tenant.tenant_id] || 'monthly'} onChange={e => setCycleChoice({ ...cycleChoice, [tenant.tenant_id]: e.target.value as 'monthly' | 'yearly' })}><option value="monthly">شهري</option><option value="yearly">سنوي</option></select><button className="btn secondary" onClick={() => assignPlan(tenant)}>تعيين/تغيير الباقة</button>{tenant.subscription?.effective_status === 'suspended' ? <button className="btn success" onClick={() => setSubStatus(tenant, 'active')}>استرجاع الاشتراك</button> : <button className="btn danger" onClick={() => setSubStatus(tenant, 'suspended')}>إيقاف الاشتراك</button>}</div>
      </article>)}</div></section>
    </main>
    {dashboard && planEditor && <PlanEditor initial={planEditor === 'new' ? undefined : planEditor} dashboard={dashboard} onClose={() => setPlanEditor(null)} onSave={savePlan} />}
  </div>;
}
