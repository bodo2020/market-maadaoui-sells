import { supabase } from "@/integrations/supabase/client";

export type PortalKind = "staff" | "partner" | "none" | "conflict";

export type PartnerMembership = {
  merchant_id: string;
  merchant_name: string;
  merchant_status: string;
  role: string;
};

export type PortalAccess = {
  kind: PortalKind;
  memberships: PartnerMembership[];
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

const noAccess: PortalAccess = { kind: "none", memberships: [] };

export async function resolvePortalAccess(): Promise<PortalAccess> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error("تعذر التحقق من جلسة الدخول");
  if (!sessionData.session) return noAccess;

  // The server verifies the session; neither local storage nor user metadata grants a portal.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("تعذر التحقق من جلسة الدخول");

  const [staff, partner] = await Promise.all([
    rpc("get_my_staff_identity"),
    rpc("get_my_partner_portal_identity_v2"),
  ]);
  if (staff.error) throw new Error("تعذر التحقق من صلاحية الموظف");
  if (partner.error && partner.error.message !== "PARTNER_PORTAL_ACCESS_REQUIRED") {
    throw new Error("تعذر التحقق من صلاحية الشريك");
  }

  const staffIdentity = staff.data as { user_id?: string; active?: boolean } | null;
  const partnerIdentity = partner.data as { user_id?: string; memberships?: PartnerMembership[] } | null;
  const isStaff = staffIdentity?.user_id === userData.user.id && staffIdentity.active !== false;
  const memberships = partnerIdentity?.user_id === userData.user.id && Array.isArray(partnerIdentity.memberships)
    ? partnerIdentity.memberships
    : [];
  const isPartner = memberships.length > 0;

  return {
    kind: isStaff && isPartner ? "conflict" : isStaff ? "staff" : isPartner ? "partner" : "none",
    memberships,
  };
}

export async function authenticatePartnerUser(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة");

  try {
    const access = await resolvePortalAccess();
    if (access.kind === "partner") return;
    if (access.kind === "staff") throw new Error("هذا حساب موظف. ادخل باسم المستخدم الخاص بالموظفين.");
    if (access.kind === "conflict") throw new Error("الحساب مرتبط بالنظامين. تواصل مع الإدارة لتحديد صلاحية واحدة.");
    throw new Error("هذا الحساب ليس له صلاحية دخول لمساحة الشركاء.");
  } catch (accessError) {
    await supabase.auth.signOut();
    throw accessError;
  }
}
