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

export type NotificationTargetTypeV3 =
  | "staff_branch"
  | "staff_roles"
  | "staff_selected"
  | "customers_all"
  | "customers_selected";

export type NotificationTargetV3 =
  | { type: "staff_branch" }
  | { type: "staff_roles"; roles: string[] }
  | { type: "staff_selected"; user_ids: string[] }
  | { type: "customers_all" }
  | { type: "customers_selected"; customer_ids: string[] };

export interface NotificationRecipientOptionV3 {
  id: string;
  user_id: string;
  name: string;
  role?: string | null;
  phone?: string | null;
  management_status?: string | null;
  kind: "staff" | "customer";
}

export interface NotificationTargetPreviewV3 {
  target_type: NotificationTargetTypeV3;
  label: string;
  total: number;
  in_app_eligible: number;
  branch_id: string | null;
  in_app_primary: boolean;
}

export interface NotificationCampaignResultV3 {
  campaign_id: string;
  target_type: NotificationTargetTypeV3;
  recipient_count: number;
  in_app_created: number;
  in_app_primary: boolean;
}

export interface SendNotificationCampaignV3Input {
  target: NotificationTargetV3;
  branchId?: string | null;
  title: string;
  body: string;
  category?: string;
  severity?: "critical" | "high" | "normal" | "info";
  actionUrl?: string | null;
  actionLabel?: string | null;
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

export async function getNotificationRecipientOptionsV3(
  scope: "staff" | "customers",
  branchId?: string | null,
  search?: string,
): Promise<NotificationRecipientOptionV3[]> {
  const { data, error } = await (supabase as any).rpc("get_notification_recipient_options_v3", {
    p_scope: scope,
    p_branch_id: branchId || null,
    p_search: search?.trim() || null,
    p_limit: 200,
  });
  if (error) throw error;
  return Array.isArray(data?.items) ? data.items.map((item: any) => ({
    id: String(item.id || ""),
    user_id: String(item.user_id || ""),
    name: String(item.name || "بدون اسم"),
    role: typeof item.role === "string" ? item.role : null,
    phone: typeof item.phone === "string" ? item.phone : null,
    management_status: typeof item.management_status === "string" ? item.management_status : null,
    kind: item.kind === "customer" ? "customer" : "staff",
  })) : [];
}

export async function previewNotificationTargetV3(
  target: NotificationTargetV3,
  branchId?: string | null,
): Promise<NotificationTargetPreviewV3> {
  const { data, error } = await (supabase as any).rpc("preview_notification_target_v3", {
    p_target: target,
    p_branch_id: branchId || null,
  });
  if (error) throw error;
  const raw: any = data || {};
  return {
    target_type: (raw.target_type || target.type) as NotificationTargetTypeV3,
    label: String(raw.label || "المستلمون"),
    total: Number(raw.total || 0),
    in_app_eligible: Number(raw.in_app_eligible || 0),
    branch_id: typeof raw.branch_id === "string" ? raw.branch_id : null,
    in_app_primary: raw.in_app_primary !== false,
  };
}

export async function sendNotificationCampaignV3(input: SendNotificationCampaignV3Input): Promise<NotificationCampaignResultV3> {
  const { data, error } = await (supabase as any).rpc("send_notification_campaign_v3", {
    p_target: input.target,
    p_branch_id: input.branchId || null,
    p_title: input.title,
    p_body: input.body,
    p_category: input.category || "system",
    p_severity: input.severity || "normal",
    p_action_url: input.actionUrl || null,
    p_action_label: input.actionLabel || null,
  });
  if (error) throw error;
  const raw: any = data || {};
  return {
    campaign_id: String(raw.campaign_id || ""),
    target_type: (raw.target_type || input.target.type) as NotificationTargetTypeV3,
    recipient_count: Number(raw.recipient_count || 0),
    in_app_created: Number(raw.in_app_created || 0),
    in_app_primary: raw.in_app_primary !== false,
  };
}
