import { supabase } from '../lib/supabase';
import { explainRpcError } from './businessFinance';

export type NotificationFilter = 'all' | 'critical' | 'unread' | 'action';
export type NotificationSeverity = 'critical' | 'high' | 'normal' | 'info';

export type NotificationItem = {
  id: string;
  category: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  requiresAction: boolean;
  status: 'active' | 'resolved';
  readAt: string | null;
  createdAt: string;
};

export type NotificationCenter = {
  summary: { total: number; unread: number; critical: number; actionRequired: number; today: number };
  items: NotificationItem[];
};

function client() {
  if (!supabase) throw new Error('إعدادات Supabase غير موجودة.');
  return supabase;
}

const n = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; };
const s = (value: unknown, fallback = '') => value == null || value === '' ? fallback : String(value);
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function fetchNotificationCenter(branchId: string, filter: NotificationFilter): Promise<NotificationCenter> {
  const api = client();
  const sync = await api.rpc('sync_my_notification_center_v2', { p_branch_id: branchId });
  if (sync.error) throw explainRpcError(sync.error.message);
  const result = await api.rpc('get_my_notification_center_v2', { p_branch_id: branchId, p_filter: filter, p_category: null, p_limit: 150 });
  if (result.error) throw explainRpcError(result.error.message);
  const raw = record(result.data);
  const summary = record(raw.summary);
  const items = Array.isArray(raw.items) ? raw.items.map(record) : [];
  return {
    summary: { total: n(summary.total), unread: n(summary.unread), critical: n(summary.critical), actionRequired: n(summary.action_required), today: n(summary.today) },
    items: items.map((item) => ({
      id: s(item.id), category: s(item.category, 'system'),
      severity: ['critical', 'high', 'normal', 'info'].includes(s(item.severity)) ? s(item.severity) as NotificationSeverity : 'normal',
      title: s(item.title, 'إشعار جديد'), body: s(item.body), requiresAction: Boolean(item.requires_action),
      status: item.status === 'resolved' ? 'resolved' : 'active', readAt: item.read_at ? s(item.read_at) : null,
      createdAt: s(item.created_at),
    })),
  };
}

export async function markNotificationRead(id: string) {
  const result = await client().rpc('mark_notification_read_v2', { p_notification_id: id });
  if (result.error) throw explainRpcError(result.error.message);
}

export async function markAllNotificationsRead(branchId: string) {
  const result = await client().rpc('mark_all_notifications_read_v2', { p_branch_id: branchId });
  if (result.error) throw explainRpcError(result.error.message);
  return n(result.data);
}
