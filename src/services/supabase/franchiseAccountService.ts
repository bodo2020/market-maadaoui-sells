import { supabase } from "@/integrations/supabase/client";

export type FranchiseAccountRole = "owner" | "admin" | "manager";

export type FranchiseAccount = {
  user_id: string;
  role: string;
  portal_access: boolean;
  is_active: boolean;
  email: string | null;
  email_deliverable: boolean;
  account_kind: "internal_staff_link" | "franchise_email";
  email_confirmed_at: string | null;
  invited_at: string | null;
  last_sign_in_at: string | null;
  auth_created_at: string | null;
  auth_updated_at: string | null;
  active_session_count: number;
  last_session_at: string | null;
  last_user_agent: string | null;
  membership_created_at: string;
  membership_updated_at: string;
};

export type FranchiseAccountInvitation = {
  id: string;
  email: string;
  role: FranchiseAccountRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  auth_user_id: string | null;
  invited_by: string;
  invited_at: string;
  last_sent_at: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  delivery_kind: "invite" | "recovery" | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
};

export type FranchiseAccountEvent = {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  invitation_id: string | null;
  action: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type FranchiseAccountWorkspace = {
  merchant: { id: string; name: string; code: string; status: string };
  accounts: FranchiseAccount[];
  invitations: FranchiseAccountInvitation[];
  events: FranchiseAccountEvent[];
};

export type PendingFranchiseInvitation = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_code: string;
  role: FranchiseAccountRole;
  email: string;
  expires_at: string;
  invited_at: string;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

const roleLabels: Record<FranchiseAccountRole, string> = {
  owner: "مالك",
  admin: "مدير حساب",
  manager: "مدير تشغيل",
};

export function franchiseAccountRoleLabel(role: string) {
  return roleLabels[role as FranchiseAccountRole] || role;
}

function friendly(message?: string | null) {
  const value = String(message || "");
  const map: Record<string, string> = {
    FRANCHISE_ACCOUNT_MANAGER_REQUIRED: "ليس لديك صلاحية لإدارة حسابات هذا الـFranchise.",
    FRANCHISE_ACCOUNT_ROLE_INVALID: "الدور المختار غير متاح.",
    FRANCHISE_ACCOUNT_EMAIL_INVALID: "اكتب بريد إلكتروني صحيح.",
    FRANCHISE_ACCOUNT_EMAIL_NOT_DELIVERABLE: "هذا حساب موظف داخلي ولا يمكن إرسال بريد إليه. استخدم بريدًا حقيقيًا للمشغل.",
    FRANCHISE_ACCOUNT_ALREADY_MEMBER: "هذا البريد مرتبط بالفعل بحساب نشط في هذا الـFranchise.",
    FRANCHISE_ACCOUNT_MEMBERSHIP_INACTIVE: "الحساب موجود لكنه موقوف. استخدم إعادة التفعيل بدل إرسال دعوة جديدة.",
    FRANCHISE_INVITATION_NOT_FOUND: "الدعوة غير موجودة.",
    FRANCHISE_INVITATION_NOT_PENDING: "الدعوة لم تعد متاحة.",
    FRANCHISE_INVITATION_EXPIRED: "انتهت صلاحية الدعوة. اطلب دعوة جديدة.",
    FRANCHISE_INVITATION_EMAIL_MISMATCH: "الدعوة تخص بريدًا مختلفًا عن الحساب المفتوح.",
    FRANCHISE_LAST_OWNER_REQUIRED: "لا يمكن إيقاف أو تخفيض صلاحية آخر Owner نشط.",
    FRANCHISE_MEMBER_DISABLE_REASON_REQUIRED: "سبب إيقاف الحساب مطلوب.",
    FRANCHISE_MEMBER_NOT_PORTAL_ACCOUNT: "هذا الحساب ليس حساب Franchise Portal قابلًا للإدارة من هنا.",
    invitation_delivery_failed: "تم تسجيل الدعوة لكن تعذر إرسال رسالة البريد. حاول إعادة الإرسال.",
    password_reset_delivery_failed: "تعذر إرسال رسالة إعادة تعيين كلمة المرور.",
  };
  for (const [key, label] of Object.entries(map)) if (value.includes(key)) return label;
  return value || "تعذر تنفيذ العملية.";
}

async function invokeAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("franchise-account-admin", { body });
  if (error) {
    let message = error.message;
    try {
      if ((error as any).context && typeof (error as any).context.json === "function") {
        const payload = await (error as any).context.json();
        if (typeof payload?.error === "string") message = payload.error;
      }
    } catch {
      // Keep the transport error when the response is not JSON.
    }
    throw new Error(friendly(message));
  }
  if (data?.error) throw new Error(friendly(data.error));
  return data;
}

export async function fetchFranchiseAccounts(merchantId: string): Promise<FranchiseAccountWorkspace> {
  const { data, error } = await rpc("get_franchise_accounts_v1", { p_merchant_id: merchantId });
  if (error || !data) throw new Error(friendly(error?.message));
  return data as FranchiseAccountWorkspace;
}

export async function inviteFranchiseAccount(merchantId: string, email: string, role: FranchiseAccountRole) {
  return invokeAdmin({ action: "invite", merchant_id: merchantId, email, role });
}

export async function resendFranchiseInvitation(merchantId: string, email: string, role: FranchiseAccountRole) {
  return invokeAdmin({ action: "resend_invite", merchant_id: merchantId, email, role });
}

export async function sendFranchisePasswordReset(merchantId: string, targetUserId: string) {
  return invokeAdmin({ action: "reset_password", merchant_id: merchantId, target_user_id: targetUserId });
}

export async function revokeFranchiseInvitation(invitationId: string, reason?: string | null) {
  const { data, error } = await rpc("revoke_franchise_account_invitation_v1", {
    p_invitation_id: invitationId,
    p_reason: reason || null,
  });
  if (error) throw new Error(friendly(error.message));
  return data;
}

export async function updateFranchiseAccountRole(
  merchantId: string,
  userId: string,
  role: FranchiseAccountRole,
  reason?: string | null,
) {
  const { data, error } = await rpc("update_franchise_member_role_v1", {
    p_merchant_id: merchantId,
    p_user_id: userId,
    p_role: role,
    p_reason: reason || null,
  });
  if (error) throw new Error(friendly(error.message));
  return data;
}

export async function setFranchiseAccountActive(
  merchantId: string,
  userId: string,
  active: boolean,
  reason?: string | null,
) {
  const { data, error } = await rpc("set_franchise_member_active_v1", {
    p_merchant_id: merchantId,
    p_user_id: userId,
    p_active: active,
    p_reason: reason || null,
  });
  if (error) throw new Error(friendly(error.message));
  return data;
}

export async function fetchMyPendingFranchiseInvitations(): Promise<PendingFranchiseInvitation[]> {
  const { data, error } = await rpc("get_my_pending_franchise_invitations_v1");
  if (error) throw new Error(friendly(error.message));
  return (Array.isArray(data) ? data : []) as PendingFranchiseInvitation[];
}

export async function acceptMyFranchiseInvitation(invitationId: string) {
  const { data, error } = await rpc("accept_my_franchise_invitation_v1", { p_invitation_id: invitationId });
  if (error || !data) throw new Error(friendly(error?.message));
  return data as { merchant_id: string; merchant_name: string; role: FranchiseAccountRole; status: string };
}

export async function setFranchiseAccountPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message || "تعذر تعيين كلمة المرور.");
}
