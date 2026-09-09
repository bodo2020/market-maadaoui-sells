import { supabase } from "@/integrations/supabase/client";

export type HrLeaveCalendarItem = {
  id: string;
  request_id: string;
  employee_id: string;
  employee_name: string;
  employee_code?: string | null;
  leave_type: "annual" | "casual" | "sick" | "unpaid" | "other";
  start_date: string;
  end_date: string;
  partial_day: "none" | "first_half" | "second_half";
  approved_at: string;
};

export type HrLeaveCalendarResponse = {
  branch_id: string;
  from: string;
  to: string;
  items: HrLeaveCalendarItem[];
  generated_at: string;
};

type RpcError = { message?: string } | null;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError }>;

export async function getHrLeaveCalendar(branchId: string, from: string, to: string): Promise<HrLeaveCalendarResponse> {
  const { data, error } = await rpc("get_hr_leave_calendar_v1", { p_branch_id: branchId, p_from: from, p_to: to });
  if (error) {
    const message = error.message || "";
    if (message.includes("HR_LEAVE_CALENDAR_DENIED")) throw new Error("ليس لديك صلاحية عرض تقويم إجازات الفرع.");
    if (message.includes("HR_INVALID_LEAVE_RANGE")) throw new Error("نطاق التاريخ غير صحيح أو أكبر من سنة.");
    throw new Error(message || "تعذر تحميل تقويم الإجازات.");
  }
  const raw = (data || {}) as Partial<HrLeaveCalendarResponse>;
  return {
    branch_id: String(raw.branch_id || branchId),
    from: String(raw.from || from),
    to: String(raw.to || to),
    items: Array.isArray(raw.items) ? raw.items : [],
    generated_at: String(raw.generated_at || new Date().toISOString()),
  };
}
