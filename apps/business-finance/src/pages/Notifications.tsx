import { useEffect, useState } from 'react';
import { BellRing, CheckCheck, CircleAlert, CircleCheck, RefreshCcw, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBusiness } from '../context/BusinessContext';
import { supabase } from '../lib/supabase';
import { fetchNotificationCenter, markAllNotificationsRead, markNotificationRead, type NotificationCenter, type NotificationFilter, type NotificationItem } from '../services/notifications';

const filters: Array<{ key: NotificationFilter; label: string }> = [
  { key: 'all', label: 'الكل' }, { key: 'critical', label: 'عاجل' }, { key: 'unread', label: 'غير مقروء' }, { key: 'action', label: 'يحتاج إجراء' },
];

export default function Notifications() {
  const { selectedBranch, identity } = useBusiness();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [data, setData] = useState<NotificationCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!selectedBranch) return;
    setLoading(true); setError(null);
    try { setData(await fetchNotificationCenter(selectedBranch.branch_id, filter)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل التنبيهات.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [selectedBranch, filter]);
  useEffect(() => {
    const api = supabase;
    if (!api || !identity?.user_id) return;
    const channel = api.channel(`business-notifications-${identity.user_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notification_realtime_signals_v2', filter: `recipient_user_id=eq.${identity.user_id}` }, () => void load())
      .subscribe();
    return () => { void api.removeChannel(channel); };
  }, [identity?.user_id, selectedBranch, filter]);

  async function read(item: NotificationItem) {
    if (!item.readAt) await markNotificationRead(item.id);
    setData((current) => current ? { ...current, summary: { ...current.summary, unread: Math.max(0, current.summary.unread - (item.readAt ? 0 : 1)) }, items: current.items.map((row) => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row) } : current);
  }

  async function readAll() {
    if (!selectedBranch) return;
    try { await markAllNotificationsRead(selectedBranch.branch_id); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحديث التنبيهات.'); }
  }

  return <div className="stack-lg">
    <section className="page-intro page-intro--with-actions"><div><span className="eyebrow">Notification Center</span><h2>تنبيهات تحتاج قرارًا</h2><p>تنبيهات حقيقية من المخزون والمهام والمالية والتحويلات، وتتحدث فور وصول حدث جديد.</p></div><button className="secondary-button" disabled={!data?.summary.unread} onClick={() => void readAll()}><CheckCheck size={17}/> قراءة الكل</button></section>

    {error && <section className="engine-banner"><div><strong>تعذر تحميل التنبيهات</strong><p>{error}</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCcw size={17}/> إعادة المحاولة</button></section>}

    <section className="notification-summary">
      <Summary label="غير مقروء" value={data?.summary.unread} loading={loading}/><Summary label="عاجل" value={data?.summary.critical} loading={loading}/><Summary label="يحتاج إجراء" value={data?.summary.actionRequired} loading={loading}/><Summary label="اليوم" value={data?.summary.today} loading={loading}/>
    </section>
    <section className="filter-pills">{filters.map((item) => <button type="button" key={item.key} className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>{item.label}</button>)}</section>
    <section className="notification-list">{loading ? [1,2,3].map((item) => <article className="notification-card" key={item}><div className="skeleton small"/><div><div className="skeleton wide"/><br/><div className="skeleton"/></div></article>) : data?.items.length ? data.items.map((item) => <NotificationRow item={item} onRead={read} key={item.id}/>) : <div className="section-card empty-data"><span>✓</span><p>لا توجد تنبيهات مطابقة للفِلتر الحالي.</p></div>}</section>
  </div>;
}

function NotificationRow({ item, onRead }: { item: NotificationItem; onRead: (item: NotificationItem) => Promise<void> }) {
  const Icon = item.severity === 'critical' ? CircleAlert : item.status === 'resolved' ? CircleCheck : item.category === 'finance' ? WalletCards : BellRing;
  const href = categoryHref(item.category);
  const body = <><span className="notification-card__icon"><Icon size={20}/></span><div><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString('ar-EG')}{item.status === 'resolved' ? ' · تم الحل' : item.requiresAction ? ' · يحتاج إجراء' : ''}</small></div>{!item.readAt && <span className="unread-dot" aria-label="غير مقروء"/>}</>;
  return href ? <Link to={href} className={`notification-card notification-card--${item.severity} ${item.readAt ? '' : 'notification-card--unread'}`} onClick={() => void onRead(item)}>{body}</Link> : <button type="button" className={`notification-card notification-card--${item.severity} ${item.readAt ? '' : 'notification-card--unread'}`} onClick={() => void onRead(item)}>{body}</button>;
}

function Summary({ label, value, loading }: { label: string; value?: number; loading: boolean }) { return <article><span>{label}</span><strong>{loading ? '…' : (value || 0).toLocaleString('ar-EG')}</strong></article>; }
function categoryHref(category: string) {
  if (category === 'inventory') return '/reports/inventory';
  if (category === 'inventory_transfers') return '/reports/transfers';
  if (category === 'finance') return '/finance';
  if (category === 'returns') return '/reports/returns';
  if (category === 'orders') return '/reports/online';
  return null;
}
