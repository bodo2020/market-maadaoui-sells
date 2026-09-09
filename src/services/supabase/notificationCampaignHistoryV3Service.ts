import { supabase } from "@/integrations/supabase/client";

export interface NotificationCampaignHistoryItemV3 {
  id: string;
  created_at: string;
  created_by: string;
  created_by_name: string;
  branch_id: string | null;
  audience_type: string;
  target_type: string;
  target_label: string;
  target: Record<string, unknown>;
  category: string;
  severity: "critical" | "high" | "normal" | "info";
  title: string;
  body: string;
  action_url: string | null;
  action_label: string | null;
  delivery_type: "transactional" | "marketing";
  status: string;
  recipient_count: number;
  created_count: number;
  read_count: number;
  unread_count: number;
  seen_count: number;
  actioned_count: number;
  read_rate: number;
}

export interface NotificationCampaignHistoryV3 {
  version: number;
  total: number;
  limit: number;
  offset: number;
  items: NotificationCampaignHistoryItemV3[];
}

export interface NotificationCampaignRecipientV3 {
  notification_id: string;
  recipient_user_id: string;
  audience: "staff" | "customer";
  recipient_name: string;
  recipient_role: string | null;
  read_at: string | null;
  seen_at: string | null;
  actioned_at: string | null;
  archived_at: string | null;
  status: string;
  created_at: string;
}

export interface NotificationCampaignDetailsV3 {
  version: number;
  campaign: NotificationCampaignHistoryItemV3;
  stats: {
    created_count: number;
    read_count: number;
    unread_count: number;
    seen_count: number;
    actioned_count: number;
    archived_count: number;
  };
  recipients: NotificationCampaignRecipientV3[];
}

export interface NotificationCampaignResendResultV3 {
  campaign_id: string;
  resend_of: string;
  resend_mode: "unread_only" | "same_recipients";
  recipient_count: number;
  in_app_created: number;
  in_app_primary: boolean;
}

export async function fetchNotificationCampaignHistoryV3(
  branchId: string | null,
  limit = 20,
  offset = 0,
): Promise<NotificationCampaignHistoryV3> {
  const { data, error } = await (supabase as any).rpc("get_notification_campaign_history_v3", {
    p_branch_id: branchId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  const raw: any = data || {};
  return {
    version: Number(raw.version || 3),
    total: Number(raw.total || 0),
    limit: Number(raw.limit || limit),
    offset: Number(raw.offset || offset),
    items: Array.isArray(raw.items) ? raw.items : [],
  };
}

export async function fetchNotificationCampaignDetailsV3(campaignId: string): Promise<NotificationCampaignDetailsV3> {
  const { data, error } = await (supabase as any).rpc("get_notification_campaign_details_v3", {
    p_campaign_id: campaignId,
  });
  if (error) throw error;
  return data as NotificationCampaignDetailsV3;
}

export async function resendNotificationCampaignV3(
  campaignId: string,
  unreadOnly = true,
): Promise<NotificationCampaignResendResultV3> {
  const { data, error } = await (supabase as any).rpc("resend_notification_campaign_v3", {
    p_campaign_id: campaignId,
    p_unread_only: unreadOnly,
  });
  if (error) throw error;
  const raw: any = data || {};
  return {
    campaign_id: String(raw.campaign_id || ""),
    resend_of: String(raw.resend_of || campaignId),
    resend_mode: raw.resend_mode === "same_recipients" ? "same_recipients" : "unread_only",
    recipient_count: Number(raw.recipient_count || 0),
    in_app_created: Number(raw.in_app_created || 0),
    in_app_primary: Boolean(raw.in_app_primary),
  };
}
