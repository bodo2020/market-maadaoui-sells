import { supabase } from "@/integrations/supabase/client";

export type NotificationCampaignAudienceV2 = "staff_branch" | "customers_all";
export type NotificationCampaignChannelV2 = "in_app" | "push" | "whatsapp" | "email";

export interface NotificationAudiencePreviewV2 {
  audience_type: NotificationCampaignAudienceV2;
  branch_id: string | null;
  total: number;
  in_app_eligible: number;
  push_eligible: number;
  push_sender_ready: boolean;
  whatsapp_marketing_eligible: number;
  whatsapp_sender_ready: boolean;
}

export interface NotificationCampaignResultV2 {
  campaign_id: string;
  recipient_count: number;
  in_app_created: number;
  push_queued: number;
  whatsapp_eligible_suppressed: number;
  whatsapp_sender_ready: boolean;
}

export interface SendNotificationCampaignV2Input {
  audienceType: NotificationCampaignAudienceV2;
  branchId?: string | null;
  title: string;
  body: string;
  category?: string;
  severity?: "critical" | "high" | "normal" | "info";
  actionUrl?: string | null;
  actionLabel?: string | null;
  channels?: NotificationCampaignChannelV2[];
  deliveryType?: "transactional" | "marketing";
}

export async function canSendNotificationsV2(branchId?: string | null): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc("can_send_notifications_v2", {
    p_branch_id: branchId || null,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function previewNotificationAudienceV2(
  audienceType: NotificationCampaignAudienceV2,
  branchId?: string | null,
): Promise<NotificationAudiencePreviewV2> {
  const { data, error } = await (supabase as any).rpc("preview_notification_audience_v2", {
    p_audience_type: audienceType,
    p_branch_id: branchId || null,
  });
  if (error) throw error;
  const raw: any = data || {};
  return {
    audience_type: audienceType,
    branch_id: typeof raw.branch_id === "string" ? raw.branch_id : null,
    total: Number(raw.total || 0),
    in_app_eligible: Number(raw.in_app_eligible || 0),
    push_eligible: Number(raw.push_eligible || 0),
    push_sender_ready: Boolean(raw.push_sender_ready),
    whatsapp_marketing_eligible: Number(raw.whatsapp_marketing_eligible || 0),
    whatsapp_sender_ready: Boolean(raw.whatsapp_sender_ready),
  };
}

export async function sendNotificationCampaignV2(input: SendNotificationCampaignV2Input): Promise<NotificationCampaignResultV2> {
  const { data, error } = await (supabase as any).rpc("send_notification_campaign_v2", {
    p_audience_type: input.audienceType,
    p_branch_id: input.branchId || null,
    p_title: input.title,
    p_body: input.body,
    p_category: input.category || "system",
    p_severity: input.severity || "normal",
    p_action_url: input.actionUrl || null,
    p_action_label: input.actionLabel || null,
    p_channels: input.channels?.length ? input.channels : ["in_app"],
    p_delivery_type: input.deliveryType || (input.audienceType === "customers_all" ? "marketing" : "transactional"),
  });
  if (error) throw error;
  const raw: any = data || {};
  return {
    campaign_id: String(raw.campaign_id || ""),
    recipient_count: Number(raw.recipient_count || 0),
    in_app_created: Number(raw.in_app_created || 0),
    push_queued: Number(raw.push_queued || 0),
    whatsapp_eligible_suppressed: Number(raw.whatsapp_eligible_suppressed || 0),
    whatsapp_sender_ready: Boolean(raw.whatsapp_sender_ready),
  };
}
