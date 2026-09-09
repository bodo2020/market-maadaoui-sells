import { supabase } from "@/integrations/supabase/client";

export type NotificationAudienceV2 = "staff" | "customer";
export type NotificationSeverityV2 = "critical" | "high" | "normal" | "info";
export type NotificationStatusV2 = "active" | "resolved";
export type NotificationFilterV2 = "all" | "unread" | "critical" | "action";

export interface NotificationCenterItemV2 {
  id: string;
  audience: NotificationAudienceV2;
  branch_id: string | null;
  event_key: string;
  category: string;
  severity: NotificationSeverityV2;
  title: string;
  body: string;
  source_kind: string;
  source_id: string | null;
  action_url: string | null;
  action_label: string | null;
  requires_action: boolean;
  eligible_channels: string[];
  status: NotificationStatusV2;
  seen_at: string | null;
  read_at: string | null;
  resolved_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface NotificationCenterSummaryV2 {
  total: number;
  unread: number;
  critical: number;
  action_required: number;
  today: number;
}

export interface NotificationCenterV2 {
  version: number;
  generated_at: string;
  branch_id: string | null;
  filter: NotificationFilterV2;
  category: string | null;
  summary: NotificationCenterSummaryV2;
  items: NotificationCenterItemV2[];
}

export interface NotificationPreferencesV2 {
  customer_id: string | null;
  in_app_enabled: boolean;
  push_enabled: boolean;
  whatsapp_transactional_enabled: boolean;
  whatsapp_marketing_opt_in: boolean;
  whatsapp_marketing_opt_in_at: string | null;
  whatsapp_marketing_opt_in_source: string | null;
  email_enabled: boolean;
  marketing_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

const numberValue = (value: unknown) => Number(value || 0);
const textValue = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

function normalizeItem(raw: any): NotificationCenterItemV2 {
  return {
    id: textValue(raw?.id),
    audience: raw?.audience === "customer" ? "customer" : "staff",
    branch_id: typeof raw?.branch_id === "string" ? raw.branch_id : null,
    event_key: textValue(raw?.event_key),
    category: textValue(raw?.category, "system"),
    severity: ["critical", "high", "normal", "info"].includes(raw?.severity) ? raw.severity : "normal",
    title: textValue(raw?.title, "إشعار جديد"),
    body: textValue(raw?.body),
    source_kind: textValue(raw?.source_kind),
    source_id: typeof raw?.source_id === "string" ? raw.source_id : null,
    action_url: typeof raw?.action_url === "string" ? raw.action_url : null,
    action_label: typeof raw?.action_label === "string" ? raw.action_label : null,
    requires_action: Boolean(raw?.requires_action),
    eligible_channels: Array.isArray(raw?.eligible_channels) ? raw.eligible_channels.filter((value: unknown) => typeof value === "string") : ["in_app"],
    status: raw?.status === "resolved" ? "resolved" : "active",
    seen_at: typeof raw?.seen_at === "string" ? raw.seen_at : null,
    read_at: typeof raw?.read_at === "string" ? raw.read_at : null,
    resolved_at: typeof raw?.resolved_at === "string" ? raw.resolved_at : null,
    metadata: raw?.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
    created_at: textValue(raw?.created_at),
    updated_at: textValue(raw?.updated_at),
  };
}

export async function syncNotificationCenterV2(branchId?: string | null) {
  const { data, error } = await (supabase as any).rpc("sync_my_notification_center_v2", {
    p_branch_id: branchId || null,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function fetchNotificationCenterV2(
  branchId?: string | null,
  filter: NotificationFilterV2 = "all",
  category?: string | null,
  limit = 100,
): Promise<NotificationCenterV2> {
  await syncNotificationCenterV2(branchId);
  const { data, error } = await (supabase as any).rpc("get_my_notification_center_v2", {
    p_branch_id: branchId || null,
    p_filter: filter,
    p_category: category || null,
    p_limit: limit,
  });
  if (error) throw error;
  const raw: any = data || {};
  const summary = raw.summary || {};
  return {
    version: numberValue(raw.version) || 2,
    generated_at: textValue(raw.generated_at),
    branch_id: typeof raw.branch_id === "string" ? raw.branch_id : null,
    filter,
    category: typeof raw.category === "string" ? raw.category : null,
    summary: {
      total: numberValue(summary.total),
      unread: numberValue(summary.unread),
      critical: numberValue(summary.critical),
      action_required: numberValue(summary.action_required),
      today: numberValue(summary.today),
    },
    items: Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [],
  };
}

export async function markNotificationReadV2(notificationId: string) {
  const { data, error } = await (supabase as any).rpc("mark_notification_read_v2", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function markAllNotificationsReadV2(branchId?: string | null) {
  const { data, error } = await (supabase as any).rpc("mark_all_notifications_read_v2", {
    p_branch_id: branchId || null,
  });
  if (error) throw error;
  return Number(data || 0);
}

export async function fetchMyNotificationPreferencesV2(): Promise<NotificationPreferencesV2> {
  const { data, error } = await (supabase as any).rpc("get_my_notification_preferences_v2");
  if (error) throw error;
  return data as NotificationPreferencesV2;
}

export async function updateMyNotificationPreferencesV2(input: Partial<{
  in_app_enabled: boolean;
  push_enabled: boolean;
  whatsapp_transactional_enabled: boolean;
  whatsapp_marketing_opt_in: boolean;
  whatsapp_marketing_opt_in_source: string;
  email_enabled: boolean;
  marketing_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}>): Promise<NotificationPreferencesV2> {
  const { data, error } = await (supabase as any).rpc("set_my_notification_preferences_v2", {
    p_in_app_enabled: input.in_app_enabled ?? null,
    p_push_enabled: input.push_enabled ?? null,
    p_whatsapp_transactional_enabled: input.whatsapp_transactional_enabled ?? null,
    p_whatsapp_marketing_opt_in: input.whatsapp_marketing_opt_in ?? null,
    p_whatsapp_marketing_opt_in_source: input.whatsapp_marketing_opt_in_source ?? null,
    p_email_enabled: input.email_enabled ?? null,
    p_marketing_enabled: input.marketing_enabled ?? null,
    p_quiet_hours_enabled: input.quiet_hours_enabled ?? null,
    p_quiet_hours_start: input.quiet_hours_start ?? null,
    p_quiet_hours_end: input.quiet_hours_end ?? null,
  });
  if (error) throw error;
  return data as NotificationPreferencesV2;
}
