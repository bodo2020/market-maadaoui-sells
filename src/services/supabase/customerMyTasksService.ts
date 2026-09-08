import { supabase } from "@/integrations/supabase/client";

export type MyCustomerFollowupTask = {
  interaction_id: string;
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  membership_number: string | null;
  management_status: "active" | "watch" | "blocked" | string;
  type: "call" | "whatsapp" | "email" | "meeting" | string;
  subject: string;
  description: string | null;
  priority: "low" | "medium" | "high" | string;
  scheduled_at: string;
  created_at: string;
  branch_id: string | null;
  overdue_hours: number;
  bucket: "overdue" | "today" | "upcoming";
};

export type MyCustomerFollowupInbox = {
  staff_id: string;
  branch_id: string | null;
  upcoming_days: number;
  summary: {
    overdue: number;
    today: number;
    upcoming: number;
    high_priority: number;
    total: number;
  };
  overdue: MyCustomerFollowupTask[];
  today: MyCustomerFollowupTask[];
  upcoming: MyCustomerFollowupTask[];
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function mapError(message?: string) {
  if (message?.includes("CUSTOMER_MANAGE_DENIED")) return new Error("ليس لديك صلاحية إدارة متابعات العملاء في هذا الفرع.");
  if (message?.includes("FOLLOWUP_BRANCH_SCOPE_DENIED")) return new Error("الفرع الحالي خارج نطاق صلاحيتك.");
  if (message?.includes("AUTH_REQUIRED")) return new Error("انتهت جلسة تسجيل الدخول.");
  return new Error(message || "تعذر تحميل مهام العملاء.");
}

export async function fetchMyCustomerFollowupInbox(branchId?: string | null, upcomingDays = 14): Promise<MyCustomerFollowupInbox> {
  const { data, error } = await rpc("get_my_customer_followup_inbox", {
    p_branch_id: branchId || null,
    p_upcoming_days: upcomingDays,
  });
  if (error) throw mapError(error.message);
  return data as MyCustomerFollowupInbox;
}
